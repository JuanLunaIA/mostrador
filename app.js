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
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.locals.EMAIL_MODE = (process.env.EMAIL_MODE || 'mock').toLowerCase();
app.locals.AI_LIVE = Boolean(process.env.OPENAI_API_KEY);

app.use('/', require('./src/routes/index'));
app.use('/api', require('./src/routes/api'));

// alias de salud en la raiz (el del router vive en /api/healthz)
app.get('/healthz', (req, res) => res.redirect(307, '/api/healthz'));


app.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: `No existe ${req.method} ${req.path}` } }));
app.use((err, req, res, _next) => {
  console.error('[mostrador]', err);
  res.status(500).json({ error: { code: 'internal_error', message: String(err.message || err) } });
});

const PORT = Number(process.env.PORT || 3000);
// Regla 5 del prompt oficial de DonWeb: los servicios internos escuchan SOLO en
// 127.0.0.1; a internet se expone unicamente nginx. Se puede abrir con HOST=0.0.0.0
// para pruebas en red local.
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`mostrador escuchando en http://${HOST}:${PORT} (db=${driver} ${DB_PATH}, ai=${app.locals.AI_LIVE ? 'live' : 'degraded'}, email=${app.locals.EMAIL_MODE})`);
});
