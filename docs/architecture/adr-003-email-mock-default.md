# ADR-003 — EnvíaloSimple implementado contra el contrato real, con `mock` por defecto

**Estado:** aceptado · 2026-11-01

## Contexto

El envío de email por EnvíaloSimple Transaccional exige dos cosas que no están disponibles al momento del build:

1. **El add-on "API o SMTP Premium" contratado.** Verificado en el panel (Cloud & IaaS → API & SMTP Email): la cuenta solo ve la página de contratación, sin servicio activo. Es un producto pago, no una configuración.
2. **El dominio del remitente verificado.** Sin eso, cualquier intento de envío real devuelve `domain_invalid` o `from_required`.

Al mismo tiempo, el email en el flujo es una pieza central del valor (el presupuesto tiene que *llegar*), así que no se puede simplemente omitir.

## Decisión

`src/services/email.js` implementa el request **exacto** que documenta DonWeb:

```
POST https://api.envialosimple.email/api/v1/mail/send
Authorization: Bearer <ENVIALOSIMPLE_API_KEY>
Content-Type: application/json
{ from, to: [{email}], subject, html }
```

Se prueba primero ese host y, si falla por red, `https://backend.envialosimple.email` (el que usa la página de producto). Si `EMAIL_MODE != live` o falta la API key, escribe el mismo HTML en `data/outbox/<token>.html` y lo sirve en `/outbox/:token`.

## Consecuencias

- (+) El paso a producción es una variable de entorno, no reescribir código.
- (+) Se puede demostrar el email completo (HTML, totales, formato) sin credencial.
- (+) **La UI nunca miente:** en mock dice `Modo mock: ver el email`, jamás "enviado". Si el envío live falla, la respuesta es `ok:false` con el error real y también cae a mock marcado.
- (−) Sin cuenta verificada no hay prueba de entrega real. La prueba es de contrato, no de buzón.
- **Disparador de revisión:** obtener cuenta + dominio verificado y hacer un envío real a un buzón propio, verificando llegada (un HTTP 200 **no** prueba entrega).
