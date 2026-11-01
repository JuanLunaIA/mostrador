'use strict';
const path = require('node:path');

// Los tokens los genera la app con 8 caracteres base64url (ver presupuesto.js).
// Aceptamos un rango, pero nunca barras, puntos ni nada que pueda salir del directorio.
const TOKEN_SEGURO = /^[A-Za-z0-9_-]{4,64}$/;

function tokenValido(token) {
  return typeof token === 'string' && TOKEN_SEGURO.test(token);
}

// Devuelve la ruta absoluta del HTML de outbox, o null si el token no es seguro
// o si la ruta resuelta se escapa del directorio base (defensa en profundidad).
function rutaOutbox(base, token) {
  if (!tokenValido(token)) return null;
  const raiz = path.resolve(base);
  const destino = path.resolve(path.join(raiz, `${token}.html`));
  if (destino !== path.join(raiz, `${token}.html`)) return null;
  if (!destino.startsWith(raiz + path.sep)) return null;
  return path.join(base, `${token}.html`);
}

module.exports = { tokenValido, rutaOutbox };
