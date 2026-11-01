# ADR-004 — Primitivas de cuentas de usuario, implementadas y apagadas por defecto

**Estado:** aceptado (implementado, **NO activado**) · 2026-11-01

## Contexto

Mostrador hoy no tiene cuentas: el flujo público crea un presupuesto y lo identifica con un token aleatorio en la URL (`/q/:token`), sin login. Eso es suficiente para la demo y para el uso real de una ferretería chica.

A futuro hace falta que cada ferretería tenga su panel: varias personas atendiendo, historial propio, permisos. Eso pide usuarios y sesiones. Pero el hackatón tiene una ventana de 20 minutos para esta entrega y **la aplicación ya está corriendo en producción** (`https://vps-6576881-x.dattaweb.com`). Meter auth a medias en el flujo público es la peor combinación posible: más superficie de ataque, cero beneficios para el usuario actual.

## Decisión

Se agregan tres piezas nuevas, **sin tocar nada existente**:

1. `src/schema_users.sql` — tablas `users_users` y `users_sessions`, con prefijo para no chocar con `quotes`/`leads`/etc. No se aplica sola: la ejecuta únicamente `auth.applySchema(db)`. Todos los queries usan parámetros posicionales `?` (ADR-001); nada de parámetros nombrados.
2. `src/services/auth.js` — primitivas puras, con la base inyectada como parámetro:
   - `hashPassword` / `verifyPassword` con **scrypt de `node:crypto`**, salt aleatorio de 16 bytes por usuario, `N=32768, r=8, p=1`, hash de 64 bytes y comparación con `crypto.timingSafeEqual`.
   - `createUser` / `findUserByEmail`, email normalizado y `UNIQUE` en la base.
   - `createSession` / `validateSession` / `revokeSession`: token de 32 bytes en base64url (43 caracteres), vencimiento a 7 días, revocación por fila.
3. `tests/auth.test.js` — 9 tests con `node:test`, incluido el que escanea **todas** las tablas para probar que el token en claro no está guardado.

**Apagado por defecto:** todas las funciones que tocan la base llaman a `assertEnabled()` y tiran `AUTH_DISABLED` si `AUTH_ENABLED !== "true"`. `app.js` y `src/routes/*` no importan este módulo, `src/db.js` no aplica el schema y no hay ninguna vista ni cookie nueva. El flag se lee en cada llamada, no al importar. Los helpers puros de hash se pueden probar sin habilitar nada, porque no escriben.

### Por qué el token de sesión se guarda hasheado

El token es una **credencial bearer**: quien lo tiene, entra. Si se guardara en claro y se filtra la base (backup mal compartido, SQL injection futura, una copia del `.sqlite` en un pendrive), el atacante no necesitaría crackear nada: copia el valor en la cookie y ya está adentro, con la sesión vigente.

Guardando `sha256(token)`:

- La base filtrada sólo entrega digests. Un token de 32 bytes aleatorios (256 bits) no se puede revertir ni adivinar; no hay diccionario que ayude.
- La validación sigue siendo O(1): se hashea el token recibido y se busca por `token_hash` (PK).
- El costo es que no se puede "recuperar" un token para mostrarlo de nuevo. No hace falta: se emite uno nuevo. Revocar es borrar/expirar la fila.
- Es la misma lógica por la que no se guarda la contraseña: la base no debe alcanzar para suplantar al usuario.

El token en claro se devuelve **una sola vez** desde `createSession`. No se loguea ni se persiste.

### Por qué scrypt y no bcrypt/argon2

bcrypt o argon2 implican una dependencia nativa y, con Node 26 (ABI 147), el riesgo de compilación que ya documentó el ADR-001. scrypt viene en `node:crypto`, es memory-hard y no agrega ni un byte a `node_modules`. Si mañana se quiere argon2id, el formato guardado incluye algoritmo y parámetros (`scrypt$N$r$p$keylen$salt$hash`), así que se puede migrar verificando viejo y rehasheando al login.

## Por qué NO se activa en esta entrega

No es sólo falta de tiempo: es que una auth a medio hacer es **peor que no tener auth**.

Para prender esto de verdad hay que auditar el flujo completo, y ninguna de estas cosas está hecha:

- Cookie de sesión con `HttpOnly`, `Secure` y `SameSite`, y rotación del token al login (evitar fijación de sesión).
- CSRF en todos los formularios que mutan estado.
- Rate limiting y bloqueo progresivo en login (hoy no hay ninguna defensa contra fuerza bruta).
- Recuperación de contraseña y verificación de email: sin eso, un usuario que se equivoca al registrarse queda afuera para siempre.
- Mensajes y tiempos que no permitan enumerar cuentas.
- Limpieza de sesiones vencidas y política de revocación al cambiar contraseña.
- Pruebas de integración con el flujo de presupuestos y revisión de que el token público `/q/:token` no se debilite.

El reloj de esta entrega no alcanza para auditar todo eso con la seriedad que pide producción. Prender un login sin esas piezas convierte un producto que hoy funciona en uno con una puerta trasera a medio cerrar. Por eso las primitivas quedan **listas, testeadas y aisladas**, pero nadie las llama.

## Consecuencias

- (+) Las piezas están probadas y no agregan dependencias ni tocan el flujo vivo.
- (+) Activar es una decisión explícita (`AUTH_ENABLED=true`) más el cableado de rutas, no reescribir la criptografía.
- (+) El esquema no se aplica solo: producción no gana tablas vacías por accidente.
- (−) Es código que hoy no se usa; hay que revisarlo cuando se active.
- (−) Sin UI, sin cookies, sin recuperación de cuenta: no es una feature visible.
- **Disparador de revisión:** cuando exista la primera pantalla de login. Antes de prender `AUTH_ENABLED` hay que cerrar la lista de arriba y agregar tests de integración HTTP (cookie, CSRF, rate limit), no sólo unitarios.

## Verificación

Corrida completa al cierre de esta entrega (28 tests previos + 9 nuevos):

```text
$ node --test tests/
...
ℹ tests 37
ℹ suites 0
ℹ pass 37
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2726.387201
```

Sólo el archivo nuevo:

```text
$ node --test tests/auth.test.js
✔ por defecto las cuentas estan APAGADAS y no escriben nada
✔ hash + verify: la contrasena correcta pasa y el formato es scrypt
✔ hash + verify: contrasena incorrecta, vacia o hash corrupto fallan
✔ misma contrasena, dos usuarios: hashes distintos por salt y ambos verifican
✔ sesion valida: token opaco de 32 bytes y usuario correcto
✔ el token en claro NO se guarda en la base: solo sha256
✔ sesion vencida: validateSession devuelve null
✔ sesion revocada: deja de valer y revocar dos veces devuelve false
✔ token inexistente o con formato invalido no valida
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

Los tests cubren: hash + verify correcto, contraseña incorrecta/vacía/hash corrupto, salts distintos para la misma clave, sesión válida, vencida por reloj inyectado, revocada, token inexistente o mal formado, y el escaneo de todas las tablas para confirmar que el token en claro no aparece (sólo su sha256 hexadecimal).
