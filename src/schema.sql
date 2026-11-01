CREATE TABLE IF NOT EXISTS products (
  sku        TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  unidad     TEXT NOT NULL,
  precio_ars INTEGER NOT NULL CHECK (precio_ars >= 0),
  aliases    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS quotes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  token          TEXT NOT NULL UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  raw_text       TEXT NOT NULL,
  customer_name  TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  items_json     TEXT NOT NULL,
  total_ars      INTEGER NOT NULL DEFAULT 0,
  ai_mode        TEXT NOT NULL,
  ai_latency_ms  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft',
  sent_at        TEXT
);

CREATE TABLE IF NOT EXISTS ai_calls (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id          INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
  model             TEXT,
  mode              TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms        INTEGER NOT NULL DEFAULT 0,
  schema_ok         INTEGER NOT NULL DEFAULT 0,
  repair_attempts   INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS impact_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id          INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL,
  minutos_ahorrados INTEGER NOT NULL DEFAULT 0,
  monto_ars         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id   INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  email      TEXT NOT NULL,
  nombre     TEXT,
  origen     TEXT NOT NULL DEFAULT 'demo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(token);
CREATE INDEX IF NOT EXISTS idx_impact_created ON impact_events(created_at);
