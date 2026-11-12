"""
Kokoro worker (English and other languages): loads the model once, then reads one JSON request
per line on stdin ({"text", "voice", "out"}) and answers one JSON line ({"ok": true} or
{"error"}). The language follows the voice's first letter (af_heart: American English…).
Started and stopped by the "kokoro" engine in engines.ts.
"""

import json
import os
import re
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

DIR = os.environ.get("KOKORO_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "vendor", "kokoro"))
LANG = {"a": "en-us", "b": "en-gb", "e": "es", "f": "fr-fr", "h": "hi", "i": "it", "j": "ja", "p": "pt-br", "z": "cmn"}

# Vietnamese names said as in Vietnamese (no tones): espeak spells "Bối" letter by letter, reads
# "Huy" as "Hi", "Hùng" as "hung", "Beo" as "bay-oh". The rest of the line is phonemized as usual.
NAMES = {"Huy": "hwˈi", "Hùng": "hˈuŋ", "Bối": "bˈoɪ", "Beo": "bˈɛw"}
NAME_RE = re.compile(r"(?<![\w])((?:" + "|".join(map(re.escape, NAMES)) + r")(?:['’]s)?)(?![\w])")

tts = Kokoro(os.path.join(DIR, "kokoro-v1.0.onnx"), os.path.join(DIR, "voices-v1.0.bin"))


def phonemes(text, lang):
    """The line's phonemes, the names put in by hand; None when it has no name."""
    parts = NAME_RE.split(text)
    if len(parts) == 1:
        return None
    out = []
    for i, part in enumerate(parts):
        if i % 2:
            name = part.rstrip("s").rstrip("'’")
            out.append(NAMES[name] + ("z" if name != part else ""))
        elif part.strip():
            out.append(tts.tokenizer.phonemize(part, lang).strip())
    return " ".join(out).replace(" ,", ",").replace(" .", ".").replace(" !", "!").replace(" ?", "?")


print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        req = json.loads(line)
        voice = req["voice"]
        lang = LANG.get(voice[0], "en-us")
        ph = phonemes(req["text"], lang) if lang.startswith("en") else None
        audio, sr = tts.create(ph, voice=voice, speed=1.0, is_phonemes=True) if ph else tts.create(req["text"], voice=voice, speed=1.0, lang=lang)
        sf.write(req["out"], audio, sr)
        print(json.dumps({"ok": True}), flush=True)
    except Exception as e:  # keep serving: one bad sentence must not stop the build
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}), flush=True)
