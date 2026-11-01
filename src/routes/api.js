'use strict';
const express = require('express');
const { crearPresupuesto, getByToken, marcarEnviado } = require('../services/presupuesto');
const { sendQuoteEmail } = require('../services/email');
const impact = require('../services/impact');
const { db, driver } = require('../db');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();

// topes por IP: generar gasta tokens, enviar email gasta créditos de EnvíaloSimple
const limiteCrear = rateLimit({ nombre: 'quotes', max: 30 });
const limiteEnviar = rateLimit({ nombre: 'send', max: 10 });


router.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    db: driver,
    ai: process.env.OPENAI_API_KEY ? 'live' : 'degraded',
    email: (process.env.EMAIL_MODE || 'mock').toLowerCase(),
    time: new Date().toISOString(),
  });
});

router.post('/quotes', limiteCrear, async (req, res, next) => {
  try {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) {
      return res.status(422).json({ error: { code: 'texto_requerido', message: 'Escribí o pegá el mensaje del cliente.' } });
    }
    const { quote, meta, missing_fields, notas } = await crearPresupuesto(texto);
    res.status(201).json({ token: quote.token, url: `/q/${quote.token}`, quote, meta, missing_fields, notas });
  } catch (err) { next(err); }
});

router.get('/quotes/:token', (req, res) => {
  const q = getByToken(req.params.token);
  if (!q) return res.status(404).json({ error: { code: 'not_found', message: 'Presupuesto inexistente' } });
  res.json({ quote: q });
});

router.post('/quotes/:token/send', limiteEnviar, async (req, res, next) => {
  try {
    const q = getByToken(req.params.token);
    if (!q) return res.status(404).json({ error: { code: 'not_found', message: 'Presupuesto inexistente' } });
    const to = String(req.body?.email || q.customer_email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(422).json({ error: { code: 'email_invalido', message: 'Necesito un email válido para enviar.' } });
    }
    const publicUrl = `${req.protocol}://${req.get('host')}/q/${q.token}`;
    const out = await sendQuoteEmail(q, to, publicUrl);
    if (out.ok) {
      marcarEnviado(q.id);
      impact.logEmail(q);
      db.prepare('insert into leads (quote_id, email, nombre, origen) values (?,?,?,?)').run(q.id, to, q.customer_name || null, 'demo');
    }
    res.status(out.ok ? 200 : 502).json(out);
  } catch (err) { next(err); }
});

router.get('/impact', (req, res) => res.json(impact.counters()));

module.exports = router;
