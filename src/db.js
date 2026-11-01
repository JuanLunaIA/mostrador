'use strict';
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'mostrador.sqlite');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function open() {
  try {
    const Better = require('better-sqlite3');
    return { db: new Better(DB_PATH), driver: 'better-sqlite3' };
  } catch {
    const { DatabaseSync } = require('node:sqlite');
    return { db: new DatabaseSync(DB_PATH), driver: 'node:sqlite' };
  }
}

const { db, driver } = open();
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

if (DB_PATH === ':memory:') db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

module.exports = { db, driver, DB_PATH };
