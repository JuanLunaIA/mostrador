'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { matchItem } = require('../src/services/catalog');

const PRODUCTS = [
  { sku: 'TOR-8x2', nombre: 'Tornillo autoperforante 8 x 2"', unidad: 'unidad', precio_ars: 45, aliases: 'tornillo tirafondo 8x2 pulgadas' },
  { sku: 'CAB-2x15', nombre: 'Cable taller 2x1.5 mm', unidad: 'metro', precio_ars: 1290, aliases: 'cable 2x1.5 bipolar' },
  { sku: 'CEM-50', nombre: 'Cemento Loma Negra 50 kg', unidad: 'bolsa', precio_ars: 9800, aliases: 'cemento bolsa 50kg' },
];

test('matchea tornillo 8x2 y devuelve precio del catalogo', () => {
  const m = matchItem('tornillos del 8 x 2 pulgadas', PRODUCTS);
  assert.strictEqual(m.sku, 'TOR-8x2');
  assert.strictEqual(m.precio_ars, 45);
  assert.ok(m.confianza >= 0.55);
});

test('matchea cable 2x1,5 (coma decimal argentina)', () => {
  const m = matchItem('5 metros de cable 2x1,5', PRODUCTS);
  assert.strictEqual(m.sku, 'CAB-2x15');
});

test('descripcion fuera de catalogo -> sku null, no inventa precio', () => {
  const m = matchItem('amalgama dental de mercurio', PRODUCTS);
  assert.strictEqual(m.sku, null);
  assert.strictEqual(m.precio_ars, 0);
  assert.strictEqual(m.requiere_revision, true);
});
