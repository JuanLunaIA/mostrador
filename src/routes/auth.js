'use strict';

/**
 * Rutas de cuentas de usuario. Se monta SOLO si AUTH_ENABLED=true (ver app.js):
 * con el flag apagado estas URLs no existen y no queda rastro en el HTML.
 *
 * Todo lo que devuelve HTML con un token CSRF va con Cache-Control: no-store.
 */

const express = require('express');
const { db } = require('../db');
const auth = require('../services/auth');
const usuarios = require('../services/usuarios');
const session = require('../lib/session');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();

// Un login es un endpoint de fuerza bruta: 20 intentos por minuto y por IP.
const limitarLogin = rateLimit({ max: 20, nombre: 'auth-login' });
const limitarRegistro = rateLimit({ max: 10, nombre: 'auth-registro' });

const MENSAJES_OK = {
  perfil: 'Guardamos tus datos.',
  clave: 'Cambiaste la contraseña. Cerramos las otras sesiones abiertas.',
  cuenta: 'Listo, ya tenés tu cuenta.',
};

const MENSAJES_ERROR = {
  perfil: 'No pudimos guardar los datos. Revisá el nombre y el email.',
  email_tomado: 'Ese email ya está en uso por otra cuenta.',
  email_invalido: 'Ese email no parece válido. Fijate que tenga un solo @ y un dominio.',
  nombre_invalido: 'El nombre no puede pasar de 120 caracteres.',
  clave_actual: 'La contraseña actual no es la correcta.',
  clave_corta: 'La contraseña nueva tiene que tener al menos 8 caracteres.',
  clave_distinta: 'Las dos contraseñas nuevas no coinciden.',
  clave_igual: 'La contraseña nueva tiene que ser distinta de la actual.',
};

// Códigos de AuthError -> slug del mensaje que se muestra en /config.
const SLUG_POR_CODIGO = {
  EMAIL_TOMADO: 'email_tomado',
  EMAIL_TAKEN: 'email_tomado',
  EMAIL_INVALIDO: 'email_invalido',
  INVALID_EMAIL: 'email_invalido',
  NOMBRE_INVALIDO: 'nombre_invalido',
  INVALID_NAME: 'nombre_invalido',
  PASSWORD_ACTUAL: 'clave_actual',
  PASSWORD_CORTA: 'clave_corta',
  PASSWORD_DISTINTA: 'clave_distinta',
  PASSWORD_IGUAL: 'clave_igual',
};

// --- contexto de la request -------------------------------------------------

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

/**
 * Deja en req: sesionToken, usuario y csrfSesion. Si la cookie trae un token que
 * ya no sirve (vencido, revocado, usuario deshabilitado) la borra.
 * res.locals.csrf es el token que va en el campo oculto de los formularios.
 */
function cargarSesion(req, res, next) {
  const token = session.readSessionToken(req);
  const encontrada = token ? auth.getSession(db, token) : null;
  req.sesionToken = encontrada ? token : null;
  req.usuario = encontrada ? encontrada.user : null;
  req.csrfSesion = encontrada ? encontrada.csrfToken : null;
  if (token && !encontrada) session.clearSessionCookie(res, { secure: session.isSecureRequest(req) });
  res.locals.csrf = req.csrfSesion || session.ensureCsrfCookie(req, res);
  res.locals.usuario = req.usuario;
  next();
}
router.use(cargarSesion);

/** Sólo entra con sesión válida; si no, al login. */
function exigirSesion(req, res, next) {
  if (!req.usuario) return res.redirect(302, '/login');
  next();
}

/**
 * CSRF: con sesión vale el token de users_sessions; sin sesión, el de la cookie
 * de visitante (double-submit). Se comparan en tiempo constante.
 */
function csrfValido(req) {
  const recibido = req.body && req.body._csrf;
  const candidatos = [req.csrfSesion, session.readCsrfCookie(req)].filter(Boolean);
  return candidatos.some((esperado) => session.verifyCsrf(esperado, recibido));
}

function exigirCsrf(req, res, next) {
  if (!csrfValido(req)) {
    return res.status(403).render('404', { msg: 'El formulario venció. Volvé a la página y probá de nuevo.' });
  }
  next();
}

function seguro(req) {
  return session.isSecureRequest(req);
}

/** Devuelve el slug de error para el redirect de /config. */
function slugDeError(err) {
  if (err instanceof auth.AuthError) return SLUG_POR_CODIGO[err.code] || 'perfil';
  console.error('[mostrador auth]', err);
  return 'perfil';
}

