# Digest 04 — Ecosistema DonWeb y la API de EnvíaloSimple

## Productos y encaje en Mostrador

| Producto | Uso concreto | Fase |
|---|---|---|
| **Cloud Server** | Aloja la app (Ubuntu 24.04, nginx → Node `127.0.0.1:3000`, systemd) | Hackatón |
| **EnvíaloSimple Transaccional** | Entrega el presupuesto al cliente | Hackatón |
| **Dominios** | `mostrador.com.ar` white-label por ferretería | Piloto |
| **EnvíaloSimple Marketing** | Promo semanal del dueño a su cartera | Piloto |
| **SitioSimple** | Landing pública generada desde el catálogo | Escala |
| **Hosting compartido** | No aplica: la app necesita proceso Node | — |

## EnvíaloSimple Transaccional — contrato verificado

```
POST https://api.envialosimple.email/api/v1/mail/send
     (fallback: https://backend.envialosimple.email/api/v1/mail/send)
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "from": "presupuestos@midominio.com",     // dominio verificado en la cuenta
  "to":   [{ "email": "cliente@ejemplo.com" }],
  "subject": "Presupuesto Ferretería San Luis — $15.450",
  "html": "<html>…</html>",
  "preview_text": "…"                        // máx 150 caracteres
}
```

**Restricciones reales:**
- **No hay CC ni BCC.** Sólo `to`, máximo 10 destinatarios (el artículo de soporte antiguo dice 20; el vigente dice 10 — usar 10).
- `html`, `text` o `templateID`: hay que informar exactamente uno de los tres (`text_html_templateID_required`).
- Adjuntos: array, `disposition` obligatorio (`inline` requiere `id`), máximo 15 MB por adjunto en Base64.
- `preview_text` máximo 150 caracteres; `html` máximo 2 M de caracteres.
- `substitutions` y `context` son mutuamente excluyentes.
- Errores de dominio: `domain_invalid`, `domain_not_allowed`, `domain_blocked`, `domain_send_disabled` — todos apuntan a que el remitente no está verificado.

**Cómo crear la clave API:** panel de EnvíaloSimple → API → Crear clave. Requiere el dominio del remitente verificado.

## Datos corporativos (para el pitch)

Fundada en Rosario en 2002 · **400.000+ servicios activos** · **25.000+ clouds activos** · CEO Guillermo Tornatore · lema: "Internet para todos".

## Por qué esto importa al jurado

DonWeb vende infraestructura a PyMEs. Un producto que (a) corre en su cloud, (b) manda por su API de email y (c) tiene un camino plausible de ofrecerse a sus 400.000 servicios activos **aumenta el valor de lo que ya venden**. El canal es el argumento de escala y es la ventaja injusta del Lean Canvas.
