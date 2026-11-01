'use strict';
const test = require('node:test');
const assert = require('node:assert');
process.env.DB_PATH = ':memory:';
const { db, driver } = require('../src/db');

test('schema: las 5 tablas existen y foreign_keys esta ON', () => {
  const names = db.prepare("select name from sqlite_master where type='table' order by name").all().map(r => r.name);
  for (const t of ['ai_calls', 'impact_events', 'leads', 'products', 'quotes']) {
    assert.ok(names.includes(t), `falta tabla ${t} (driver=${driver})`);
  }
  assert.strictEqual(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('fk: un impact_event sin quote valido debe fallar', () => {
  assert.throws(() => db.prepare('insert into impact_events (quote_id, tipo) values (?,?)').run(999999, 'x'));
});
