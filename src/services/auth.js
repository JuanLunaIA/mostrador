'use strict';

/**
 * Primitivas de cuentas de usuario de Mostrador.
 *
 * IMPORTANTE: este módulo NO está conectado a app.js ni a ninguna ruta.
 * Todo acceso a la base está detrás de AUTH_ENABLED (apagado por defecto).
 * El schema vive aparte (src/schema_users.sql) y se aplica sólo si alguien
 * llama explícitamente a applySchema(db).
 *
 * Reglas del proyecto que se respetan acá:
 *  - SQL con parámetros posicionales `?` (ADR-001), nunca nombrados.
 *  - Tablas con prefijo `users_` para no tocar las existentes.
 *  - Cero dependencias nuevas: scrypt sale de node:crypto.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_PATH = path.join(__dirname, '..', 'schema_users.sql');

// Parámetros de scrypt. N=2^15, r=8, p=1 es un costo razonable para un
// servidor chico: ~30-80 ms por hash, 32 MiB de memoria por derivación.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

// Una sesión dura 7 días desde que se emite. El token en claro se devuelve
// una sola vez; en la base queda únicamente su sha256.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const MAX_PASSWORD_BYTES = 1024;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

function isEnabled(env = process.env) {
  return String(env.AUTH_ENABLED || '').toLowerCase() === 'true';
}

function assertEnabled() {
  if (!isEnabled()) {
    throw new AuthError(
      'AUTH_DISABLED',
      'Cuentas de usuario apagadas: definí AUTH_ENABLED=true para habilitarlas.',
    );
  }
}

/** Aplica src/schema_users.sql. Idempotente (CREATE TABLE IF NOT EXISTS). */
function applySchema(db) {
  if (!db || typeof db.exec !== 'function') throw new TypeError('applySchema(db): falta un handle de base');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

function normalizeEmail(email) {
  if (typeof email !== 'string') throw new AuthError('INVALID_EMAIL', 'El email es obligatorio.');
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0 || normalized.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(normalized)) {
    throw new AuthError('INVALID_EMAIL', 'Email inválido.');
  }
  return normalized;
}

function validatePasswordInput(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new AuthError('INVALID_PASSWORD', 'La contraseña es obligatoria.');
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new AuthError('INVALID_PASSWORD', `La contraseña no puede superar ${MAX_PASSWORD_BYTES} bytes.`);
  }
}

/**
 * Hash de contraseña con scrypt y salt aleatorio por usuario.
 * Formato: scrypt$N$r$p$keylen$saltB64url$hashB64url
 */
function hashPassword(password, params = {}) {
  validatePasswordInput(password);
  const N = params.N || SCRYPT_N;
  const r = params.r || SCRYPT_R;
  const p = params.p || SCRYPT_P;
  const keylen = params.keylen || SCRYPT_KEYLEN;
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const hash = crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem: SCRYPT_MAXMEM });
  return ['scrypt', N, r, p, keylen, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

/**
 * Verifica una contraseña contra un hash guardado.
 * Nunca tira por un hash corrupto: devuelve false. La comparación es
 * timingSafeEqual para no filtrar información por tiempo.
 */
function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || password.length === 0) return false;
  if (typeof storedHash !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const keylen = Number(parts[4]);
  const sane =
    Number.isInteger(N) && N >= 16384 && N <= 1048576 && (N & (N - 1)) === 0 &&
    Number.isInteger(r) && r >= 1 && r <= 32 &&
    Number.isInteger(p) && p >= 1 && p <= 16 &&
    Number.isInteger(keylen) && keylen >= 16 && keylen <= 128;
  if (!sane) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[5], 'base64url');
    expected = Buffer.from(parts[6], 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== keylen) return false;

  let actual;
  try {
    actual = crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem: SCRYPT_MAXMEM });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function publicUser(row) {
  return { id: Number(row.id), email: row.email, nombre: row.nombre, createdAt: row.created_at };
}

