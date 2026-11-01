'use strict';
// Rate limit simple en memoria, por IP, para las rutas que gastan tokens.
// No es un WAF: es un tope para que una URL pública no queme la clave compartida.
const buckets = new Map();
const VENTANA_MS = 60_000;

function rateLimit({ max = 30, ventanaMs = VENTANA_MS, nombre = 'default' } = {}) {
  return function (req, res, next) {
    if (process.env.RATE_LIMIT === 'off') return next();
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
    const clave = `${nombre}:${ip}`;
    const ahora = Date.now();
    let b = buckets.get(clave);
    if (!b || ahora - b.inicio > ventanaMs) {
      b = { inicio: ahora, n: 0 };
      buckets.set(clave, b);
    }
    b.n += 1;
    if (b.n > max) {
      res.set('Retry-After', String(Math.ceil((b.inicio + ventanaMs - ahora) / 1000)));
      return res.status(429).json({
        error: { code: 'rate_limited', message: `Demasiados pedidos. Probá en ${Math.ceil((b.inicio + ventanaMs - ahora) / 1000)} s.` },
      });
    }
    next();
  };
}

// limpieza periódica para que el Map no crezca sin límite
setInterval(() => {
  const ahora = Date.now();
  for (const [k, b] of buckets) if (ahora - b.inicio > VENTANA_MS * 5) buckets.delete(k);
}, VENTANA_MS).unref();

module.exports = { rateLimit };