/** Cierra la sesión vieja (si había) y emite una nueva cookie. */
function abrirSesion(req, res, user) {
  if (req.sesionToken) auth.revokeSession(db, req.sesionToken);
  const { token } = auth.createSession(db, user.id, { userAgent: req.get('user-agent') });
  session.setSessionCookie(res, token, { secure: seguro(req) });
  session.clearCsrfCookie(res, { secure: seguro(req) });
}

// --- login -------------------------------------------------------------------

router.get('/login', (req, res) => {
  if (req.usuario) return res.redirect(302, '/config');
  res.render('login', { csrf: res.locals.csrf, error: null, email: '' });
});

router.post('/login', limitarLogin, exigirCsrf, (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.slice(0, 254) : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  try {
    const user = usuarios.autenticar(db, { email, password });
    abrirSesion(req, res, user);
    return res.redirect(303, '/config');
  } catch (err) {
    const mensaje = err instanceof auth.AuthError
      ? err.message
      : 'No pudimos ingresar. Probá de nuevo en un rato.';
    if (!(err instanceof auth.AuthError)) console.error('[mostrador auth]', err);
    return res.status(401).render('login', { csrf: res.locals.csrf, error: mensaje, email });
  }
});

// --- registro ----------------------------------------------------------------

router.get('/registro', (req, res) => {
  if (req.usuario) return res.redirect(302, '/config');
  res.render('registro', { csrf: res.locals.csrf, error: null, valores: { email: '', nombre: '' } });
});

router.post('/registro', limitarRegistro, exigirCsrf, (req, res) => {
  const valores = {
    email: typeof req.body.email === 'string' ? req.body.email.slice(0, 254) : '',
    nombre: typeof req.body.nombre === 'string' ? req.body.nombre.slice(0, 120) : '',
  };
  try {
    const user = usuarios.registrar(db, {
      email: valores.email,
      password: typeof req.body.password === 'string' ? req.body.password : '',
      password2: typeof req.body.password2 === 'string' ? req.body.password2 : '',
      nombre: valores.nombre,
    });
    abrirSesion(req, res, user);
    return res.redirect(303, '/config?ok=cuenta');
  } catch (err) {
    const mensaje = err instanceof auth.AuthError
      ? (err.code === 'EMAIL_TAKEN' ? 'Ya hay una cuenta con ese email. Probá ingresando.' : err.message)
      : 'No pudimos crear la cuenta. Probá de nuevo en un rato.';
    if (!(err instanceof auth.AuthError)) console.error('[mostrador auth]', err);
    return res.status(err instanceof auth.AuthError ? 400 : 500)
      .render('registro', { csrf: res.locals.csrf, error: mensaje, valores });
  }
});

// --- logout ------------------------------------------------------------------

router.post('/logout', exigirSesion, exigirCsrf, (req, res) => {
  auth.revokeSession(db, req.sesionToken);
  session.clearSessionCookie(res, { secure: seguro(req) });
  session.clearCsrfCookie(res, { secure: seguro(req) });
  res.redirect(303, '/');
});

// --- configuración -----------------------------------------------------------

router.get('/config', exigirSesion, (req, res) => {
  const ok = MENSAJES_OK[String(req.query.ok || '')] || null;
  const error = MENSAJES_ERROR[String(req.query.error || '')] || null;
  res.render('config', {
    csrf: res.locals.csrf,
    usuario: req.usuario,
    presupuestos: usuarios.misPresupuestos(db, req.usuario.id),
    ok,
    error,
  });
});

router.post('/config/perfil', exigirSesion, exigirCsrf, (req, res) => {
  try {
    req.usuario = usuarios.actualizarPerfil(db, req.usuario.id, {
      nombre: typeof req.body.nombre === 'string' ? req.body.nombre : '',
      email: typeof req.body.email === 'string' ? req.body.email : '',
    });
    return res.redirect(303, '/config?ok=perfil');
  } catch (err) {
    return res.redirect(303, `/config?error=${slugDeError(err)}`);
  }
});

router.post('/config/password', exigirSesion, exigirCsrf, (req, res) => {
  try {
    usuarios.cambiarPassword(db, req.usuario.id, {
      actual: typeof req.body.actual === 'string' ? req.body.actual : '',
      nueva: typeof req.body.nueva === 'string' ? req.body.nueva : '',
      repetida: typeof req.body.repetida === 'string' ? req.body.repetida : '',
      sesionToken: req.sesionToken,
    });
    return res.redirect(303, '/config?ok=clave');
  } catch (err) {
    return res.redirect(303, `/config?error=${slugDeError(err)}`);
  }
});

module.exports = router;
// Se monta tambien suelto, antes del router del sitio, para que el index sepa
// si hay sesion y pueda mostrar Mi cuenta / Salir.
module.exports.cargarSesion = cargarSesion;