function findUserRowByEmail(db, email) {
  return db.prepare('select id, email, nombre, password_hash, created_at, disabled_at from users_users where email = ?').get(email);
}

function findUserByEmail(db, email) {
  assertEnabled();
  const row = findUserRowByEmail(db, normalizeEmail(email));
  return row ? publicUser(row) : null;
}

function createUser(db, { email, password, nombre = null } = {}) {
  assertEnabled();
  const normalizedEmail = normalizeEmail(email);
  validatePasswordInput(password);
  if (nombre !== null && (typeof nombre !== 'string' || nombre.trim().length > 120)) {
    throw new AuthError('INVALID_NAME', 'Nombre inválido.');
  }

  if (findUserRowByEmail(db, normalizedEmail)) {
    throw new AuthError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
  }

  const passwordHash = hashPassword(password);
  const createdAt = new Date().toISOString();
  let result;
  try {
    result = db.prepare('insert into users_users (email, nombre, password_hash, created_at) values (?,?,?,?)')
      .run(normalizedEmail, nombre ? nombre.trim() : null, passwordHash, createdAt);
  } catch (err) {
    // Carrera entre el select y el insert: el UNIQUE de la base es la verdad.
    if (String(err && err.message).includes('UNIQUE')) {
      throw new AuthError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
    }
    throw err;
  }

  return {
    id: Number(result.lastInsertRowid),
    email: normalizedEmail,
    nombre: nombre ? nombre.trim() : null,
    createdAt,
  };
}

/**
 * Emite una sesión. Devuelve el token EN CLARO por única vez.
 * En users_sessions sólo se guarda sha256(token).
 */
function createSession(db, userId, { ttlMs = SESSION_TTL_MS, now = Date.now(), userAgent = null } = {}) {
  assertEnabled();
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AuthError('INVALID_USER', 'userId inválido.');
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new AuthError('INVALID_TTL', 'ttlMs debe ser un número positivo.');
  }

  const user = db.prepare('select id from users_users where id = ? and disabled_at is null').get(userId);
  if (!user) throw new AuthError('USER_NOT_FOUND', 'No existe el usuario.');

  const token = crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const agent = typeof userAgent === 'string' ? userAgent.slice(0, 255) : null;

  db.prepare('insert into users_sessions (token_hash, user_id, created_at, expires_at, user_agent) values (?,?,?,?,?)')
    .run(hashToken(token), userId, createdAt, expiresAt, agent);

  return { token, expiresAt };
}

/**
 * Devuelve el usuario dueño de una sesión válida, o null si el token no
 * existe, está vencido, fue revocado o el usuario está deshabilitado.
 */
function validateSession(db, token, { now = Date.now() } = {}) {
  assertEnabled();
  if (typeof token !== 'string' || !SESSION_TOKEN_RE.test(token)) return null;

  const row = db.prepare(`
    select s.token_hash, s.expires_at, s.revoked_at,
           u.id, u.email, u.nombre, u.created_at, u.disabled_at
      from users_sessions s
      join users_users u on u.id = s.user_id
     where s.token_hash = ?
  `).get(hashToken(token));

  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (row.disabled_at !== null) return null;
  if (Date.parse(row.expires_at) <= now) return null;

  return publicUser(row);
}

/** Revoca una sesión. Devuelve true si efectivamente la cerró. */
function revokeSession(db, token, { now = Date.now() } = {}) {
  assertEnabled();
  if (typeof token !== 'string' || !SESSION_TOKEN_RE.test(token)) return false;
  const result = db.prepare('update users_sessions set revoked_at = ? where token_hash = ? and revoked_at is null')
    .run(new Date(now).toISOString(), hashToken(token));
  return Number(result.changes) > 0;
}

module.exports = {
  AuthError,
  SCHEMA_PATH,
  SESSION_TTL_MS,
  isEnabled,
  applySchema,
  hashPassword,
  verifyPassword,
  hashToken,
  createUser,
  findUserByEmail,
  createSession,
  validateSession,
  revokeSession,
};
