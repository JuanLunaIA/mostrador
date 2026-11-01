#!/usr/bin/env node
'use strict';
// Exportador de datos de Mostrador: CSV por tabla (RFC 4180) + resumen JSON con totales.
//
// Abre la base SIEMPRE en modo solo-lectura y dentro de una transaccion de lectura,
// asi los COUNT(*) y las filas exportadas salen del mismo snapshot. Verifica que el
// conteo coincida antes de escribir nada; si no coincide, falla en vez de mentir.
//
// Uso:
//   node scripts/export.js --db data/mostrador.sqlite --out data/export
//   node scripts/export.js --db /opt/mostrador/data/mostrador.sqlite --out /tmp/export
//   node scripts/export.js --tablas quotes,leads          (solo algunas tablas)
//   node scripts/export.js --sin-integridad               (saltea PRAGMA integrity_check)
//
// Codigos de salida: 0 ok, 1 error de datos/runtime, 2 uso incorrecto.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Orden de exportacion: el negocio primero. Ojo: el esquema real NO tiene
// quote_items (los items viven en quotes.items_json); las hijas son ai_calls
// e impact_events, ambas con FK a quotes(id).
const TABLAS_CONOCIDAS = ['quotes', 'leads', 'ai_calls', 'impact_events', 'products'];

const NOMBRE_RESUMEN = 'resumen.json';

// ---------- CSV (RFC 4180) ----------

