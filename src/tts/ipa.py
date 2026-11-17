"""
English text to IPA phonemes (espeak-ng through phonemizer, from the Kokoro venv), for the
English check (src/audio/englishcheck.ts): what was meant and what Whisper heard are compared
as sounds, so "sun" heard as "son" (the same sounds) is not a mistake and "bed" heard as "bad"
is. Reads a JSON list of texts on stdin, writes a JSON list of phoneme strings.
"""
import json
import sys

import espeakng_loader
from phonemizer.backend.espeak.wrapper import EspeakWrapper

EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())

from phonemizer import phonemize  # noqa: E402


def main() -> None:
    texts = [t if t.strip() else "x" for t in json.load(sys.stdin)]
    out = phonemize(texts, language="en-us", backend="espeak", strip=True, preserve_punctuation=False, with_stress=False, njobs=1)
    print(json.dumps([" ".join(o.split()) for o in out], ensure_ascii=False))


if __name__ == "__main__":
    main()
