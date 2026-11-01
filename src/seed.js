'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { db, driver, DB_PATH } = require('./db');

// idempotente: CREATE TABLE IF NOT EXISTS
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const PRODUCTS = [
  ['TOR-8x2',   'Tornillo autoperforante 8 x 2"',        'unidad',  45,  'tornillo tirafondo autoperforante 8x2 pulgadas'],
  ['TOR-8x3',   'Tornillo autoperforante 8 x 3"',        'unidad',  68,  'tornillo tirafondo autoperforante 8x3 pulgadas'],
  ['CAB-2x15',  'Cable taller 2x1.5 mm',                 'metro',   1290,'cable 2x1.5 2x1,5 bipolar mellizo'],
  ['CAB-2x25',  'Cable taller 2x2.5 mm',                 'metro',   1980,'cable 2x2.5 2x2,5 bipolar mellizo'],
  ['LLA-PAS12', 'Llave de paso 1/2"',                    'unidad',  4350,'llave paso media pulgada esferica agua'],
  ['LLA-PAS34', 'Llave de paso 3/4"',                    'unidad',  6900,'llave paso tres cuartos esferica agua'],
  ['CEM-50',    'Cemento Loma Negra 50 kg',              'bolsa',   9800,'cemento bolsa 50kg loma negra cal'],
  ['HIE-8',     'Hierro del 8 (diam. 8 mm) x 12 m',      'barra',   7450,'hierro construccion 8mm barra 12 metros'],
  ['HIE-10',    'Hierro del 10 (diam. 10 mm) x 12 m',    'barra',   11200,'hierro construccion 10mm barra 12 metros'],
  ['PIN-LAT20', 'Pintura latex interior 20 L',           'balde',   58900,'pintura latex 20 litros interior blanca'],
  ['PIN-SIN4',  'Pintura sintetica 4 L',                 'lata',    24300,'pintura sintetica esmalte 4 litros'],
  ['BRO-2',     'Brocha 2" cerda natural',               'unidad',  3200,'brocha pincel 2 pulgadas'],
  ['ROD-9',     'Rodillo antigota 22 cm',                'unidad',  5100,'rodillo pintura antigota 22cm'],
  ['SIL-300',   'Silicona neutra 300 ml',                'cartucho',4800,'silicona sellador neutro cartucho 300ml'],
  ['GUA-REF',   'Guantes de trabajo reforzados',         'par',     3600,'guantes trabajo cabritilla reforzado'],
];

db.exec('BEGIN');
const stmt = db.prepare('INSERT OR REPLACE INTO products (sku,nombre,unidad,precio_ars,aliases) VALUES (?,?,?,?,?)');
for (const p of PRODUCTS) stmt.run(p[0], p[1], p[2], p[3], p[4]);
db.exec('COMMIT');

const n = db.prepare('select count(*) as n from products').get().n;
console.log(`seed ok: ${n} productos en ${DB_PATH} (driver=${driver})`);
