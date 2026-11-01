'use strict';
const crypto = require('node:crypto');
const { db } = require('../db');
const { extractOrder } = require('./ai');
const { matchItem, loadProducts } = require('./catalog');
const impact = require('./impact');

function token() {
  return crypto.randomBytes(6).toString('base64url');
}

function cotizar(items, productos) {
  return items.map((it) => {
    const m = matchItem(it.descripcion_raw, productos);
    const cantidad = Number(it.cantidad) || 1;
    const subtotal = Math.round(m.precio_ars * cantidad);
    return {
      descripcion_raw: it.descripcion_raw,
      descripcion: m.nombre || it.descripcion_raw,
      cantidad,
      unidad: m.unidad || it.unidad || 'unidad',
      sku: m.sku,
      precio_unitario_ars: m.precio_ars,
      subtotal_ars: subtotal,
      confianza: m.confianza,
      requiere_revision: m.requiere_revision,
    };
  });
}

async function crearPresupuesto(rawText) {
  const out = await extractOrder(rawText);
  const productos = loadProducts(db);
  const lineas = cotizar(out.data.items, productos);
  const total_ars = lineas.reduce((a, l) => a + l.subtotal_ars, 0);
  const tok = token();

  const stmt = db.prepare(`
    INSERT INTO quotes (token, raw_text, customer_name, customer_phone, customer_email, items_json, total_ars, ai_mode, ai_latency_ms)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  const info = stmt.run(
    tok,
    String(rawText).slice(0, 4000),
    out.data.cliente?.nombre || null,
    out.data.cliente?.telefono || null,
    out.data.cliente?.email || null,
    JSON.stringify(lineas),
    total_ars,
    out.meta.mode,
    out.meta.latency_ms || 0
  );
  const quoteId = Number(info.lastInsertRowid);

  db.prepare(`
    INSERT INTO ai_calls (quote_id, model, mode, prompt_tokens, completion_tokens, latency_ms, schema_ok, repair_attempts, error)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(
    quoteId,
    out.meta.model || null,
    out.meta.mode,
    out.meta.prompt_tokens || 0,
    out.meta.completion_tokens || 0,
    out.meta.latency_ms || 0,
    out.meta.mode === 'live' ? 1 : 0,
    out.meta.repair_attempts || 0,
    out.meta.error || null
  );

  const quote = getByToken(tok);
  impact.logQuote(quote);
  return { quote, meta: out.meta, missing_fields: out.data.missing_fields, notas: out.data.notas };
}

function getByToken(tok) {
  const row = db.prepare('select * from quotes where token = ?').get(tok);
  if (!row) return null;
  return { ...row, items: JSON.parse(row.items_json) };
}

function marcarEnviado(id) {
  db.prepare("update quotes set status='sent', sent_at=datetime('now') where id=?").run(id);
}

module.exports = { crearPresupuesto, getByToken, marcarEnviado, cotizar };
