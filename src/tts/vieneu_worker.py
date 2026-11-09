"""
VieNeu-TTS worker: loads the model once, then reads one JSON request per line on stdin
({"text", "voice", "out"}) and answers one JSON line on stdout ({"ok": true} or {"error"}).
Started and stopped by the "vieneu" engine in engines.ts.
"""

import json
import sys

from vieneu import Vieneu

tts = Vieneu()
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        req = json.loads(line)
        tts.save(tts.infer(req["text"], voice=req["voice"]), req["out"])
        print(json.dumps({"ok": True}), flush=True)
    except Exception as e:  # keep serving: one bad sentence must not stop the build
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}), flush=True)
