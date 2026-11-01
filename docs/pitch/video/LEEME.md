# Video de 3 minutos (generado, no filmado)

Video pitch de Mostrador: 6 slides, narración en español rioplatense, 1920×1080.
**La voz es sintética** — se genera con el modelo de TTS de OpenAI, no la grabó una
persona. Se declara acá y en el guion porque no es un detalle menor cuando el jurado
evalúa "presentación".

## Cómo se regenera (3 comandos)

```bash
# 1. Slides a imagen (necesita el deck)
npx -y @marp-team/marp-cli@latest --images png --image-scale 2 ../slides.md -o slide.png

# 2. Voz: lee narracion.json y escribe voz-1..6.mp3
python3 generar-voz.py

# 3. Arma el video: segmentos con fundido + concat
./armar-video.sh
```

Salida: `salida.mp4`. Los `.mp3`, `.png` y `.mp4` están en `.gitignore`: pesan y se
regeneran solos con los scripts de arriba.

## Piezas

| Archivo | Qué es |
|---|---|
| `narracion.json` | El texto exacto de cada bloque + la configuración de voz (voz, modelo, instrucciones de estilo) |
| `generar-voz.py` | Llama a `POST /v1/audio/speech`. Busca la clave en `context/raw/Datos.txt` y después en `~/.hermes/.env`; no la imprime nunca |
| `armar-video.sh` | Por cada slide: 0,5 s de silencio antes, la voz, 0,8 s de respiro. Escala a 1080p con fondo `#0f172a`, fundido de entrada, y concatena |

## Duraciones medidas

| Bloque | Duración | Palabras |
|---|---|---|
| 1 · El problema | 30,9 s | 68 |
| 2 · Qué hace | 18,1 s | 40 |
| 3 · La decisión de diseño | 27,1 s | 55 |
| 4 · Corriendo ahora | 23,7 s | 52 |
| 5 · Impacto | 20,1 s | 39 |
| 6 · Cierre | 18,6 s | 44 |
| **Total** | **2 min 19 s** | **298** |

Queda por debajo de los 3 minutos a propósito: 129 palabras por minuto es un ritmo
cómodo para escuchar, y un video que sobra se corta peor que uno que falta.

## Qué NO promete el video

- No dice que el email llega: dice que sale en modo de prueba declarado y que pasar a
  real es una variable de entorno.
- No dice que hay clientes: no hay ninguno todavía.
- Los 20 minutos por presupuesto se dicen como supuesto, no como medición.
- Las latencias son las medidas contra la URL pública (p50 1135 ms, p95 1185 ms).
