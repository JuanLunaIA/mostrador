# Cadena de cambio — Mostrador

| Hoy (baseline citado) | Intervención (feature) | Cambio esperado | Indicador (IRIS+) |
|---|---|---|---|
| ~20 min por presupuesto armado a mano en el mostrador (releer el chat, buscar precios en planilla, reescribirlo). **Baseline a validar con cronometraje real — hoy es supuesto.** | Generador IA de presupuestos con catálogo real (core flow) | 20 min → ~2 min por presupuesto; ~4 h/semana → ~25 min/semana por mostrador | **Hours saved** |
| Desocupación 11,5% en Gran Rosario, la más alta entre los 31 aglomerados (INDEC, EPH 2° trimestre 2026, Cuadro 3.2) | Presupuestos y pedidos ordenados y digitalizados por cliente | Más PyMEs con historial propio y capacidad de sostener o crear empleo | **Jobs Created/Supported (FTE)** |
| ≈75% del entramado PyME argentino son microempresas y ≈19% pequeñas (CAF, *Las pymes en Argentina*, 2024), en su mayoría sin herramientas digitales propias | Mostrador digital corriendo sobre infraestructura DonWeb | PyMEs micro digitalizadas con una herramienta que no requiere saber de tecnología | **SME clients reached** |

**ODS:** 8.3 (formalización y crecimiento de MiPyMEs) y 9.3 (acceso de pequeñas empresas a servicios y cadenas de valor).

## Supuestos de la cadena (declarados, no ocultos)

1. El baseline de 20 minutos **no está medido**. Es el eslabón más débil: si el real es 5 minutos, el ahorro se reduce a un tercio y el caso de negocio cambia.
2. Se asume que un presupuesto digital ordenado mejora la capacidad de la PyME de sostener empleo. Es una hipótesis causal, no un dato.
3. `SME clients reached` se puede instrumentar hoy (cada presupuesto = 1 registro en `impact_events`). `Jobs Created/Supported` requiere seguimiento a 6-12 meses y no se puede afirmar en el hackatón.

## Cómo se mide hoy, en el producto

```
$ curl -sS http://<IP>/api/impact
{"presupuestos":5,"monto_ars":373350,"emails":1,"minutos_ahorrados":90,"horas_ahorradas":1.5,"leads":1}
```

Cada fila de `impact_events` es un evento real: `presupuesto_emitido` suma 18 minutos ahorrados, `email_enviado` registra la entrega. El contador de `/impacto` lee de ahí, en vivo. No hay números inventados en la UI.
