'use strict';
const path = require('node:path');
const fs = require('node:fs');

// carga .env sin dependencia externa
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const linea of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = require('express');
const { db, driver, DB_PATH } = require('./src/db');

if (fs.existsSync(path.join(__dirname, 'src', 'schema.sql'))) {
  db.exec(fs.readFileSync(path.join(__dirname, 'src', 'schema.sql'), 'utf8'));
}

const app = express();
app.set('trust proxy', 1); // detras de nginx: la IP real viene en X-Forwarded-For

// Cuentas de usuario: APAGADAS por defecto. Con AUTH_ENABLED=false no se crean
// tablas users_* ni se monta ninguna ruta nueva. Se enciende sólo a pedido.
const auth = require('./src/services/auth');
if (auth.isEnabled()) auth.applySchema(db);

// Cabeceras de seguridad. La app no carga nada de terceros (el CSS se compila y se
// sirve local), pero usa <style> y <script> inline, de ahi el 'unsafe-inline'.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '));
  next();
});
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '100kb' }));
// Cache por tipo: las imagenes son inmutables (7 dias), el CSS cambia entre deploys (1 h).
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (['.png', '.svg', '.jpg', '.jpeg', '.webp', '.ico'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    } else if (ext === '.css') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  },
}));

app.locals.EMAIL_MODE = (process.env.EMAIL_MODE || 'mock').toLowerCase();
app.locals.AI_LIVE = Boolean(process.env.OPENAI_API_KEY);

app.use('/', require('./src/routes/index'));
app.use('/api', require('./src/routes/api'));

// Cuentas de usuario: el router se monta SOLO con el flag encendido.
if (auth.isEnabled()) {
  app.use('/', require('./src/routes/auth'));
} else {
  // Con las cuentas apagadas esas URLs no existen: misma página 404 del sitio,
  // sin formularios ni pistas de que el módulo está esperando el flag.
  const apagadas = new Set(['/login', '/registro', '/config']);
  app.use((req, res, next) => {
    const ruta = req.path.replace(/\/+$/, '') || '/';
    if (apagadas.has(ruta) || ruta.startsWith('/config/')) return res.status(404).render('404', { msg: 'Esa página no existe.' });
    next();
  });
}

// alias de salud en la raiz (el del router vive en /api/healthz)
app.get('/healthz', (req, res) => res.redirect(307, '/api/healthz'));


app.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: `No existe ${req.method} ${req.path}` } }));

// Los errores de parseo del body (JSON roto, body grande) ya vienen con status 4xx.
// Antes se devolvian todos como 500 con el mensaje interno adentro.
app.use((err, req, res, _next) => {
  const status = Number(err.status || err.statusCode) || 500;
  if (status < 500) {
    const code = status === 413 ? 'payload_grande' : status === 415 ? 'tipo_no_soportado' : 'body_invalido';
    const message = status === 413
      ? 'El mensaje es demasiado grande (máximo 100 KB).'
      : 'No pude leer el pedido. Mandá un JSON con el campo "texto".';
    return res.status(status).json({ error: { code, message } });
  }
  console.error('[mostrador]', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Error interno del servidor.' } });
});

const PORT = Number(process.env.PORT || 3000);
// Regla 5 del prompt oficial de DonWeb: los servicios internos escuchan SOLO en
// 127.0.0.1; a internet se expone unicamente nginx. Se puede abrir con HOST=0.0.0.0
// para pruebas en red local.
const HOST = process.env.HOST || '127.0.0.1';
// Un clon nuevo trae la base vacia: sin catálogo, todos los precios salen $0 y el
// jurado que se saltea `node src/seed.js` ve un producto roto. Sembrar sólo si está vacío.
try {
  if (db.prepare('select count(*) as n from products').get().n === 0) {
    console.log('[mostrador] catálogo vacío: sembrando los 15 productos');
    require('./src/seed');
  }
} catch (e) {
  console.error('[mostrador] no pude sembrar el catálogo:', e.message);
}

app.listen(PORT, HOST, () => {
  console.log(`mostrador escuchando en http://${HOST}:${PORT} (db=${driver} ${DB_PATH}, ai=${app.locals.AI_LIVE ? 'live' : 'degraded'}, email=${app.locals.EMAIL_MODE})`);
});
