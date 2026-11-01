# ADR-001 — SQLite nativo (`node:sqlite`) con fallback a `better-sqlite3`

**Estado:** aceptado · 2026-11-01

## Contexto

El runtime es Node 26 (ABI **147**). `better-sqlite3@13` no publica binario precompilado para ABI 147, así que instalarlo dispara una compilación nativa (`node-gyp` + toolchain de C++) que puede fallar en un servidor recién creado y, en el peor caso, cuesta 5-10 minutos de la ventana de hackatón. El despliegue es un único proceso en un único servidor, con la base en un archivo local que nunca se expone a internet.

## Decisión

`src/db.js` intenta `require('better-sqlite3')` y, si no está disponible, cae a `node:sqlite` (`DatabaseSync`), que viene en el runtime y no necesita compilación. Ambas exponen la misma superficie (`prepare`, `run`, `all`, `get`, `exec`).

Invariante para que el adapter siga siendo honesto: **sólo parámetros posicionales `?`**, nunca parámetros nombrados (`:name` / `@name`), porque las dos librerías los interpretan distinto.

## Consecuencias

- (+) Cero dependencias nativas, cero toolchain en el servidor, arranque en segundos.
- (+) La base es un archivo: backup = copiar, migrar = copiar, snapshot de DonWeb incluido.
- (−) Un solo proceso puede escribir. No hay concurrencia multi-instancia.
- (−) Sin extensiones de SQLite ni funciones definidas por el usuario.
- **Disparador de revisión:** más de una instancia, o más de ~5 escrituras/segundo sostenidas → migrar a Postgres.

## Verificación

`node --test tests/db.test.js` corre contra `:memory:` y reporta el driver en uso; cubre las 5 tablas y que las foreign keys estén activas.
