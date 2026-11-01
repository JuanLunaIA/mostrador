'use strict';

const STOP = new Set(['de','del','la','el','los','las','un','una','unos','unas','y','por','para','con','que','me','mi','necesito','quiero','pasame','precio','cuanto','sale','salen','hola','buenas','tengo','tenes','hay','seria','son','es','al','a','en','x','si','todo','esta','estan','unidad','unidades','u','kg','kilo','kilos','m','mt','mts','metro','metros','bolsa','bolsas','barra','barras','balde','baldes','lata','latas','cartucho','cartuchos','par','pares','litro','litros','lt','lts','pulgada','pulgadas']);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/,/g, '.')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// stemming mínimo: plurales españoles ("tornillos" -> "tornillo")
function stem(t) {
  if (t.length >= 5 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length >= 4 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

function tokens(s) {
  return norm(s)
    .split(' ')
    .filter(t => !STOP.has(t))
    .filter(t => t.length >= 2 || /^\d$/.test(t))
    .map(stem);
}


function matchItem(descripcion, productos, umbral = 0.55) {
  const q = tokens(descripcion);
  let best = { sku: null, nombre: null, unidad: null, precio_ars: 0, confianza: 0, matched_on: [] };
  if (!q.length) return { ...best, requiere_revision: true };

  for (const p of productos) {
    const hay = new Set(tokens(`${p.nombre} ${p.aliases || ''}`));
    const hit = q.filter(t => hay.has(t));
    if (!hit.length) continue;
    const cobertura = hit.length / q.length;
    const precision = hit.length / Math.max(hay.size, 1);
    const confianza = Math.round((cobertura * 0.8 + precision * 0.2) * 100) / 100;
    if (confianza > best.confianza) {
      best = { sku: p.sku, nombre: p.nombre, unidad: p.unidad, precio_ars: p.precio_ars, confianza, matched_on: hit };
    }
  }
  if (best.confianza < umbral) {
    return { sku: null, nombre: null, unidad: null, precio_ars: 0, confianza: best.confianza, matched_on: best.matched_on, requiere_revision: true };
  }
  return { ...best, requiere_revision: false };
}

function loadProducts(db) {
  return db.prepare('select sku, nombre, unidad, precio_ars, aliases from products').all();
}

module.exports = { matchItem, loadProducts, norm, tokens };
