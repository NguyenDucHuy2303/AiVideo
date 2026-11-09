"""
Kokoro worker (English and other languages): loads the model once, then reads one JSON request
per line on stdin ({"text", "voice", "out"}) and answers one JSON line ({"ok": true} or
{"error"}). The language follows the voice's first letter (af_heart: American English…).
Started and stopped by the "kokoro" engine in engines.ts.
"""

import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

DIR = os.environ.get("KOKORO_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "vendor", "kokoro"))
LANG = {"a": "en-us", "b": "en-gb", "e": "es", "f": "fr-fr", "h": "hi", "i": "it", "j": "ja", "p": "pt-br", "z": "cmn"}

tts = Kokoro(os.path.join(DIR, "kokoro-v1.0.onnx"), os.path.join(DIR, "voices-v1.0.bin"))
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        req = json.loads(line)
        voice = req["voice"]
        audio, sr = tts.create(req["text"], voice=voice, speed=1.0, lang=LANG.get(voice[0], "en-us"))
        sf.write(req["out"], audio, sr)
        print(json.dumps({"ok": True}), flush=True)
    except Exception as e:  # keep serving: one bad sentence must not stop the build
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}), flush=True)
