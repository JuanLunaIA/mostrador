'use strict';

/**
 * Tests de las piezas nuevas de cuentas de usuario:
 *  - src/lib/session.js (cookie + CSRF), sin Express de por medio.
 *  - src/services/usuarios.js (registro, login, perfil, contraseña, presupuestos).
 *
 * El router no se levanta acá (app.js no exporta la app): ese camino se verifica
 * con curl contra una instancia local con AUTH_ENABLED=1 (ver README/entrega).
 */

const test = require('node:test');
const assert = require('node:assert');

delete process.env.AUTH_ENABLED;
process.env.DB_PATH = ':memory:';

const { db } = require('../src/db');
const auth = require('../src/services/auth');
const usuarios = require('../src/services/usuarios');
const session = require('../src/lib/session');

auth.applySchema(db);

const PASSWORD = 'clave-de-prueba-123';

function withEnabled(fn) {
  const previo = process.env.AUTH_ENABLED;
  process.env.AUTH_ENABLED = 'true';
  try {
    return fn();
  } finally {
    if (previo === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = previo;
  }
}

/** Response mínimo: junta los Set-Cookie como lo haría Express. */
function fakeRes() {
  const cookies = [];
  return {
    cookies,
    append(nombre, valor) {
      if (nombre !== 'Set-Cookie') throw new Error(`append inesperado: ${nombre}`);
      cookies.push(valor);
    },
    getHeader(nombre) {
      if (nombre === 'Set-Cookie') return cookies.length === 1 ? cookies[0] : cookies;
      return undefined;
    },
  };
}

function reqConCookie(cookie, headers = {}) {
  return { headers: { cookie, ...headers }, secure: false };
}

function nuevoUsuario(email, extra = {}) {
  return withEnabled(() => auth.createUser(db, { email, password: PASSWORD, ...extra }));
}

// --- cookie -----------------------------------------------------------------

test('parseCookies: varios pares, espacios, comillas y %-encoding', () => {
  const c = session.parseCookies(' a=1; b = dos ; c="tres"; d=%C3%B1; e');
  assert.strictEqual(c.a, '1');
  assert.strictEqual(c.b, 'dos');
  assert.strictEqual(c.c, 'tres');
  assert.strictEqual(c.d, 'ñ');
  assert.strictEqual(c.e, undefined, 'un par sin = se ignora');
});

test('parseCookies: header vacío o raro no rompe y no contamina el prototipo', () => {
  assert.deepStrictEqual({ ...session.parseCookies('') }, {});
  assert.deepStrictEqual({ ...session.parseCookies(undefined) }, {});
  assert.deepStrictEqual({ ...session.parseCookies(null) }, {});
  const c = session.parseCookies('__proto__=malo; constructor=x; ok=1; roto=%E0%A4%A');
  assert.strictEqual(c.ok, '1');
  assert.strictEqual(c.__proto__, undefined);
  assert.strictEqual({}.malo, undefined, 'no se tocó Object.prototype');
  assert.strictEqual(c.roto, '%E0%A4%A', 'un % mal escapado se deja tal cual');
});

test('serializeCookie: httpOnly, SameSite=Lax, Path y Max-Age de 7 días sin Secure en http', () => {
  const cookie = session.serializeCookie('mostrador_sid', 'a'.repeat(43));
  assert.match(cookie, /^mostrador_sid=a{43}; Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=604800/);
  assert.doesNotMatch(cookie, /Secure/, 'por http una cookie Secure no viajaría');
});

test('serializeCookie: Secure sólo cuando se pide, y valor inválido tira', () => {
  assert.match(session.serializeCookie('mostrador_sid', 'b'.repeat(43), { secure: true }), /; Secure$/);
  assert.throws(() => session.serializeCookie('mostrador_sid', 'b'.repeat(43) + '\r\nX: y'), TypeError);
  assert.throws(() => session.serializeCookie('mal nombre', 'b'.repeat(43)), TypeError);
  assert.throws(() => session.serializeCookie('mostrador_sid', 'corto'), TypeError);
});

test('isSecureRequest: directo por https o detrás de nginx con X-Forwarded-Proto', () => {
  assert.strictEqual(session.isSecureRequest({ headers: {}, secure: true }), true);
  assert.strictEqual(session.isSecureRequest({ headers: { 'x-forwarded-proto': 'https' } }), true);
  assert.strictEqual(session.isSecureRequest({ headers: { 'x-forwarded-proto': 'https, http' } }), true);
  assert.strictEqual(session.isSecureRequest({ headers: { 'x-forwarded-proto': 'http' } }), false);
  assert.strictEqual(session.isSecureRequest({ headers: {} }), false);
  assert.strictEqual(session.isSecureRequest(null), false);
});

test('readSessionToken: sólo acepta el token con forma de 32 bytes base64url', () => {
  const bueno = 'A'.repeat(43);
  assert.strictEqual(session.readSessionToken(reqConCookie(`mostrador_sid=${bueno}`)), bueno);
  assert.strictEqual(session.readSessionToken(reqConCookie('mostrador_sid=abc')), null);
  assert.strictEqual(session.readSessionToken(reqConCookie(`otra=${bueno}`)), null);
  assert.strictEqual(session.readSessionToken(reqConCookie('')), null);
  assert.strictEqual(session.readSessionToken({ headers: {} }), null);
});

test('setSessionCookie / clearSessionCookie: nombre mostrador_sid y borrado con Max-Age=0', () => {
  const res = fakeRes();
  session.setSessionCookie(res, 'z'.repeat(43), { secure: true });
  assert.match(res.cookies[0], /^mostrador_sid=z{43};/);
  assert.match(res.cookies[0], /Secure/);

  const res2 = fakeRes();
  session.clearSessionCookie(res2, {});
  assert.match(res2.cookies[0], /^mostrador_sid=/);
  assert.match(res2.cookies[0], /Max-Age=0/);
});

// --- CSRF -------------------------------------------------------------------

test('ensureCsrfCookie: emite una vez y después reusa la del request', () => {
  const res = fakeRes();
  const token = session.ensureCsrfCookie({ headers: {} }, res);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.strictEqual(res.cookies.length, 1);
  assert.match(res.cookies[0], /^mostrador_csrf=/);
  assert.match(res.cookies[0], /HttpOnly/);

  const res2 = fakeRes();
  const mismo = session.ensureCsrfCookie(reqConCookie(`mostrador_csrf=${token}`), res2);
  assert.strictEqual(mismo, token);
  assert.strictEqual(res2.cookies.length, 0, 'no vuelve a emitir cookie');
});

test('verifyCsrf: igualdad exacta, sin aceptar vacíos ni otros tipos', () => {
  const t = 'q'.repeat(43);
  assert.strictEqual(session.verifyCsrf(t, t), true);
  assert.strictEqual(session.verifyCsrf(t, 'q'.repeat(42) + 'r'), false);
  assert.strictEqual(session.verifyCsrf(t, 'q'.repeat(42)), false);
  assert.strictEqual(session.verifyCsrf(t, ''), false);
  assert.strictEqual(session.verifyCsrf(t, undefined), false);
  assert.strictEqual(session.verifyCsrf('', ''), false);
  assert.strictEqual(session.verifyCsrf(null, null), false);
});

test('la sesión trae su propio CSRF, distinto del token de sesión y estable', () => {
  withEnabled(() => {
    const user = nuevoUsuario('csrf@example.com');
    const { token, csrfToken } = auth.createSession(db, user.id);
    assert.match(csrfToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notStrictEqual(csrfToken, token);

    const encontrada = auth.getSession(db, token);
    assert.strictEqual(encontrada.user.id, user.id);
    assert.strictEqual(encontrada.csrfToken, csrfToken, 'se relee igual en cada request');
    assert.strictEqual(auth.validateSession(db, token).id, user.id);

    auth.revokeSession(db, token);
    assert.strictEqual(auth.getSession(db, token), null);
  });
});

// --- registro ---------------------------------------------------------------

test('registrar: crea la cuenta, normaliza el email y no guarda la contraseña', () => {
  withEnabled(() => {
    const user = usuarios.registrar(db, {
      email: '  Nueva@Example.COM ',
      password: PASSWORD,
      password2: PASSWORD,
      nombre: '  Ana  ',
    });
    assert.strictEqual(user.email, 'nueva@example.com');
    assert.strictEqual(user.nombre, 'Ana');

    const row = db.prepare('select password_hash from users_users where id = ?').get(user.id);
    assert.match(row.password_hash, /^scrypt\$/);
    assert.ok(!row.password_hash.includes(PASSWORD), 'la contraseña no se guarda en claro');
    assert.ok(auth.verifyPassword(PASSWORD, row.password_hash));
  });
});

test('registrar: contraseña corta, distinta o email repetido se rechazan con código', () => {
  withEnabled(() => {
    assert.throws(
      () => usuarios.registrar(db, { email: 'corta@example.com', password: 'corta12', password2: 'corta12' }),
      (err) => err.code === 'PASSWORD_CORTA',
    );
    assert.throws(
      () => usuarios.registrar(db, { email: 'distinta@example.com', password: PASSWORD, password2: PASSWORD + 'x' }),
      (err) => err.code === 'PASSWORD_DISTINTA',
    );
    usuarios.registrar(db, { email: 'repe@example.com', password: PASSWORD, password2: PASSWORD });
    assert.throws(
      () => usuarios.registrar(db, { email: 'REPE@example.com', password: PASSWORD, password2: PASSWORD }),
      (err) => err.code === 'EMAIL_TAKEN',
    );
    assert.throws(
      () => usuarios.registrar(db, { email: 'sin-arroba', password: PASSWORD, password2: PASSWORD }),
      (err) => err.code === 'EMAIL_INVALIDO',
    );
  });
});

// --- login ------------------------------------------------------------------

test('autenticar: la clave correcta entra; la incorrecta y el email inexistente dan el mismo error', () => {
  withEnabled(() => {
    const user = usuarios.registrar(db, { email: 'login@example.com', password: PASSWORD, password2: PASSWORD });

    const dentro = usuarios.autenticar(db, { email: ' Login@Example.com ', password: PASSWORD });
    assert.strictEqual(dentro.id, user.id);
    assert.strictEqual(dentro.password_hash, undefined);

    assert.throws(() => usuarios.autenticar(db, { email: 'login@example.com', password: 'otra-cosa' }), (err) => err.code === 'CREDENCIALES');
    assert.throws(() => usuarios.autenticar(db, { email: 'nadie@example.com', password: PASSWORD }), (err) => err.code === 'CREDENCIALES');
    assert.throws(() => usuarios.autenticar(db, { email: 'login@example.com', password: '' }), (err) => err.code === 'CREDENCIALES');
    assert.throws(() => usuarios.autenticar(db, { email: 'roto', password: PASSWORD }), (err) => err.code === 'CREDENCIALES');
  });
});

test('autenticar: un usuario deshabilitado no entra', () => {
  withEnabled(() => {
    const user = nuevoUsuario('off@example.com');
    db.prepare('update users_users set disabled_at = ? where id = ?').run(new Date().toISOString(), user.id);
    assert.throws(() => usuarios.autenticar(db, { email: 'off@example.com', password: PASSWORD }), (err) => err.code === 'CREDENCIALES');
  });
});

// --- perfil y contraseña ----------------------------------------------------

test('actualizarPerfil: cambia nombre y email; no deja pisar el email de otro', () => {
  withEnabled(() => {
    const uno = nuevoUsuario('perfil-uno@example.com', { nombre: 'Uno' });
    nuevoUsuario('perfil-dos@example.com');

    const actualizado = usuarios.actualizarPerfil(db, uno.id, { nombre: '  Uno Bis  ', email: 'perfil-uno@example.com' });
    assert.strictEqual(actualizado.nombre, 'Uno Bis');
    assert.strictEqual(actualizado.email, 'perfil-uno@example.com', 'mismo email propio, normalizado');

    const cambiado = usuarios.actualizarPerfil(db, uno.id, { nombre: 'Uno Bis', email: ' NUEVO@Example.com ' });
    assert.strictEqual(cambiado.email, 'nuevo@example.com');

    assert.throws(
      () => usuarios.actualizarPerfil(db, uno.id, { nombre: 'Uno', email: 'perfil-dos@example.com' }),
      (err) => err.code === 'EMAIL_TOMADO',
    );
    assert.throws(
      () => usuarios.actualizarPerfil(db, uno.id, { nombre: 'Uno', email: 'sin arroba' }),
      (err) => err.code === 'EMAIL_INVALIDO',
    );
  });
});

test('cambiarPassword: exige la actual, mínimo 8 y que la nueva sea distinta', () => {
  withEnabled(() => {
    const user = nuevoUsuario('clave@example.com');
    const { token } = auth.createSession(db, user.id);

    assert.throws(() => usuarios.cambiarPassword(db, user.id, { actual: 'mal', nueva: 'otra-clave-123', repetida: 'otra-clave-123' }), (err) => err.code === 'PASSWORD_ACTUAL');
    assert.throws(() => usuarios.cambiarPassword(db, user.id, { actual: PASSWORD, nueva: 'corta', repetida: 'corta' }), (err) => err.code === 'PASSWORD_CORTA');
    assert.throws(() => usuarios.cambiarPassword(db, user.id, { actual: PASSWORD, nueva: 'otra-clave-123', repetida: 'otra-clave-124' }), (err) => err.code === 'PASSWORD_DISTINTA');
    assert.throws(() => usuarios.cambiarPassword(db, user.id, { actual: PASSWORD, nueva: PASSWORD, repetida: PASSWORD }), (err) => err.code === 'PASSWORD_IGUAL');

    assert.ok(auth.verifyPassword(PASSWORD, auth.findUserRowByEmail(db, 'clave@example.com').password_hash), 'un intento fallido no cambia nada');
    assert.strictEqual(auth.validateSession(db, token).id, user.id);
  });
});

test('cambiarPassword: la sesión actual sigue viva y las demás se revocan', () => {
  withEnabled(() => {
    const user = nuevoUsuario('clave2@example.com');
    const actual = auth.createSession(db, user.id);
    const otra = auth.createSession(db, user.id);
    const tercera = auth.createSession(db, user.id);

    const cerradas = usuarios.cambiarPassword(db, user.id, {
      actual: PASSWORD,
      nueva: 'clave-nueva-456',
      repetida: 'clave-nueva-456',
      sesionToken: actual.token,
    });

    assert.strictEqual(cerradas, 2, 'las otras dos sesiones se cierran');
    assert.ok(auth.validateSession(db, actual.token), 'la sesión desde la que cambié sigue abierta');
    assert.strictEqual(auth.validateSession(db, otra.token), null);
    assert.strictEqual(auth.validateSession(db, tercera.token), null);
    assert.ok(usuarios.autenticar(db, { email: 'clave2@example.com', password: 'clave-nueva-456' }));
    assert.throws(() => usuarios.autenticar(db, { email: 'clave2@example.com', password: PASSWORD }), (err) => err.code === 'CREDENCIALES');
  });
});

// --- mis presupuestos -------------------------------------------------------

test('misPresupuestos: sólo los del email propio, del más nuevo al más viejo', () => {
  withEnabled(() => {
    const user = nuevoUsuario('mios@example.com');
    nuevoUsuario('ajeno@example.com');
    const insert = db.prepare(`insert into quotes (token, created_at, raw_text, customer_email, items_json, total_ars, ai_mode, status)
                               values (?,?,?,?,?,?,?,?)`);
    insert.run('tokviejo', '2026-01-01 10:00:00', 'x', 'MIOS@example.com', '[{"a":1}]', 1500, 'mock', 'sent');
    insert.run('toknuevo', '2026-02-02 10:00:00', 'x', 'mios@example.com', '[{"a":1},{"b":2}]', 2500, 'live', 'draft');
    insert.run('tokajeno', '2026-03-03 10:00:00', 'x', 'ajeno@example.com', '[]', 999, 'mock', 'draft');
    insert.run('toksinnada', '2026-04-04 10:00:00', 'x', null, '[]', 1, 'mock', 'draft');

    const mios = usuarios.misPresupuestos(db, user.id);
    assert.deepStrictEqual(mios.map((p) => p.token), ['toknuevo', 'tokviejo']);
    assert.strictEqual(mios[0].items, 2);
    assert.strictEqual(mios[0].totalArs, 2500);
    assert.strictEqual(mios[0].estado, 'draft');
    assert.strictEqual(mios[1].items, 1);
  });
});

test('isEnabled: acepta true/1/yes/on y cualquier otra cosa apaga las cuentas', () => {
  for (const valor of ['true', 'TRUE', ' 1 ', 'yes', 'On']) {
    assert.strictEqual(auth.isEnabled({ AUTH_ENABLED: valor }), true, valor);
  }
  for (const valor of ['', 'false', '0', 'no', 'off', undefined, '2']) {
    assert.strictEqual(auth.isEnabled({ AUTH_ENABLED: valor }), false, String(valor));
  }
  assert.strictEqual(auth.isEnabled({}), false);
});

test('sin AUTH_ENABLED las funciones de negocio no tocan la base', () => {
  assert.strictEqual(auth.isEnabled(), false);
  assert.throws(() => usuarios.registrar(db, { email: 'x@example.com', password: PASSWORD, password2: PASSWORD }), (err) => err.code === 'AUTH_DISABLED');
  assert.throws(() => usuarios.autenticar(db, { email: 'x@example.com', password: PASSWORD }), (err) => err.code === 'AUTH_DISABLED');
  assert.throws(() => usuarios.misPresupuestos(db, 1), (err) => err.code === 'AUTH_DISABLED');
});
