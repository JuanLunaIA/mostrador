'use strict';
// Tests del exportador: escapado RFC 4180, bases vacias y conteos contra la base.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const { escaparCampo, armarCsv, exportar, parsearArgs, TABLAS_CONOCIDAS } = require('../scripts/export');

const RAIZ = path.join(__dirname, '..');
const ESQUEMA = fs.readFileSync(path.join(RAIZ, 'src', 'schema.sql'), 'utf8');

function dirTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mostrador-export-'));
}

function crearBase(ruta, { conDatos = true } = {}) {
  const db = new DatabaseSync(ruta);
  db.exec(ESQUEMA);
  if (conDatos) {
    db.prepare('INSERT INTO products (sku, nombre, unidad, precio_ars, aliases) VALUES (?,?,?,?,?)').run(
      'CEM-50',
      'Cemento Loma Negra 50 kg',
      'bolsa',
      9800,
      'cemento,loma negra'
    );
    const insQuote = db.prepare(`
      INSERT INTO quotes (token, created_at, raw_text, customer_name, customer_phone,
                          customer_email, items_json, total_ars, ai_mode, ai_latency_ms, status, sent_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    insQuote.run(
      'aB3dEf7h',
      '2026-11-01 19:28:00',
      'buenas tardes, necesito 10 bolsas de cemento "Loma Negra",\ny algo mas',
      'Juana, "la ferretera"',
      null,
      'juana@ferreteria.com.ar',
      '[{"sku":"CEM-50","cantidad":10,"precio_unitario_ars":9800,"subtotal_ars":98000}]',
      98000,
      'live',
      1234,
      'sent',
      '2026-11-01 19:30:00'
    );
    insQuote.run(
      'vZ3wFgeF',
      '2026-11-01 19:40:41',
      'necesito 200 tornillos 8x2',
      null,
      null,
      null,
      '[]',
      0,
      'degraded',
      0,
      'draft',
      null
    );
    insQuote.run('c9Xx00aa', '2026-11-01 20:00:00', 'solo comillas: "x"', '', null, null, '[]', 100, 'live', 5, 'draft', null);
    db.prepare('INSERT INTO leads (quote_id, email, nombre, origen) VALUES (?,?,?,?)').run(
      1,
      'juana@ferreteria.com.ar',
      'Juana "la jefa", del barrio',
      'demo'
    );
    db.prepare('INSERT INTO leads (quote_id, email, nombre, origen) VALUES (?,?,?,?)').run(2, 'sin-nombre@x.com', null, 'demo');
    db.prepare('INSERT INTO ai_calls (quote_id, model, mode, prompt_tokens, completion_tokens, latency_ms, schema_ok, repair_attempts, error) VALUES (?,?,?,?,?,?,?,?,?)').run(
      1,
      'gpt-4o-mini',
      'live',
      100,
      50,
      1234,
      1,
      0,
      null
    );
    db.prepare('INSERT INTO impact_events (quote_id, tipo, minutos_ahorrados, monto_ars) VALUES (?,?,?,?)').run(
      1,
      'presupuesto_emitido',
      18,
      98000
    );
  }
  db.close();
  return ruta;
}

// Parser RFC 4180 minimo, escrito aparte del exportador a proposito: si el
// exportador y el test comparten el mismo bug de escapado, el test no sirve.
function parsearCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\r' && texto[i + 1] === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      i++;
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

function sha256(ruta) {
  return crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
}

// ---------- escapado ----------

test('escaparCampo: comillas, comas y saltos de linea segun RFC 4180', () => {
  assert.strictEqual(escaparCampo('sin nada raro'), 'sin nada raro');
  assert.strictEqual(escaparCampo('cemento, hierro'), '"cemento, hierro"');
  assert.strictEqual(escaparCampo('dice "hola"'), '"dice ""hola"""');
  assert.strictEqual(escaparCampo('una "coma", adentro'), '"una ""coma"", adentro"');
  assert.strictEqual(escaparCampo('linea 1\nlinea 2'), '"linea 1\nlinea 2"');
  assert.strictEqual(escaparCampo('linea 1\r\nlinea 2'), '"linea 1\r\nlinea 2"');
  assert.strictEqual(escaparCampo('comilla final"'), '"comilla final"""');
  assert.strictEqual(escaparCampo('""'), '""""""');
});

test('escaparCampo: NULL, undefined y numeros', () => {
  assert.strictEqual(escaparCampo(null), '');
  assert.strictEqual(escaparCampo(undefined), '');
  assert.strictEqual(escaparCampo(0), '0');
  assert.strictEqual(escaparCampo(98000), '98000');
  assert.strictEqual(escaparCampo(-5), '-5');
  assert.strictEqual(escaparCampo(10n), '10');
});

test('armarCsv: encabezado, CRLF y comilla doble duplicada', () => {
  const csv = armarCsv(['id', 'texto'], [
    { id: 1, texto: 'con, coma' },
    { id: 2, texto: 'con "comillas"' },
  ]);
  assert.strictEqual(csv, 'id,texto\r\n1,"con, coma"\r\n2,"con ""comillas"""\r\n');
  assert.deepStrictEqual(parsearCsv(csv), [
    ['id', 'texto'],
    ['1', 'con, coma'],
    ['2', 'con "comillas"'],
  ]);
});

// ---------- exportacion con datos ----------

test('exporta las cinco tablas reales y el conteo coincide con la base', () => {
  const dir = dirTemporal();
  const rutaDb = crearBase(path.join(dir, 'prueba.sqlite'));
  const salida = path.join(dir, 'out');
  const resumen = exportar({ db: rutaDb, out: salida });

  assert.deepStrictEqual(
    resumen.tablas.map((t) => t.nombre),
    TABLAS_CONOCIDAS
  );
  const db = new DatabaseSync(rutaDb, { readOnly: true });
  for (const t of TABLAS_CONOCIDAS) {
    const esperadas = Number(db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c);
    const csv = fs.readFileSync(path.join(salida, `${t}.csv`), 'utf8');
    const filas = parsearCsv(csv);
    assert.strictEqual(filas.length - 1, esperadas, `${t}: filas de CSV != COUNT(*)`);
    assert.strictEqual(resumen.totales.por_tabla[t], esperadas, `${t}: resumen != base`);
    const columnas = db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
    assert.deepStrictEqual(filas[0], columnas, `${t}: encabezado != esquema`);
  }
  db.close();
  assert.strictEqual(resumen.totales.filas, 9);
  assert.strictEqual(resumen.totales.sumas['quotes.total_ars'], 98100);
  assert.deepStrictEqual(resumen.totales.quotes_por_estado, { draft: 2, sent: 1 });
  assert.strictEqual(resumen.base.integrity_check, 'ok');

  // El resumen en disco es el mismo objeto que devuelve la funcion.
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(salida, 'resumen.json'), 'utf8')), resumen);
});

test('un campo con coma, comillas y salto de linea sobrevive el ida y vuelta', () => {
  const dir = dirTemporal();
  const rutaDb = crearBase(path.join(dir, 'prueba.sqlite'));
  const salida = path.join(dir, 'out');
  exportar({ db: rutaDb, out: salida });

  const crudo = fs.readFileSync(path.join(salida, 'quotes.csv'), 'utf8');
  assert.ok(
    crudo.includes('"buenas tardes, necesito 10 bolsas de cemento ""Loma Negra"",\ny algo mas"'),
    'el campo peligroso no quedo escapado como manda RFC 4180'
  );

  const filas = parsearCsv(crudo);
  const encabezado = filas[0];
  const fila = filas.find((f) => f[encabezado.indexOf('token')] === 'aB3dEf7h');
  assert.ok(fila, 'no se encontro la fila del quote');
  assert.strictEqual(
    fila[encabezado.indexOf('raw_text')],
    'buenas tardes, necesito 10 bolsas de cemento "Loma Negra",\ny algo mas'
  );
  assert.strictEqual(fila[encabezado.indexOf('customer_name')], 'Juana, "la ferretera"');
  assert.strictEqual(fila[encabezado.indexOf('customer_phone')], '', 'NULL debe salir como campo vacio');

  const leads = parsearCsv(fs.readFileSync(path.join(salida, 'leads.csv'), 'utf8'));
  assert.strictEqual(leads[1][2], 'Juana "la jefa", del barrio');
});

test('el export no modifica la base (solo lectura)', () => {
  const dir = dirTemporal();
  const rutaDb = crearBase(path.join(dir, 'prueba.sqlite'));
  const antes = sha256(rutaDb);
  const tamAntes = fs.statSync(rutaDb).size;
  exportar({ db: rutaDb, out: path.join(dir, 'out') });
  assert.strictEqual(sha256(rutaDb), antes, 'el archivo de la base cambio de contenido');
  assert.strictEqual(fs.statSync(rutaDb).size, tamAntes, 'el archivo de la base cambio de tamano');
});

// ---------- bases vacias ----------

test('base con esquema pero sin filas: encabezados, resumen en cero y sin explotar', () => {
  const dir = dirTemporal();
  const rutaDb = crearBase(path.join(dir, 'vacia.sqlite'), { conDatos: false });
  const salida = path.join(dir, 'out');
  const resumen = exportar({ db: rutaDb, out: salida });

  assert.strictEqual(resumen.totales.filas, 0);
  assert.strictEqual(resumen.tablas.length, TABLAS_CONOCIDAS.length);
  for (const t of TABLAS_CONOCIDAS) {
    const csv = fs.readFileSync(path.join(salida, `${t}.csv`), 'utf8');
    const filas = parsearCsv(csv);
    assert.strictEqual(filas.length, 1, `${t}: deberia tener solo el encabezado`);
    assert.ok(filas[0].length > 0, `${t}: encabezado vacio`);
    assert.ok(csv.endsWith('\r\n'), `${t}: falta el CRLF final`);
    assert.strictEqual(resumen.totales.por_tabla[t], 0);
  }
  // Sin filas, las sumas dan 0 (SUM sobre conjunto vacio), no ausentes.
  for (const [col, valor] of Object.entries(resumen.totales.sumas)) {
    assert.strictEqual(valor, 0, `${col} deberia sumar 0 en una base vacia`);
  }
  assert.deepStrictEqual(resumen.tablas_faltantes, []);
});

test('base sin ninguna tabla (archivo de cero bytes) no explota', () => {
  const dir = dirTemporal();
  const rutaDb = path.join(dir, 'cero.sqlite');
  fs.writeFileSync(rutaDb, '');
  const salida = path.join(dir, 'out');
  const resumen = exportar({ db: rutaDb, out: salida });

  assert.strictEqual(resumen.totales.filas, 0);
  assert.deepStrictEqual(resumen.tablas, []);
  assert.deepStrictEqual(resumen.tablas_faltantes, TABLAS_CONOCIDAS);
});

// ---------- CLI ----------

test('CLI: --db y --out, codigo 0 y archivos en el directorio pedido', () => {
  const dir = dirTemporal();
  const rutaDb = crearBase(path.join(dir, 'prueba.sqlite'));
  const salida = path.join(dir, 'salida');
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'export.js'), '--db', rutaDb, '--out', salida], {
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const resumen = JSON.parse(r.stdout);
  assert.strictEqual(resumen.totales.filas, 8);
  for (const t of TABLAS_CONOCIDAS) assert.ok(fs.existsSync(path.join(salida, `${t}.csv`)), `falta ${t}.csv`);
  assert.ok(fs.existsSync(path.join(salida, 'resumen.json')));
});

test('CLI: base inexistente sale con error claro y no crea nada', () => {
  const dir = dirTemporal();
  const salida = path.join(dir, 'salida');
  const r = spawnSync(
    process.execPath,
    [path.join(RAIZ, 'scripts', 'export.js'), '--db', path.join(dir, 'no-existe.sqlite'), '--out', salida],
    { encoding: 'utf8' }
  );
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /no existe la base/);
  assert.strictEqual(fs.existsSync(salida), false);
});

test('parsearArgs: defaults, --tablas, flags desconocidos y valor faltante', () => {
  const d = parsearArgs([]);
  assert.strictEqual(d.integridad, true);
  assert.deepStrictEqual(d.tablas, TABLAS_CONOCIDAS);

  const p = parsearArgs(['--db', '/tmp/x.sqlite', '--out', '/tmp/o', '--tablas', 'quotes,leads', '--sin-integridad']);
  assert.strictEqual(p.db, '/tmp/x.sqlite');
  assert.strictEqual(p.out, '/tmp/o');
  assert.deepStrictEqual(p.tablas, ['quotes', 'leads']);
  assert.strictEqual(p.integridad, false);

  assert.throws(() => parsearArgs(['--inventado']), /parametro desconocido/);
  assert.throws(() => parsearArgs(['--db']), /falta el valor de --db/);
  assert.throws(() => parsearArgs(['--tablas', 'quotes; drop table quotes']), /nombre de tabla invalido/);
});

test('exportar rechaza una base inexistente sin tocar el disco', () => {
  const dir = dirTemporal();
  assert.throws(
    () => exportar({ db: path.join(dir, 'no.sqlite'), out: path.join(dir, 'out') }),
    /no existe la base/
  );
});
