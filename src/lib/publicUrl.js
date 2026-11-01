'use strict';

// La URL publica de un presupuesto NO se arma con datos del request: el header Host
// lo controla el cliente y terminaria inyectando un dominio ajeno en el email.
// Orden: PUBLIC_BASE_URL (produccion) -> localhost con PORT. Nunca req.get('host').
function basePublica() {
  const configurada = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configurada) return configurada;
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

function urlPublica(token) {
  const limpio = String(token == null ? '' : token).replace(/[^A-Za-z0-9_-]/g, '');
  return `${basePublica()}/q/${limpio}`;
}

module.exports = { urlPublica, basePublica };
