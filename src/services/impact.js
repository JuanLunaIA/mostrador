'use strict';
const { db } = require('../db');

const MINUTOS_AHORRADOS_POR_PRESUPUESTO = 18; // baseline 20 min a mano -> 2 min con Mostrador

function logQuote(quote) {
  db.prepare(
    'INSERT INTO impact_events (quote_id, tipo, minutos_ahorrados, monto_ars) VALUES (?,?,?,?)'
  ).run(quote.id, 'presupuesto_emitido', MINUTOS_AHORRADOS_POR_PRESUPUESTO, quote.total_ars);
}

function logEmail(quote) {
  db.prepare(
    'INSERT INTO impact_events (quote_id, tipo, minutos_ahorrados, monto_ars) VALUES (?,?,?,?)'
  ).run(quote.id, 'email_enviado', 0, quote.total_ars);
}

function counters() {
  const presupuestos = db.prepare("select count(*) n, coalesce(sum(monto_ars),0) monto from impact_events where tipo='presupuesto_emitido'").get();
  const emails = db.prepare("select count(*) n from impact_events where tipo='email_enviado'").get();
  const minutos = db.prepare('select coalesce(sum(minutos_ahorrados),0) m from impact_events').get();
  const leads = db.prepare('select count(*) n from leads').get();
  return {
    presupuestos: presupuestos.n,
    monto_ars: presupuestos.monto,
    emails: emails.n,
    minutos_ahorrados: minutos.m,
    horas_ahorradas: Math.round((minutos.m / 60) * 10) / 10,
    leads: leads.n,
  };
}

module.exports = { logQuote, logEmail, counters, MINUTOS_AHORRADOS_POR_PRESUPUESTO };
