'use strict';

/**
 * Reglas de negocio de las cuentas de usuario: registro, login, cambio de
 * perfil/contraseña y "mis presupuestos". Las primitivas (scrypt, sesiones,
 * SQL de users_*) viven en services/auth.js; acá sólo se combinan.
 *
 * Todo el SQL usa parámetros posicionales `?` (ADR-001) y nada de esto se
 * ejecuta con AUTH_ENABLED apagado: auth.createUser y compañía tiran
 * AUTH_DISABLED, así que el módulo es inerte fuera del flag.
 */

const auth = require('./auth');

const MIN_PASSWORD_LENGTH = 8;
const MAX_NOMBRE_LENGTH = 120;
const MAX_PRESUPUESTOS = 50;

// Hash de relleno para que un email inexistente cueste lo mismo que uno real:
// sin esto, la respuesta rápida delata qué cuentas existen.
let hashRelleno = null;
function hashDeRelleno() {
  if (!hashRelleno) hashRelleno = auth.hashPassword('relleno-para-igualar-tiempos');
  return hashRelleno;
}

function validarPasswordNueva(password, repetida) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new auth.AuthError('PASSWORD_REQUERIDA', 'Elegí una contraseña.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new auth.AuthError('PASSWORD_CORTA', `La contraseña tiene que tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new auth.AuthError('PASSWORD_LARGA', 'La contraseña es demasiado larga.');
  }
  if (typeof repetida === 'string' && password !== repetida) {
    throw new auth.AuthError('PASSWORD_DISTINTA', 'Las dos contraseñas no coinciden.');
  }
}

function limpiarNombre(nombre) {
  if (typeof nombre !== 'string') return null;
  const limpio = nombre.trim().slice(0, MAX_NOMBRE_LENGTH);
  return limpio.length ? limpio : null;
}

/**
 * Crea la cuenta. Valida largo mínimo y confirmación acá; el email único y el
 * hash quedan en auth.createUser (que también normaliza el email).
 */
function registrar(db, { email, password, password2, nombre = null } = {}) {
  auth.assertEnabled();
  validarPasswordNueva(password, password2);
  try {
    auth.normalizeEmail(email);
  } catch (err) {
    throw new auth.AuthError('EMAIL_INVALIDO', 'Ese email no parece válido. Fijate que tenga un solo @ y un dominio.');
  }
  return auth.createUser(db, { email, password, nombre: limpiarNombre(nombre) });
}

/**
 * Devuelve el usuario si email y contraseña están bien. Si algo falla tira
 * siempre el mismo error: no se le dice a nadie si el email existe o no.
 */
function autenticar(db, { email, password } = {}) {
  auth.assertEnabled();
  const invalidas = () => new auth.AuthError('CREDENCIALES', 'Email o contraseña incorrectos.');

  let normalizado;
  try {
    normalizado = auth.normalizeEmail(email);
  } catch {
    throw invalidas();
  }
  if (typeof password !== 'string' || password.length === 0) throw invalidas();

  const row = auth.findUserRowByEmail(db, normalizado);
  if (!row) {
    auth.verifyPassword(password, hashDeRelleno());
    throw invalidas();
  }
  if (row.disabled_at !== null) throw invalidas();
  if (!auth.verifyPassword(password, row.password_hash)) throw invalidas();

  return { id: Number(row.id), email: row.email, nombre: row.nombre, createdAt: row.created_at };
}

/** Cambia nombre y email. Acepta dejar el email como está. */
function actualizarPerfil(db, userId, { nombre, email } = {}) {
  auth.assertEnabled();
  let normalizado;
  try {
    normalizado = auth.normalizeEmail(email);
  } catch {
    throw new auth.AuthError('EMAIL_INVALIDO', 'Ese email no parece válido. Fijate que tenga un solo @ y un dominio.');
  }
  try {
    return auth.updateUserProfile(db, userId, { email: normalizado, nombre: limpiarNombre(nombre) });
  } catch (err) {
    if (err instanceof auth.AuthError && err.code === 'EMAIL_TAKEN') {
      throw new auth.AuthError('EMAIL_TOMADO', 'Ya hay otra cuenta con ese email. Probá con otro.');
    }
    if (err instanceof auth.AuthError && err.code === 'INVALID_NAME') {
      throw new auth.AuthError('NOMBRE_INVALIDO', 'El nombre no puede pasar de 120 caracteres.');
    }
    throw err;
  }
}

/**
 * Cambia la contraseña verificando la actual. Al terminar cierra el resto de
 * las sesiones abiertas de esa cuenta: si alguien más estaba adentro, se cae.
 * Devuelve cuántas sesiones se cerraron además de la actual.
 */
function cambiarPassword(db, userId, { actual, nueva, repetida, sesionToken } = {}) {
  auth.assertEnabled();
  const row = db.prepare('select password_hash from users_users where id = ?').get(userId);
  if (!row) throw new auth.AuthError('USER_NOT_FOUND', 'No existe el usuario.');

  if (!auth.verifyPassword(actual, row.password_hash)) {
    throw new auth.AuthError('PASSWORD_ACTUAL', 'La contraseña actual no es la correcta.');
  }
  validarPasswordNueva(nueva, repetida);
  if (nueva === actual) {
    throw new auth.AuthError('PASSWORD_IGUAL', 'La contraseña nueva tiene que ser distinta de la actual.');
  }

  auth.updatePasswordHash(db, userId, auth.hashPassword(nueva));
  const excepto = sesionToken ? auth.hashToken(sesionToken) : null;
  return auth.revokeUserSessions(db, userId, { exceptTokenHash: excepto });
}

/**
 * Presupuestos del usuario. Se vinculan por email del cliente porque `quotes`
 * no tiene dueño propio: es el email que el cliente dejó en el mensaje. El
 * join va contra users_users por id, así el filtro es por cuenta y no por un
 * string que venga del request.
 */
function misPresupuestos(db, userId, { limite = MAX_PRESUPUESTOS } = {}) {
  auth.assertEnabled();
  const filas = db.prepare(`
    select q.id, q.token, q.created_at, q.customer_name, q.customer_email,
           q.total_ars, q.status, q.ai_mode, q.items_json
      from quotes q
      join users_users u on lower(q.customer_email) = u.email
     where u.id = ?
     order by q.created_at desc, q.id desc
     limit ?
  `).all(userId, Math.max(1, Math.min(Number(limite) || MAX_PRESUPUESTOS, MAX_PRESUPUESTOS)));

  return filas.map((f) => {
    let items = 0;
    try {
      const parsed = JSON.parse(f.items_json);
      items = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      items = 0;
    }
    return {
      id: Number(f.id),
      token: f.token,
      fecha: f.created_at,
      cliente: f.customer_name,
      email: f.customer_email,
      totalArs: Number(f.total_ars),
      estado: f.status,
      modo: f.ai_mode,
      items,
    };
  });
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  registrar,
  autenticar,
  actualizarPerfil,
  cambiarPassword,
  misPresupuestos,
};
