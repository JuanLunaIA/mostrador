'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));

function check(expect, body, status) {
  const fails = [];
  if (expect.http_status) {
    if (status !== expect.http_status) fails.push(`status ${status} != ${expect.http_status}`);
    return fails;
  }
  const items = body?.quote?.items || [];
  if (expect.min_items && items.length < expect.min_items) fails.push(`items ${items.length} < ${expect.min_items}`);
  if (expect.must_match_sku && items[0]?.sku !== expect.must_match_sku) fails.push(`sku ${items[0]?.sku} != ${expect.must_match_sku}`);
  if (expect.cantidad && items[0]?.cantidad !== expect.cantidad) fails.push(`cantidad ${items[0]?.cantidad} != ${expect.cantidad}`);
  for (const sku of expect.must_include_skus || []) {
    if (!items.some(i => i.sku === sku)) fails.push(`falta sku ${sku} (tengo ${items.map(i => i.sku).join(',') || 'ninguno'})`);
  }
  if (expect.customer_email && body?.quote?.customer_email !== expect.customer_email) fails.push(`email ${body?.quote?.customer_email} != ${expect.customer_email}`);
  if (expect.customer_email_null && body?.quote?.customer_email) fails.push('email deberia ser null');
  if (body?.quote && !(body.quote.total_ars > 0) && expect.min_items) fails.push('total_ars = 0');
  return fails;
}

(async () => {
  let pass = 0;
  const rows = [];
  for (const c of cases) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}/api/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: c.input }),
    });
    const body = await res.json().catch(() => ({}));
    const fails = check(c.expect, body, res.status);
    const ms = Date.now() - t0;
    rows.push({ id: c.id, ok: fails.length === 0, ms, mode: body?.meta?.mode || '-', fails });
    if (!fails.length) pass++;
  }
  console.log('\n  caso                          ok    ms    modo');
  console.log('  ' + '-'.repeat(52));
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(28)} ${r.ok ? 'PASS' : 'FAIL'}  ${String(r.ms).padStart(4)}  ${r.mode}`);
    if (!r.ok) console.log(`      ${r.fails.join(' | ')}`);
  }
  console.log(`\n  ${pass}/${rows.length} casos dorados\n`);
  process.exit(pass === rows.length ? 0 : 1);
})();
