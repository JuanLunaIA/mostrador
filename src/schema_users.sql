-- Schema de cuentas de usuario (APAGADO por defecto).
--
-- NO lo aplica src/db.js: se ejecuta sólo si alguien llama a
-- auth.applySchema(db). Las tablas usan prefijo users_ y parámetros
-- posicionales `?` en el código (ADR-001).

CREATE TABLE IF NOT EXISTS users_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  nombre        TEXT,
  -- Formato scrypt$N$r$p$keylen$salt$hash (salt por usuario).
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  disabled_at   TEXT
);

CREATE TABLE IF NOT EXISTS users_sessions (
  -- sha256 hexadecimal del token. El token en claro NUNCA se persiste.
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id    INTEGER NOT NULL REFERENCES users_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  -- Token CSRF de la sesión. Se genera junto con la sesión y viaja en un campo
  -- oculto del formulario; nunca se escribe en una cookie legible por JS.
  csrf_token TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_sessions_user ON users_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_sessions_expires ON users_sessions(expires_at);
