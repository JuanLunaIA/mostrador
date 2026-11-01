'use strict';
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { getByToken } = require('../services/presupuesto');
const { rutaOutbox } = require('../lib/outbox');
const impact = require('../services/impact');

const router = express.Router();
const OUTBOX = path.join(__dirname, '..', '..', 'data', 'outbox');

const EJEMPLOS = [
  'hola tenes 200 tornillos del 8x2 y 5 metros de cable 2x1,5? cuanto sale todo, soy Juan de la obra de San Luis 1450, mi mail juan@obrasanluis.com',
  'buenas tardes, necesito 10 bolsas de cemento y 20 barras de hierro del 8 para el lunes',
  'me pasas precio de 2 baldes de latex 20 litros y 3 brochas del 2?',
];

router.get('/', (req, res) => {
  res.render('index', { ejemplos: EJEMPLOS, counters: impact.counters() });
});

router.get('/q/:token', (req, res) => {
  const quote = getByToken(req.params.token);
  if (!quote) return res.status(404).render('404', { msg: 'Ese presupuesto no existe.' });
  res.render('quote', { quote, counters: impact.counters() });
});

router.get('/impacto', (req, res) => {
  res.render('impacto', { counters: impact.counters() });
});

router.get('/contratar', (req, res) => res.render('contratar', { title: 'Contratar Mostrador', desc: 'Tres planes para llevar Mostrador a tu ferretería, con lo que incluye y lo que no. Precios a definir y estado real del producto.', canonical: '/contratar' }));

const titular = require('../../config/titular.json');
router.get('/terminos', (req, res) => res.render('terminos', { t: titular, title: 'Términos y condiciones', canonical: '/terminos' }));
router.get('/privacidad', (req, res) => res.render('privacidad', { t: titular, title: 'Política de privacidad', canonical: '/privacidad' }));

router.get('/outbox/:token', (req, res) => {
  const f = rutaOutbox(OUTBOX, req.params.token);
  if (!f || !fs.existsSync(f)) return res.status(404).send('sin email en modo mock para ese token');
  res.type('html').send(fs.readFileSync(f, 'utf8'));
});

module.exports = router;
