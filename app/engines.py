"""SynthTone Neural Speech Engines.
Engineered for Dell GPU Linux Servers (NVIDIA CUDA / RTX 3050 Ti) and multi-tier inference.
Keeps one heavy neural model loaded at a time to operate safely within 4 GB VRAM budgets.
"""
from __future__ import annotations

import gc
import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict

import numpy as np
import soundfile as sf

logger = logging.getLogger("synthtone.engines")

MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    "kokoro": {
        "name": "Kokoro 82M",
        "description": "Ultra-fast neural voice with 5 built-in expressive speakers",
        "license": "Apache-2.0",
        "language": "English (US/UK)",
        "clone": False,
        "tier": "High-Speed / CPU & GPU",
        "ready": True,
    },
    "chatterbox-nano": {
        "name": "Chatterbox Nano 110M",
        "description": "Zero-shot voice cloning optimized for low-memory 4GB GPUs",
        "license": "MIT",
        "language": "English",
        "clone": True,
        "tier": "Fast Voice Clone (RTX 3050 Ti Ready)",
        "ready": True,
    },
    "chatterbox-turbo": {
        "name": "Chatterbox Turbo 350M",
        "description": "High-fidelity expressive zero-shot voice cloning",
        "license": "MIT",
        "language": "English",
        "clone": True,
        "tier": "Studio Voice Clone (High Fidelity)",
        "ready": True,
    },
}

_ENGINE = None
_ENGINE_ID = None


def get_gpu_status() -> dict[str, Any]:
    """Inspects host GPU availability, CUDA status, and VRAM for the Dell GPU server."""
    try:
        import torch

        cuda_available = torch.cuda.is_available()
        gpu_info = {
            "cuda_available": cuda_available,
            "device_count": torch.cuda.device_count() if cuda_available else 0,
            "device_name": torch.cuda.get_device_name(0) if cuda_available else "CPU Only",
            "active_engine": _ENGINE_ID or "None",
        }
        if cuda_available:
            total_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            allocated_mem = torch.cuda.memory_allocated(0) / (1024**3)
            reserved_mem = torch.cuda.memory_reserved(0) / (1024**3)
            gpu_info.update(
                {
                    "total_vram_gb": round(total_mem, 2),
                    "allocated_vram_gb": round(allocated_mem, 2),
                    "reserved_vram_gb": round(reserved_mem, 2),
                    "free_vram_gb": round(total_mem - reserved_mem, 2),
                }
            )
        return gpu_info
    except Exception as exc:
        return {
            "cuda_available": False,
            "device_name": "Unknown",
            "error": str(exc),
            "active_engine": _ENGINE_ID or "None",
        }


def split_script(text: str, max_chars: int = 240) -> list[str]:
    """Punctuation-aware splitting, then word splitting for long sentences."""
    pieces = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    chunks: list[str] = []
    for piece in pieces:
        current = ""
        for word in piece.split():
            if len(word) > max_chars:
                raise ValueError(f"Word exceeds max character length ({max_chars})")
            candidate = f"{current} {word}".strip()
            if len(candidate) > max_chars and current:
                chunks.append(current)
                current = word
            else:
                current = candidate
        if current:
            chunks.append(current)
    return chunks


def _load_engine(model_id: str):
    global _ENGINE, _ENGINE_ID
    if model_id == _ENGINE_ID and _ENGINE is not None:
        return _ENGINE

    # Free previous model and purge VRAM to prevent GPU memory pressure
    _ENGINE = None
    _ENGINE_ID = None
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass

    if model_id == "kokoro":
        from kokoro import KPipeline

        _ENGINE = KPipeline(lang_code="a", device="cpu")
    elif model_id in ("chatterbox-nano", "chatterbox-turbo"):
        import torch
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        preferred = (
            os.getenv("SYNTHTONE_DEVICE")
            or os.getenv("VOX_CHATTERBOX_DEVICE")
            or "auto"
        ).lower()
        if preferred not in ("auto", "cpu", "cuda"):
            raise ValueError("SYNTHTONE_DEVICE must be auto, cpu or cuda")
        device = (
            ("cuda" if torch.cuda.is_available() else "cpu")
            if preferred == "auto"
            else preferred
        )
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but no NVIDIA GPU was detected on host")

        _ENGINE = ChatterboxTurboTTS.from_pretrained(
            device=device, nano=(model_id == "chatterbox-nano")
        )
    else:
        raise ValueError(f"Unsupported model: {model_id}")

    _ENGINE_ID = model_id
    return _ENGINE


def _pcm_for_chunk(engine, model_id: str, text: str, ref_path: str | None, voice: str, speed: float):
    if model_id == "kokoro":
        arrays = []
        for _, _, audio in engine(text, voice=voice or "af_heart", speed=speed):
            arrays.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        if not arrays:
            raise RuntimeError("Kokoro generated empty audio array")
        return np.concatenate(arrays), 24000

    if not ref_path:
        raise ValueError("A voice reference recording is required for voice cloning models")

    waveform = engine.generate(text, audio_prompt_path=ref_path)
    return waveform.detach().cpu().numpy().reshape(-1).astype(np.float32), engine.sr


def generate(
    model_id: str,
    text: str,
    out_prefix: Path,
    reference_path: str | None,
    builtin_voice: str,
    speed: float,
) -> tuple[str, str]:
    if model_id not in MODEL_REGISTRY:
        raise ValueError("Unknown engine specified")

    engine = _load_engine(model_id)
    chunks = split_script(text)
    if not chunks:
        raise ValueError("Script text cannot be empty")

    sample_rate = None
    audio_parts = []
    for i, chunk in enumerate(chunks):
        audio, sr = _pcm_for_chunk(engine, model_id, chunk, reference_path, builtin_voice, speed)
        if sample_rate is None:
            sample_rate = sr
        if sr != sample_rate:
            raise RuntimeError("Inconsistent audio sample rates across chunks")
        if len(audio) == 0 or not np.isfinite(audio).all():
            raise RuntimeError("Model returned empty or non-finite audio frames")
        if i:
            # 120ms natural silence gap between script sentences
            audio_parts.append(np.zeros(int(sample_rate * 0.12), dtype=np.float32))
        audio_parts.append(audio)

    # Post-generation VRAM cleanup for 4GB GPUs
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass

    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "raw.wav"
        sf.write(source, np.concatenate(audio_parts), sample_rate, subtype="PCM_16")
        wav_path = out_prefix.with_suffix(".wav")
        mp3_path = out_prefix.with_suffix(".mp3")

        # Studio broadcast loudness normalization (EBU R128: -16 LUFS, -1.5 dB TruePeak)
        subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(source),
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ar",
                "24000",
                "-ac",
                "1",
                str(wav_path),
            ],
            check=True,
            timeout=180,
        )

        # Transcode broadcast MP3 at 192kbps
        subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(wav_path),
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "192k",
                str(mp3_path),
            ],
            check=True,
            timeout=180,
        )

    return str(wav_path), str(mp3_path)
