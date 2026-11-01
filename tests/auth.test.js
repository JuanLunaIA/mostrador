'use strict';

const test = require('node:test');
const assert = require('node:assert');

// El flag arranca apagado: nos aseguramos de no heredarlo del entorno.
delete process.env.AUTH_ENABLED;

process.env.DB_PATH = ':memory:';
const { db, driver } = require('../src/db');
const auth = require('../src/services/auth');

auth.applySchema(db);

const PASSWORD = 'clave-de-prueba-123';

function withEnabled(fn) {
  const previous = process.env.AUTH_ENABLED;
  process.env.AUTH_ENABLED = 'true';
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.AUTH_ENABLED;
    else process.env.AUTH_ENABLED = previous;
  }
}

function allStoredText() {
  const tables = db.prepare("select name from sqlite_master where type='table'").all();
  const values = [];
  for (const { name } of tables) {
    const rows = db.prepare(`select * from "${name}"`).all();
    for (const row of rows) {
      for (const value of Object.values(row)) {
        if (typeof value === 'string') values.push(value);
        else if (value !== null && value !== undefined) values.push(String(value));
      }
    }
  }
  return values;
}

test('por defecto las cuentas estan APAGADAS y no escriben nada', () => {
  assert.strictEqual(auth.isEnabled(), false);
  assert.throws(
    () => auth.createUser(db, { email: 'apagado@example.com', password: PASSWORD }),
    err => err.code === 'AUTH_DISABLED',
  );
  assert.throws(
    () => auth.createSession(db, 1),
    err => err.code === 'AUTH_DISABLED',
  );
  assert.strictEqual(db.prepare('select count(*) as n from users_users').get().n, 0);
});

test('hash + verify: la contrasena correcta pasa y el formato es scrypt', () => {
  const stored = auth.hashPassword(PASSWORD);
  const parts = stored.split('$');
  assert.strictEqual(parts.length, 7);
  assert.strictEqual(parts[0], 'scrypt');
  assert.strictEqual(parts[1], '32768');
  assert.strictEqual(parts[2], '8');
  assert.strictEqual(parts[3], '1');
  assert.strictEqual(parts[4], '64');
  assert.notStrictEqual(parts[5], PASSWORD, 'el salt no puede ser la clave');
  assert.notStrictEqual(parts[6], PASSWORD, 'el hash no puede ser la clave');
  assert.ok(auth.verifyPassword(PASSWORD, stored));
});

test('hash + verify: contrasena incorrecta, vacia o hash corrupto fallan', () => {
  const stored = auth.hashPassword(PASSWORD);
  assert.strictEqual(auth.verifyPassword('otra-clave', stored), false);
  assert.strictEqual(auth.verifyPassword(PASSWORD + 'x', stored), false);
  assert.strictEqual(auth.verifyPassword('', stored), false);
  assert.strictEqual(auth.verifyPassword(PASSWORD, 'basura'), false);
  assert.strictEqual(auth.verifyPassword(PASSWORD, 'scrypt$0$0$0$0$a$b'), false);
});

test('misma contrasena, dos usuarios: hashes distintos por salt y ambos verifican', () => {
  withEnabled(() => {
    const uno = auth.createUser(db, { email: 'uno@example.com', password: PASSWORD, nombre: 'Uno' });
    const dos = auth.createUser(db, { email: 'DOS@Example.com ', password: PASSWORD });
    assert.notStrictEqual(uno.id, dos.id);
    assert.strictEqual(dos.email, 'dos@example.com', 'el email se normaliza');

    const h1 = db.prepare('select password_hash from users_users where id = ?').get(uno.id).password_hash;
    const h2 = db.prepare('select password_hash from users_users where id = ?').get(dos.id).password_hash;
    assert.notStrictEqual(h1, h2, 'dos hashes iguales implican salt compartido');
    assert.ok(auth.verifyPassword(PASSWORD, h1));
    assert.ok(auth.verifyPassword(PASSWORD, h2));

    assert.throws(
      () => auth.createUser(db, { email: 'uno@example.com', password: 'otra-distinta' }),
      err => err.code === 'EMAIL_TAKEN',
    );
  });
});

test('sesion valida: token opaco de 32 bytes y usuario correcto', () => {
  withEnabled(() => {
    const user = auth.createUser(db, { email: `sesion-${Date.now()}@example.com`, password: PASSWORD });
    const { token, expiresAt } = auth.createSession(db, user.id);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/, '32 bytes en base64url son 43 caracteres');
    assert.ok(Date.parse(expiresAt) > Date.now());

    const found = auth.validateSession(db, token);
    assert.ok(found);
    assert.strictEqual(found.id, user.id);
    assert.strictEqual(found.email, user.email);
  });
});

test('el token en claro NO se guarda en la base: solo sha256', () => {
  withEnabled(() => {
    const user = auth.createUser(db, { email: `hash-${Date.now()}@example.com`, password: PASSWORD });
    const { token } = auth.createSession(db, user.id);

    assert.strictEqual(allStoredText().includes(token), false, 'el token en claro aparecio en la base');
    assert.strictEqual(
      allStoredText().some(v => v.includes(token)),
      false,
      'un fragmento del token en claro aparecio en la base',
    );

    const row = db.prepare('select token_hash from users_sessions where user_id = ?').get(user.id);
    assert.strictEqual(row.token_hash, auth.hashToken(token));
    assert.match(row.token_hash, /^[0-9a-f]{64}$/);
    assert.notStrictEqual(row.token_hash, token);
    assert.strictEqual(Buffer.from(row.token_hash, 'hex').length, 32);
  });
});

test('sesion vencida: validateSession devuelve null', () => {
  withEnabled(() => {
    const user = auth.createUser(db, { email: `vence-${Date.now()}@example.com`, password: PASSWORD });
    const now = Date.now();
    const { token } = auth.createSession(db, user.id, { ttlMs: 60_000, now });

    assert.ok(auth.validateSession(db, token, { now: now + 59_999 }), 'todavia no vencio');
    assert.strictEqual(auth.validateSession(db, token, { now: now + 60_001 }), null, 'vencida');
  });
});

test('sesion revocada: deja de valer y revocar dos veces devuelve false', () => {
  withEnabled(() => {
    const user = auth.createUser(db, { email: `revoca-${Date.now()}@example.com`, password: PASSWORD });
    const { token } = auth.createSession(db, user.id);

    assert.ok(auth.validateSession(db, token));
    assert.strictEqual(auth.revokeSession(db, token), true);
    assert.strictEqual(auth.validateSession(db, token), null);
    assert.strictEqual(auth.revokeSession(db, token), false);
  });
});

test('token inexistente o con formato invalido no valida', () => {
  withEnabled(() => {
    assert.strictEqual(auth.validateSession(db, 'a'.repeat(43)), null);
    assert.strictEqual(auth.validateSession(db, 'no-es-un-token'), null);
    assert.strictEqual(auth.validateSession(db, ''), null);
    assert.strictEqual(auth.validateSession(db, null), null);
    assert.strictEqual(auth.revokeSession(db, 'no-es-un-token'), false);
    assert.ok(['node:sqlite', 'better-sqlite3'].includes(driver), `driver inesperado: ${driver}`);
  });
});
