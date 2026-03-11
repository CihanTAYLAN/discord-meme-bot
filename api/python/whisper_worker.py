import argparse
import json
import sys
import traceback

import numpy as np
from faster_whisper.audio import decode_audio
from faster_whisper import WhisperModel


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Persistent faster-whisper worker")
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
    )

    print(json.dumps({"ready": True}), flush=True)

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        payload = None

        try:
            payload = json.loads(line)
            if payload.get("type") != "transcribe":
                raise ValueError("unsupported worker request")

            segments, info = model.transcribe(
                payload["audioPath"],
                beam_size=int(payload.get("beamSize", 1)),
                condition_on_previous_text=False,
                language=payload.get("language"),
                vad_filter=True,
                word_timestamps=True,
            )
            normalized_segments = [
                {
                    "end": segment.end,
                    "start": segment.start,
                    "text": segment.text.strip(),
                }
                for segment in segments
            ]
            text = " ".join(segment["text"] for segment in normalized_segments).strip()
            audio_metrics = analyze_audio(payload["audioPath"])
            duration_seconds = max(
                normalized_segments[-1]["end"] if normalized_segments else 0.0,
                audio_metrics["durationSeconds"],
            )

            print(
                json.dumps(
                    {
                        "id": payload["id"],
                        "ok": True,
                        "result": {
                            "audioMetrics": {
                                "averageEnergy": audio_metrics["averageEnergy"],
                                "dynamicRange": audio_metrics["dynamicRange"],
                                "peakEnergy": audio_metrics["peakEnergy"],
                                "silenceRatio": audio_metrics["silenceRatio"],
                                "speechBursts": audio_metrics["speechBursts"],
                                "voicedRatio": audio_metrics["voicedRatio"],
                                "zeroCrossingRate": audio_metrics["zeroCrossingRate"],
                            },
                            "durationSeconds": duration_seconds,
                            "language": getattr(info, "language", "unknown"),
                            "segments": normalized_segments,
                            "text": text,
                        },
                    }
                ),
                flush=True,
            )
        except Exception as error:
            print(
                json.dumps(
                    {
                        "error": f"{error}\n{traceback.format_exc()}",
                        "id": payload.get("id") if isinstance(payload, dict) else None,
                        "ok": False,
                    }
                ),
                flush=True,
            )

    return 0


def analyze_audio(audio_path: str) -> dict:
    audio = decode_audio(audio_path, sampling_rate=16000)

    if audio.size == 0:
        return {
            "averageEnergy": 0.0,
            "durationSeconds": 0.0,
            "dynamicRange": 0.0,
            "peakEnergy": 0.0,
            "silenceRatio": 1.0,
            "speechBursts": 0,
            "voicedRatio": 0.0,
            "zeroCrossingRate": 0.0,
        }

    absolute_audio = np.abs(audio)
    average_energy = float(np.sqrt(np.mean(np.square(audio))))
    peak_energy = float(np.max(absolute_audio))
    dynamic_range = float(
        max(
            0.0,
            np.percentile(absolute_audio, 90) - np.percentile(absolute_audio, 10),
        )
    )
    silence_threshold = max(average_energy * 0.35, 0.012)
    silence_mask = absolute_audio < silence_threshold
    silence_ratio = float(np.mean(silence_mask))
    voiced_ratio = float(1.0 - silence_ratio)

    sign_changes = np.not_equal(np.signbit(audio[1:]), np.signbit(audio[:-1]))
    zero_crossing_rate = float(np.mean(sign_changes)) if sign_changes.size else 0.0

    frame_size = 320
    trimmed_size = (audio.size // frame_size) * frame_size
    speech_bursts = 0

    if trimmed_size > 0:
        frames = audio[:trimmed_size].reshape(-1, frame_size)
        frame_energy = np.sqrt(np.mean(np.square(frames), axis=1))
        active_threshold = max(float(np.percentile(frame_energy, 65)) * 0.4, 0.015)
        active_frames = frame_energy >= active_threshold
        speech_bursts = int(
            np.count_nonzero(active_frames & np.logical_not(np.roll(active_frames, 1)))
        )
        if active_frames.size and active_frames[0]:
            speech_bursts = max(1, speech_bursts)

    return {
        "averageEnergy": average_energy,
        "durationSeconds": float(audio.size / 16000.0),
        "dynamicRange": dynamic_range,
        "peakEnergy": peak_energy,
        "silenceRatio": silence_ratio,
        "speechBursts": speech_bursts,
        "voicedRatio": voiced_ratio,
        "zeroCrossingRate": zero_crossing_rate,
    }


if __name__ == "__main__":
    raise SystemExit(main())
