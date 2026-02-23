#!/usr/bin/env python3
import argparse
import json
import os
import sys


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe audio using faster-whisper.")
    parser.add_argument("--audio", required=True, help="Path to input wav audio")
    parser.add_argument("--output", required=True, help="Path to output transcript json")
    parser.add_argument("--model", default="small", help="Whisper model name")
    parser.add_argument("--language", default="id", help="Language code (default: id)")
    return parser.parse_args()


def main():
    args = parse_args()
    print("[transcribe] loading dependencies...", flush=True)

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as exc:  # pragma: no cover
        print(f"[transcribe] failed to import faster_whisper: {exc}", file=sys.stderr, flush=True)
        return 2

    print("[transcribe] loading model...", flush=True)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    print("[transcribe] transcribing...", flush=True)
    segments, _info = model.transcribe(args.audio, language=args.language)

    output = []
    for segment in segments:
        text = (segment.text or "").strip()
        if not text:
            continue

        output.append(
            {
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
            }
        )

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(output, handle, ensure_ascii=False, indent=2)

    print(f"[transcribe] done ({len(output)} segments)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
