#!/usr/bin/env python3
"""Genera la narracion del video con la API de TTS de OpenAI.
La clave se lee de ~/.hermes/.env o de context/raw/Datos.txt y NUNCA se imprime."""
import json, os, re, subprocess, sys, urllib.request, urllib.error

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, "..", "..", ".."))


def buscar_clave():
    # Primero la clave del proyecto (la que usa produccion), despues la del entorno.
    fuentes = [os.path.join(RAIZ, "context", "raw", "Datos.txt"), os.path.expanduser("~/.hermes/.env")]
    for f in fuentes:
        if not os.path.exists(f):
            continue
        with open(f, encoding="utf-8", errors="ignore") as fh:
            for linea in fh:
                m = re.search(r"(sk-[A-Za-z0-9_\-]{20,})", linea)
                if m:
                    return m.group(1), f
    return None, None


def sintetizar(clave, cfg, texto, destino):
    cuerpo = json.dumps({
        "model": cfg.get("modelo", "gpt-4o-mini-tts"),
        "voice": cfg.get("voz", "verse"),
        "input": texto,
        "response_format": "mp3",
        "instructions": cfg.get("instrucciones", ""),
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=cuerpo,
        headers={"Authorization": f"Bearer {clave}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        audio = r.read()
    with open(destino, "wb") as fh:
        fh.write(audio)
    return len(audio)


def duracion(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", path], capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def main():
    clave, fuente = buscar_clave()
    if not clave:
        print("SIN CLAVE: no encontre una OPENAI_API_KEY en ~/.hermes/.env ni en context/raw/Datos.txt")
        return 1
    print(f"clave encontrada en {os.path.basename(fuente)} (no se imprime)")
    cfg = json.load(open(os.path.join(AQUI, "narracion.json"), encoding="utf-8"))
    total_palabras = 0
    total_dur = 0.0
    for s in cfg["slides"]:
        destino = os.path.join(AQUI, f"voz-{s['n']}.mp3")
        try:
            bytes_ = sintetizar(clave, cfg, s["texto"], destino)
        except urllib.error.HTTPError as e:
            print(f"  slide {s['n']}: HTTP {e.code} - {e.read()[:200].decode(errors='ignore')}")
            return 1
        d = duracion(destino)
        pal = len(s["texto"].split())
        total_palabras += pal
        total_dur += d
        print(f"  slide {s['n']}: {d:6.2f} s · {pal:3d} palabras · {bytes_/1024:5.0f} KB")
    print(f"\n  TOTAL: {total_dur/60:.2f} min · {total_palabras} palabras · {total_palabras/(total_dur/60):.0f} pal/min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
