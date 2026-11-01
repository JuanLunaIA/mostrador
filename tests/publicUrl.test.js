'use strict';
// La URL "Ver online" del email salia de req.get('host'), que lo elige el cliente:
// con `Host: evil.com` el link del email apuntaba a evil.com. La URL publica no debe
// depender nunca del request.
const test = require('node:test');
const assert = require('node:assert');
const { urlPublica } = require('../src/lib/publicUrl');

function conEnv(extra, fn) {
  const antes = { ...process.env };
  Object.assign(process.env, extra);
  try { return fn(); } finally {
    for (const k of Object.keys(extra)) delete process.env[k];
    Object.assign(process.env, antes);
  }
}

test('usa PUBLIC_BASE_URL cuando esta definida', () => {
  conEnv({ PUBLIC_BASE_URL: 'https://vps-6576881-x.dattaweb.com' }, () => {
    assert.strictEqual(urlPublica('abc12345'), 'https://vps-6576881-x.dattaweb.com/q/abc12345');
  });
});

test('le saca la barra final a PUBLIC_BASE_URL (no genera //q/)', () => {
  conEnv({ PUBLIC_BASE_URL: 'https://ejemplo.com/' }, () => {
    assert.strictEqual(urlPublica('t0k3n000'), 'https://ejemplo.com/q/t0k3n000');
  });
});

test('sin PUBLIC_BASE_URL cae a localhost con el puerto, nunca al Host del request', () => {
  conEnv({ PUBLIC_BASE_URL: '', PORT: '3000' }, () => {
    assert.strictEqual(urlPublica('abc12345'), 'http://127.0.0.1:3000/q/abc12345');
  });
});

test('un token con caracteres raros no rompe la URL pero tampoco se escapa', () => {
  conEnv({ PUBLIC_BASE_URL: 'https://ejemplo.com' }, () => {
    const u = urlPublica('a/b?c=d#e');
    assert.ok(u.startsWith('https://ejemplo.com/q/'), u);
    assert.ok(!u.includes('?'), 'no deberia introducir query string');
    assert.ok(!u.includes('#'), 'no deberia introducir fragmento');
  });
});
