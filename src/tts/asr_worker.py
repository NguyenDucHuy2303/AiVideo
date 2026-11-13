"""
Speech to text for the voice check (src/audio/voicecheck.ts): faster-whisper (MIT), Whisper
large-v3-turbo (MIT), int8 on the CPU. Reads a JSON list [{"id", "wav"}] on stdin and the
language as the first argument; writes one JSON object {"id", "text"} per line as each is done.
The model is downloaded once into vendor/whisper/hf.
"""
import json
import os
import sys

from faster_whisper import WhisperModel


def main() -> None:
    lang = sys.argv[1] if len(sys.argv) > 1 else "vi"
    model_name = os.environ.get("WATA_ASR_MODEL", "large-v3-turbo")
    threads = int(os.environ.get("WATA_ASR_THREADS", "4"))
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads,
                         download_root=os.environ.get("WATA_ASR_HOME"))
    for item in json.load(sys.stdin):
        # No prompt with the expected words: the check must hear what was said, not what was meant.
        segments, _ = model.transcribe(item["wav"], language=lang, beam_size=5, vad_filter=False,
                                       condition_on_previous_text=False)
        text = " ".join(s.text.strip() for s in segments)
        print(json.dumps({"id": item["id"], "text": text}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
