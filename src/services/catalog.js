'use strict';

const STOP = new Set(['de','del','la','el','los','las','un','una','unos','unas','y','por','para','con','que','me','mi','necesito','quiero','pasame','precio','cuanto','sale','salen','hola','buenas','tengo','tenes','hay','seria','son','es','al','a','en','x','si','todo','esta','estan','unidad','unidades','u','kg','kilo','kilos','m','mm','cm','mt','mts','metro','metros','bolsa','bolsas','barra','barras','balde','baldes','lata','latas','cartucho','cartuchos','par','pares','litro','litros','lt','lts','pulgada','pulgadas']);

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/,/g, '.')
    // "2 por 1.5" y "2 x 1.5" son la misma medida que "2x1.5".
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:x|por)\s*(\d+(?:\.\d+)?)\b/g, '$1x$2')
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


const SOLO_NUMERO = /^\d+(?:\.\d+)?$/;
const ES_MEDIDA = /^\d+(?:\.\d+)?x\d/;

// "8" (lo que escribe el cliente) debe encontrar "8x2" (la medida del catálogo).
function coincide(a, b) {
  if (a === b) return true;
  if (SOLO_NUMERO.test(a) && ES_MEDIDA.test(b) && b.startsWith(a)) return true;
  if (SOLO_NUMERO.test(b) && ES_MEDIDA.test(a) && a.startsWith(b)) return true;
  return false;
}

function matchItem(descripcion, productos, umbral = 0.55) {
  const q = tokens(descripcion);
  let best = { sku: null, nombre: null, unidad: null, precio_ars: 0, confianza: 0, matched_on: [] };
  if (!q.length) return { ...best, requiere_revision: true };

  // Si el texto trae un numero suelto que en realidad es la cantidad ("20 bolsas
  // de cemento"), ese token hunde la cobertura. Probamos tambien sin numeros
  // sueltos y nos quedamos con la mejor lectura: las medidas ("2x1.5") no se tocan.
  const sinSueltos = q.filter(t => !SOLO_NUMERO.test(t));
  const variantes = sinSueltos.length && sinSueltos.length < q.length ? [q, sinSueltos] : [q];

  for (const p of productos) {
    const hay = new Set(tokens(`${p.nombre} ${p.aliases || ''}`));
    for (const variante of variantes) {
      const hit = variante.filter(t => [...hay].some(h => coincide(t, h)));
      if (!hit.length) continue;
      const cobertura = hit.length / variante.length;
      const precision = hit.length / Math.max(hay.size, 1);
      const confianza = Math.round((cobertura * 0.8 + precision * 0.2) * 100) / 100;
      if (confianza > best.confianza) {
        best = { sku: p.sku, nombre: p.nombre, unidad: p.unidad, precio_ars: p.precio_ars, confianza, matched_on: hit };
      }
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
