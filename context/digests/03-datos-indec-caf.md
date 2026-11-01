# Digest 03 — Datos INDEC y CAF (verificados contra el PDF primario)

Los PDFs primarios están en `context/raw/` (fuera de git).

## INDEC — EPH, 2° trimestre 2026

**Archivo:** `context/raw/Informe2.pdf` · *Informes técnicos Vol. 10, n° 227 · Trabajo e ingresos Vol. 10, n° 8 · Mercado de trabajo. Tasas e indicadores socioeconómicos (EPH), segundo trimestre de 2026.*

### ✅ VERIFICADO — Cuadro 3.2 "Principales indicadores, por áreas geográficas"

| Aglomerado | Tasa de actividad | Tasa de empleo | **Tasa de desocupación** |
|---|---|---|---|
| **Gran Rosario** | 53,0 | 46,9 | **11,5** |
| Gran Córdoba | 50,9 | 45,5 | 10,5 |
| Bahía Blanca-Cerri | 50,7 | 45,8 | 9,7 |
| Gran La Plata | 51,5 | 47,0 | 8,7 |
| Gran Santa Fe | 44,8 | 41,0 | 8,6 |
| Gran Mendoza | 50,3 | 46,2 | 8,1 |

**Gran Rosario: 11,5% de desocupación — la tasa más alta entre los 31 aglomerados urbanos del país.**

Consistencia interna verificada: 53,0 × (1 − 0,115) = 46,9 ✓ (actividad × empleo = empleo).

### ❌ RETIRADO — el "≈45% de empleo asalariado no registrado"

El dossier de investigación previo atribuía al INDEC EPH un "≈45% de asalariado no registrado en Gran Rosario". **Esa cifra no aparece en este informe.** Buscando "no registrado" en el texto completo del PDF sólo aparece la leyenda de tabla `"." Dato no registrado`.

**Decisión:** la cifra se retira del README, del pitch y de toda comunicación. No se puede sostener con la fuente que se está entregando. Si se quiere usar la informalidad como argumento, hay que buscarla en el cuadro específico de la EPH o en otra publicación del INDEC y citarla con precisión.

## CAF — *Las pymes en Argentina* (2024)

**Archivo:** `context/raw/Informe1.pdf`

| Dato | Valor | Estado |
|---|---|---|
| Microempresas sobre el total de firmas | ≈75% | Citado del informe |
| Pequeñas empresas | ≈19% | Citado del informe |
| Pymes que suman más de 3 empleados de un período al otro | ≈15% | Citado del informe |

*Nota: estos tres valores provienen del informe CAF según lo documentado en el dossier; deben reconfirmarse página por página contra `context/raw/Informe1.pdf` antes de publicarlos en un material que no sea de hackatón.*

## Regla de uso

- El **11,5%** es el único número del INDEC que se puede citar hoy con respaldo primario. Va siempre con la referencia "INDEC, EPH 2° trimestre 2026, Cuadro 3.2".
- Todo número que no esté en esta card **no se usa**. Si hace falta uno nuevo, se verifica primero y se agrega acá después.
