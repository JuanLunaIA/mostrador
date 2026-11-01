#!/usr/bin/env bash
# Arma el video pitch: 6 slides PNG + 6 pistas de voz, con silencio de respiro
# entre bloques, fundido y 1920x1080. Sin dependencias raras: solo ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"

W=1920; H=1080; FPS=30
LEAD=0.50   # silencio antes de que arranque la voz
TAIL=0.80   # respiro despues de cada bloque

rm -f seg-*.mp4 lista.txt salida.mp4

for n in 1 2 3 4 5 6; do
  img=$(printf "slide.%03d.png" "$n")
  voz="voz-$n.mp3"
  [ -f "$img" ] || { echo "falta $img"; exit 1; }
  [ -f "$voz" ] || { echo "falta $voz"; exit 1; }

  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -framerate $FPS -i "$img" \
    -i "$voz" \
    -filter_complex "[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,\
pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,setsar=1,format=yuv420p,\
fade=t=in:st=0:d=0.45[v];\
[1:a]adelay=${LEAD}s:all=1,apad=pad_dur=${TAIL},aresample=48000[a]" \
    -map "[v]" -map "[a]" \
    -c:v libx264 -preset medium -crf 20 -tune stillimage -g 60 \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -shortest -movflags +faststart "seg-$n.mp4"
  echo "  segmento $n listo · $(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "seg-$n.mp4" | cut -c1-5) s"
  echo "file 'seg-$n.mp4'" >> lista.txt
done

ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i lista.txt \
  -c copy -movflags +faststart salida.mp4

# Normalizacion de volumen: sin esto el audio queda ~-28 dB y en un proyector no se
# escucha. -16 LUFS es el estandar de las plataformas de video; TP -1.5 dB evita clipping.
ffmpeg -y -hide_banner -loglevel error -i salida.mp4 -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 192k -movflags +faststart pitch-mostrador.mp4
rm -f seg-*.mp4 salida.mp4 lista.txt f1.png f5.png

echo
echo "=== VIDEO FINAL ==="
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate \
  -of default=nw=1 pitch-mostrador.mp4 | sed 's/^/  /'
