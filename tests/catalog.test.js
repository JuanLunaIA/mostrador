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

// --- Lo que devuelve el modelo cuando el cliente escribe como habla ---
// "2 por 1.5", "del 8", "50 kg" son formas normales de pedir en un mostrador.

test('entiende "cable de 2 por 1.5" (por = x)', () => {
  const m = matchItem('cable de 2 por 1.5', PRODUCTS);
  assert.strictEqual(m.sku, 'CAB-2x15');
  assert.ok(m.confianza >= 0.55, `confianza ${m.confianza} deberia superar el umbral`);
});

test('entiende "cable de 2 por 1,5" con coma decimal', () => {
  const m = matchItem('cable de 2 por 1,5', PRODUCTS);
  assert.strictEqual(m.sku, 'CAB-2x15');
});

test('entiende "tirafondos del 8" contra tornillo 8 x 2', () => {
  const m = matchItem('tirafondos del 8', PRODUCTS);
  assert.strictEqual(m.sku, 'TOR-8x2');
  assert.ok(m.confianza >= 0.55, `confianza ${m.confianza} deberia superar el umbral`);
});

test('entiende "4 bolsas de cemento"', () => {
  const m = matchItem('bolsas de cemento', PRODUCTS);
  assert.strictEqual(m.sku, 'CEM-50');
});

test('no inventa match cuando solo coincide el numero', () => {
  const m = matchItem('amalgama dental 8', PRODUCTS);
  assert.strictEqual(m.sku, null);
});

test('la cantidad pegada en la descripcion no rompe el match', () => {
  const m = matchItem('20 bolsas de cemento', PRODUCTS);
  assert.strictEqual(m.sku, 'CEM-50');
  assert.ok(m.confianza >= 0.55, `confianza ${m.confianza} deberia superar el umbral`);
});

test('la medida pegada a la cantidad sigue discriminando', () => {
  const m = matchItem('12 metros de cable 2x1,5', PRODUCTS);
  assert.strictEqual(m.sku, 'CAB-2x15');
});
