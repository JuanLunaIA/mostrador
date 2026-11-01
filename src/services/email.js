'use strict';
const fs = require('node:fs');
const path = require('node:path');

const OUTBOX = path.join(__dirname, '..', '..', 'data', 'outbox');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderHtml(quote, opts = {}) {
  const filas = quote.items.map(l => `
    <tr>
      <td style="padding:8px 6px;border-bottom:1px solid #eee">${escapeHtml(l.descripcion)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center">${l.cantidad} ${escapeHtml(l.unidad)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">$${l.precio_unitario_ars.toLocaleString('es-AR')}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right"><b>$${l.subtotal_ars.toLocaleString('es-AR')}</b></td>
    </tr>`).join('');

  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f7f9;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:620px;margin:0 auto;padding:24px">
    <div style="background:#0f172a;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px">
      <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.75">Mostrador</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px">Ferretería San Luis · Presupuesto</div>
    </div>
    <div style="background:#fff;border-radius:0 0 14px 14px;padding:24px">
      <p style="margin:0 0 16px">Hola ${escapeHtml(quote.customer_name || 'vecino/a')}, te paso el presupuesto que pediste por WhatsApp.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f1f5f9">
          <th style="padding:8px 6px;text-align:left">Ítem</th><th style="padding:8px 6px">Cant.</th>
          <th style="padding:8px 6px;text-align:right">Unitario</th><th style="padding:8px 6px;text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div style="margin-top:18px;padding-top:14px;border-top:2px solid #0f172a;font-size:20px;font-weight:800;display:flex;justify-content:space-between">
        <span>Total</span><span>$${quote.total_ars.toLocaleString('es-AR')}</span>
      </div>
      <p style="font-size:12px;color:#64748b;margin-top:20px">Presupuesto válido por 7 días. Precios en pesos argentinos. Generado automáticamente con Mostrador IA — corriendo sobre infraestructura DonWeb Cloud.</p>
      <p style="font-size:12px;color:#64748b">Ver online: ${escapeHtml(opts.publicUrl || '')}</p>
    </div>
  </div></body></html>`;
}

async function sendQuoteEmail(quote, to, publicUrl) {
  const html = renderHtml(quote, { publicUrl });
  const subject = `Presupuesto Ferretería San Luis — $${quote.total_ars.toLocaleString('es-AR')}`;
  const mode = (process.env.EMAIL_MODE || 'mock').toLowerCase();

  const guardarMock = () => {
    fs.mkdirSync(OUTBOX, { recursive: true });
    fs.writeFileSync(path.join(OUTBOX, `${quote.token}.html`), html);
    return `/outbox/${quote.token}`;
  };

  if (mode !== 'live' || !process.env.ENVIALOSIMPLE_API_KEY) {
    return { ok: true, mode: 'mock', preview: guardarMock(), to };
  }

  const bases = [
    process.env.ENVIALOSIMPLE_BASE || 'https://api.envialosimple.email',
    'https://backend.envialosimple.email',
  ];
  const body = JSON.stringify({
    from: process.env.ENVIALOSIMPLE_FROM,
    to: [{ email: to }],
    subject,
    html,
    preview_text: `Presupuesto por $${quote.total_ars.toLocaleString('es-AR')} — Ferretería San Luis`,
  });

  let lastErr = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/v1/mail/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.ENVIALOSIMPLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (!res.ok) { lastErr = new Error(`envialosimple ${res.status}: ${text.slice(0, 200)}`); continue; }
      return { ok: true, mode: 'live', to, provider: base, response: text.slice(0, 200) };
    } catch (err) { lastErr = err; }
  }
  // el fallback NO miente: devuelve modo mock marcado + el error real
  return { ok: false, mode: 'mock', preview: guardarMock(), to, error: String(lastErr?.message || lastErr) };
}

module.exports = { sendQuoteEmail, renderHtml, escapeHtml };