// Un campo va entre comillas si (y solo si) contiene coma, comilla doble, CR o LF.
// Adentro, cada comilla doble se duplica. NULL -> campo vacio.
function escaparCampo(valor) {
  if (valor === null || valor === undefined) return '';
  let texto;
  if (typeof valor === 'string') texto = valor;
  else if (typeof valor === 'bigint') texto = valor.toString();
  else if (valor instanceof Uint8Array) texto = Buffer.from(valor).toString('base64');
  else texto = String(valor);
  if (/[",\r\n]/.test(texto)) return '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

// RFC 4180 usa CRLF como fin de linea. Un solo "\r\n" final tras la ultima fila.
function armarCsv(columnas, filas) {
  const lineas = [columnas.map(escaparCampo).join(',')];
  for (const fila of filas) lineas.push(columnas.map((c) => escaparCampo(fila[c])).join(','));
  return lineas.join('\r\n') + '\r\n';
}

// ---------- helpers de esquema ----------

function ident(nombre) {
  return '"' + String(nombre).replace(/"/g, '""') + '"';
}

function existeTabla(db, tabla) {
  return !!db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tabla);
}

function columnasDe(db, tabla) {
  // Se leen del esquema real, nunca de una lista escrita a mano.
  return db.prepare(`PRAGMA table_info(${ident(tabla)})`).all().map((c) => c.name);
}

function contarFilas(db, tabla) {
  return Number(db.prepare(`SELECT COUNT(*) AS c FROM ${ident(tabla)}`).get().c);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ---------- exportacion ----------

function escribirAtomico(destino, contenido) {
  const tmp = path.join(path.dirname(destino), `.${path.basename(destino)}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, contenido);
  fs.renameSync(tmp, destino);
}

// Suma las columnas numericas (INTEGER/REAL), salteando ids: sumar ids no dice nada.
function sumasNumericas(db, tabla, columnas) {
  const filas = db.prepare(`PRAGMA table_info(${ident(tabla)})`).all();
  const numericas = filas
    .filter((c) => /INT|REAL|NUM|DEC|FLOA|DOUB/i.test(c.type || ''))
    .map((c) => c.name)
    .filter((n) => n !== 'id' && !/_id$/.test(n));
  if (!numericas.length) return {};
  const selects = numericas
    .map((n) => `COALESCE(SUM(${ident(n)}), 0) AS ${ident(n)}`)
    .join(', ');
  const row = db.prepare(`SELECT ${selects} FROM ${ident(tabla)}`).get();
  const out = {};
  for (const n of numericas) out[n] = typeof row[n] === 'bigint' ? Number(row[n]) : row[n];
  return out;
}

function desglose(db, tabla, columna) {
  if (!columnasDe(db, tabla).includes(columna)) return null;
  const out = {};
  for (const r of db
    .prepare(`SELECT ${ident(columna)} AS k, COUNT(*) AS c FROM ${ident(tabla)} GROUP BY 1 ORDER BY 2 DESC`)
    .all()) {
    out[r.k === null ? '(sin dato)' : String(r.k)] = Number(r.c);
  }
  return out;
}

/**
 * Exporta la base a CSV + resumen.json. No escribe en la base jamas.
 * @param {{db: string, out: string, tablas?: string[], integridad?: boolean}} opciones
 * @returns {object} el resumen (mismo contenido que resumen.json)
 */
function exportar({ db: dbPath, out: outDir, tablas = TABLAS_CONOCIDAS, integridad = true }) {
  if (!dbPath) throw new Error('falta la ruta de la base (--db)');
  if (!outDir) throw new Error('falta el directorio de salida (--out)');
  const rutaBase = path.resolve(dbPath);
  const rutaOut = path.resolve(outDir);

  if (!fs.existsSync(rutaBase)) throw new Error(`no existe la base: ${rutaBase}`);
  const stat = fs.statSync(rutaBase);
  if (!stat.isFile()) throw new Error(`no es un archivo: ${rutaBase}`);

  const db = new DatabaseSync(rutaBase, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA query_only = 1'); // cinturon y tiradores
  fs.mkdirSync(rutaOut, { recursive: true });
  let transaccion = false;

  try {
    // Snapshot unico: los conteos y las filas se leen de la misma foto.
    db.exec('BEGIN');
    transaccion = true;
    const journal = String(db.prepare('PRAGMA journal_mode').get().journal_mode || '');
    const control = integridad
      ? String(db.prepare('PRAGMA integrity_check').get().integrity_check || '')
      : 'no-verificado';

    const exportadas = [];
    const faltantes = [];
    const totales = { filas: 0, por_tabla: {}, sumas: {} };

    for (const tabla of tablas) {
      if (!existeTabla(db, tabla)) {
        faltantes.push(tabla);
        continue;
      }
      const columnas = columnasDe(db, tabla);
      const filas = db
        .prepare(`SELECT ${columnas.map(ident).join(', ')} FROM ${ident(tabla)} ORDER BY rowid`)
        .all();
      const esperadas = contarFilas(db, tabla);
      if (filas.length !== esperadas) {
        throw new Error(
          `conteo inconsistente en ${tabla}: ${filas.length} filas leidas vs ${esperadas} en COUNT(*)`
        );
      }
      const csv = armarCsv(columnas, filas);
      const nombreArchivo = `${tabla}.csv`;
      escribirAtomico(path.join(rutaOut, nombreArchivo), csv);
      const buf = Buffer.from(csv, 'utf8');
      exportadas.push({
        nombre: tabla,
        archivo: nombreArchivo,
        filas: filas.length,
        columnas,
        bytes: buf.length,
        sha256: sha256(buf),
      });
      totales.filas += filas.length;
      totales.por_tabla[tabla] = filas.length;
      const sumas = sumasNumericas(db, tabla, columnas);
      for (const [k, v] of Object.entries(sumas)) totales.sumas[`${tabla}.${k}`] = v;
    }

    // Desgloses de negocio, solo si las columnas existen en esta version del esquema.
    const desgloses = {
      quotes_por_estado: desglose(db, 'quotes', 'status'),
      quotes_por_ai_mode: desglose(db, 'quotes', 'ai_mode'),
      impact_events_por_tipo: desglose(db, 'impact_events', 'tipo'),
      leads_por_origen: desglose(db, 'leads', 'origen'),
    };
    for (const [k, v] of Object.entries(desgloses)) if (v) totales[k] = v;

    db.exec('COMMIT');
    transaccion = false;

    const resumen = {
      generado_en: new Date().toISOString(),
      base: {
        ruta: rutaBase,
        bytes: stat.size,
        journal_mode: journal,
        integrity_check: control,
      },
      tablas: exportadas,
      tablas_faltantes: faltantes,
      totales,
    };
    escribirAtomico(
      path.join(rutaOut, NOMBRE_RESUMEN),
      JSON.stringify(resumen, null, 2) + '\n'
    );
    return resumen;
  } finally {
    if (transaccion) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* la conexion ya estaba cerrada o sin transaccion */
      }
    }
    db.close();
  }
}

// ---------- CLI ----------

const USO = `uso: node scripts/export.js [--db <ruta>] [--out <dir>] [--tablas a,b] [--sin-integridad]

  --db <ruta>        base SQLite a exportar (default: data/mostrador.sqlite)
  --out <dir>        directorio de salida (default: data/export)
  --tablas a,b       exportar solo esas tablas (default: ${TABLAS_CONOCIDAS.join(',')})
  --sin-integridad   saltear PRAGMA integrity_check (mas rapido en bases grandes)
  -h, --help         mostrar esta ayuda`;

function parsearArgs(argv) {
  const opts = {
    db: path.join('data', 'mostrador.sqlite'),
    out: path.join('data', 'export'),
    tablas: TABLAS_CONOCIDAS.slice(),
    integridad: true,
    ayuda: false,
  };
  const conValor = { '--db': 'db', '--out': 'out', '--tablas': 'tablas' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.ayuda = true;
      continue;
    }
    if (arg === '--sin-integridad') {
      opts.integridad = false;
      continue;
    }
    const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    if (!(flag in conValor)) throw new Error(`parametro desconocido: ${arg}`);
    let valor = inline;
    if (valor === undefined) {
      valor = argv[++i];
      if (valor === undefined || valor.startsWith('--')) throw new Error(`falta el valor de ${flag}`);
    }
    if (flag === '--tablas') {
      const lista = valor.split(',').map((t) => t.trim()).filter(Boolean);
      if (!lista.length) throw new Error('--tablas vino vacio');
      const invalidas = lista.filter((t) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t));
      if (invalidas.length) throw new Error(`nombre de tabla invalido: ${invalidas.join(', ')}`);
      opts.tablas = lista;
    } else {
      opts[conValor[flag]] = valor;
    }
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parsearArgs(argv);
  } catch (e) {
    console.error(`error: ${e.message}\n${USO}`);
    return 2;
  }
  if (opts.ayuda) {
    console.log(USO);
    return 0;
  }
  try {
    const resumen = exportar(opts);
    console.log(JSON.stringify(resumen, null, 2));
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 1;
  }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { escaparCampo, armarCsv, exportar, parsearArgs, TABLAS_CONOCIDAS };
