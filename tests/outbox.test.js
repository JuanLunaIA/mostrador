'use strict';
// El token de /outbox/:token se usa para armar una ruta de archivo. Sin validar,
// un token como "../algo" sale del directorio de outbox y lee otro .html del disco.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { tokenValido, rutaOutbox } = require('../src/lib/outbox');

test('acepta un token normal (formato de los que genera la app)', () => {
  assert.strictEqual(tokenValido('aB3dEf7h'), true);
  assert.strictEqual(tokenValido('9Slj03fe'), true);
  assert.strictEqual(tokenValido('lCKmcjz6'), true);
});

test('rechaza path traversal en el token', () => {
  for (const t of ['../x', '..%2f..%2fetc%2fpasswd', 'a/../../b', '..\\x', '/etc/passwd', 'a..b/../c']) {
    assert.strictEqual(tokenValido(t), false, `deberia rechazar ${t}`);
  }
});

test('rechaza tokens vacios, cortos o con caracteres raros', () => {
  for (const t of ['', 'ab', 'a b', 'a.b', 'x'.repeat(200), null, undefined, 123, {}]) {
    assert.strictEqual(tokenValido(t), false, `deberia rechazar ${String(t)}`);
  }
});

test('rutaOutbox devuelve null ante traversal, sin tocar el disco', () => {
  const base = '/tmp/outbox-test';
  assert.strictEqual(rutaOutbox(base, '../evil'), null);
  assert.strictEqual(rutaOutbox(base, '../../etc/passwd'), null);
});

test('rutaOutbox arma la ruta adentro de base', () => {
  const base = '/tmp/outbox-test';
  assert.strictEqual(rutaOutbox(base, 'aB3dEf7h'), path.join(base, 'aB3dEf7h.html'));
});
