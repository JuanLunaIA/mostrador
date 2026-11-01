#!/usr/bin/env node
// Mostrador SQLite hot-backup / verify helper (no sqlite3 CLI needed).
// Uses node:sqlite. VACUUM INTO makes a consistent, defragmented copy that
// reads from a single transaction, so WAL content IS included — unlike cp.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const TABLES = ['products', 'quotes', 'impact_events'];

function open(p, readOnly) {
  const db = new DatabaseSync(p, { readOnly: !!readOnly });
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

function integrity(db) {
  return db.prepare('PRAGMA integrity_check').get().integrity_check;
}

function counts(db) {
  const out = {};
  for (const t of TABLES) {
    try {
      out[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
    } catch (e) {
      out[t] = `ERR: ${e.message}`;
    }
  }
  return out;
}

function tables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
}

const cmd = process.argv[2];

if (cmd === 'inspect') {
  const file = process.argv[3];
  const db = open(file, true);
  const mode = db.prepare('PRAGMA journal_mode').get().journal_mode;
  const ok = integrity(db);
  const c = counts(db);
  console.log(JSON.stringify({ file, journal_mode: mode, integrity_check: ok, tables: tables(db), counts: c }, null, 2));
  db.close();
} else if (cmd === 'backup') {
  const src = process.argv[3];
  const dest = process.argv[4];
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    console.error(`refusing to overwrite existing backup: ${dest}`);
    process.exit(1);
  }
  const db = open(src, false);
  const before = counts(db);
  // VACUUM INTO = consistent snapshot including WAL frames, single file out.
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  const after = counts(db);
  const size = fs.statSync(dest).size;
  console.log(JSON.stringify({ src, dest, size_bytes: size, counts_before: before, counts_after: after }, null, 2));
  db.close();
  // Verify the copy itself.
  const vdb = open(dest, true);
  const ok = integrity(vdb);
  const vc = counts(vdb);
  const vmode = vdb.prepare('PRAGMA journal_mode').get().journal_mode;
  console.log(JSON.stringify({ verify: dest, journal_mode: vmode, integrity_check: ok, counts: vc }, null, 2));
  vdb.close();
  if (ok !== 'ok') {
    console.error('INTEGRITY CHECK FAILED ON BACKUP');
    process.exit(2);
  }
} else if (cmd === 'checkpoint') {
  const src = process.argv[3];
  const db = open(src, false);
  const r = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  console.log(JSON.stringify({ wal_checkpoint_truncate: r }));
  db.close();
} else {
  console.error('usage: sqlite-backup.js inspect <file> | backup <src> <dest> | checkpoint <file>');
  process.exit(64);
}
