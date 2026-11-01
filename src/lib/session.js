'use strict';

/**
 * Cookie de sesión y CSRF de Mostrador. Sin dependencias: sólo node:crypto y
 * los headers de la request.
 *
 * Decisiones:
 *  - La cookie lleva el token en claro, pero es httpOnly: ningún JS la lee.
 *    En la base queda sólo sha256(token) (ver services/auth.js).
 *  - SameSite=Lax alcanza para que un POST cross-site no mande la cookie;
 *    Secure se agrega únicamente si la request llegó por https (en local se
 *    prueba por http y una cookie Secure no viajaría).
 *  - El CSRF de las páginas sin sesión (login, registro) es un token random en
 *    una cookie httpOnly propia y en el campo oculto del formulario
 *    (double-submit). Con sesión, el token vive en la fila de users_sessions.
 */

const crypto = require('node:crypto');

const COOKIE_NAME = 'mostrador_sid';
const CSRF_COOKIE = 'mostrador_csrf';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// 32 bytes en base64url son 43 caracteres del alfabeto seguro para cookies.
const OPAQUE_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Parsea el header Cookie. Devuelve un objeto sin prototipo para que un
 * `__proto__=...` del cliente no contamine nada. Los pares rotos se ignoran.
 */
function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== 'string' || header.length === 0) return out;
  for (const par of header.split(';')) {
    const i = par.indexOf('=');
    if (i <= 0) continue;
    const nombre = par.slice(0, i).trim();
    if (!nombre) continue;
    let valor = par.slice(i + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) valor = valor.slice(1, -1);
    try {
      valor = decodeURIComponent(valor);
    } catch {
      // valor con % mal escapado: lo dejamos tal cual vino
    }
    if (nombre === '__proto__' || nombre === 'constructor' || nombre === 'prototype') continue;
    out[nombre] = valor;
  }
  return out;
}

/**
 * Arma un Set-Cookie. El valor se valida contra el alfabeto permitido: si no
 * cumple, tira, porque un `\r\n` ahí sería inyección de headers.
 */
function serializeCookie(nombre, valor, {
  maxAgeMs = MAX_AGE_MS,
  secure = false,
  httpOnly = true,
  sameSite = 'Lax',
  path = '/',
} = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(String(nombre))) throw new TypeError(`nombre de cookie inválido: ${nombre}`);
  if (!OPAQUE_RE.test(String(valor))) throw new TypeError('valor de cookie inválido');
  const partes = [`${nombre}=${valor}`, `Path=${path}`];
  if (httpOnly) partes.push('HttpOnly');
  if (sameSite) partes.push(`SameSite=${sameSite}`);
  if (maxAgeMs === 0) {
    partes.push('Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  } else if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
    partes.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
    partes.push(`Expires=${new Date(Date.now() + maxAgeMs).toUTCString()}`);
  }
  if (secure) partes.push('Secure');
  return partes.join('; ');
}

/** true si la request llegó por https (directo o por el nginx de adelante). */
function isSecureRequest(req) {
  if (!req) return false;
  if (req.secure) return true;
  const proto = req.headers && req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

/** Token de sesión de la cookie, o null si no está / no tiene forma válida. */
function readSessionToken(req) {
  const valor = parseCookies(req && req.headers && req.headers.cookie)[COOKIE_NAME];
  return typeof valor === 'string' && OPAQUE_RE.test(valor) ? valor : null;
}

function setSessionCookie(res, token, { secure = false, maxAgeMs = MAX_AGE_MS } = {}) {
  res.append('Set-Cookie', serializeCookie(COOKIE_NAME, token, { secure, maxAgeMs }));
}

function clearSessionCookie(res, { secure = false } = {}) {
  res.append('Set-Cookie', serializeCookie(COOKIE_NAME, 'x'.repeat(43), { secure, maxAgeMs: 0 }));
}

// --- CSRF -------------------------------------------------------------------

/** Token CSRF de visitante ya emitido, o null. */
function readCsrfCookie(req) {
  const valor = parseCookies(req && req.headers && req.headers.cookie)[CSRF_COOKIE];
  return typeof valor === 'string' && OPAQUE_RE.test(valor) ? valor : null;
}

/**
 * Devuelve el CSRF de visitante y lo emite si todavía no existe. Sólo se usa en
 * páginas sin sesión (login, registro); con sesión manda el de users_sessions.
 */
function ensureCsrfCookie(req, res) {
  const existente = readCsrfCookie(req);
  if (existente) return existente;
  const token = crypto.randomBytes(32).toString('base64url');
  res.append('Set-Cookie', serializeCookie(CSRF_COOKIE, token, { secure: isSecureRequest(req), maxAgeMs: MAX_AGE_MS }));
  return token;
}

function clearCsrfCookie(res, { secure = false } = {}) {
  res.append('Set-Cookie', `${CSRF_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`);
}

/** Comparación en tiempo constante, tolerante a tipos y largos distintos. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** true si el campo oculto del formulario coincide con el token esperado. */
function verifyCsrf(expected, received) {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof received !== 'string' || received.length !== expected.length) return false;
  return safeEqual(expected, received);
}

module.exports = {
  COOKIE_NAME,
  CSRF_COOKIE,
  MAX_AGE_MS,
  parseCookies,
  serializeCookie,
  isSecureRequest,
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
  readCsrfCookie,
  ensureCsrfCookie,
  clearCsrfCookie,
  verifyCsrf,
  safeEqual,
};
