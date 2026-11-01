# Runbook del día — DonWeb Day Rosario 2026

**Ventana real:** 15:15 (revelación) → 18:30 (deadline duro). **URL pública o descalificado (§3.7).**

| Hora | Qué pasa | Gate |
|---|---|---|
| 15:15 | Revelación de la consigna | Consigna leída, actora elegida |
| 15:15–15:50 | Encuadre: fórmula del problema, Lean Canvas, elección del core flow | Frase de problema escrita en el README, commit #1 |
| 15:50–17:20 | Build del core flow E2E, sin features accesorias | `POST /api/quotes` devuelve presupuesto cotizado |
| **17:20** | **CHECKPOINT: ¿core flow E2E?** | **SÍ** → seguir. **NO** → **regla de corte**: borrar todo salvo la pantalla principal y deployar lo que anda |
| 17:30 | **Empezar el deploy.** No a las 18:20 | `curl http://<IP>/api/healthz` responde desde afuera |
| 18:00 | Hardening: `.env` 600, DB en localhost, nginx `-t`, systemd `enable` | `systemctl is-active mostrador` = active |
| 18:30 | **Entrega: URL + repo, antes de las 18:30** | Entregado |
| 18:30–19:00 | Ensayar el guion de 3 min, dos veces completas | Menos de 3:00 cronometrado |
| 19:00 | Escenario | — |

## Pre-deploy (5 minutos, no más)

```bash
npm test            # 7/7
npm run evals       # 5/5 contra el server local
git status          # limpio
git push            # repo público actualizado
```

## Verificación post-deploy (la que de verdad importa)

```bash
curl -sS http://<IP>/api/healthz          # {"ok":true,...}
curl -sS -o /dev/null -w "%{http_code}" http://<IP>/
```

Y después, **desde un celular con datos móviles (4G), NO desde el wifi del venue**:

1. Abrir `http://<IP>/` — carga la pantalla.
2. Pegar un mensaje de ejemplo, generar el presupuesto, verificar el total.
3. Abrir `/impacto` — los contadores suben.
4. Si algo falla en 4G y funciona en el wifi, es el firewall del panel de DonWeb, no la app.

## Si algo se rompe en el escenario

1. **No improvisar.** Cambiar a la pestaña con la URL ya cargada.
2. Si la app no responde: mostrar `docs/evidencia/*.png` (capturas del flujo real) y decirlo con honestidad: "el flujo corre en el servidor, estas son las capturas de la verificación".
3. Si el email no llega: mostrar `/outbox/:token` o el panel de impacto.

## Después del evento

- Grabar el video de respaldo de 60 s **antes** de las 18:30, no después.
- Guardar el token/snapshot del servidor antes de cualquier cambio.
- Reemplazar la clave compartida de OpenAI en el `.env` del servidor (§4.2: uso post-evento = descalificación).
