'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { degradeExtract } = require('../src/services/ai');

test('degradado: extrae cantidad + descripcion de un mensaje de WhatsApp', () => {
  const out = degradeExtract('hola tenes 200 tornillos del 8x2 y 5 metros de cable 2x1,5?');
  assert.ok(out.items.length >= 2, `items=${JSON.stringify(out.items)}`);
  const tor = out.items.find(i => /tornillo/i.test(i.descripcion_raw));
  assert.ok(tor, 'no extrajo tornillos');
  assert.strictEqual(tor.cantidad, 200);
});

test('degradado: texto vacio -> missing_fields, no excepcion', () => {
  const out = degradeExtract('');
  assert.deepStrictEqual(out.items, []);
  assert.ok(out.missing_fields.includes('descripcion'));
});
