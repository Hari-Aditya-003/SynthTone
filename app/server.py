"""SynthTone API Server: High-Performance, Private AI Voice Production Studio.
Designed for LAN / Tailnet deployment on Dell Linux GPU systems (RTX 3050 Ti & CUDA).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import subprocess
import tempfile
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.db import DATA_DIR, database, row, rows, setup
from app.engines import MODEL_REGISTRY, generate, get_gpu_status

API_KEY = os.environ.get("SYNTHTONE_API_KEY") or os.environ.get("VOX_API_KEY", "")
ROOT_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT_DIR / "web"
AI_ORB_DIR = ROOT_DIR / "ai-character-orb"


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_auth(x_api_key: str = Header(default="")):
    if not API_KEY:
        # If API_KEY is not set in development mode, allow localhost access
        return
    if not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Valid X-API-Key required for SynthTone access")


def work_loop(stop_event: threading.Event):
    while not stop_event.is_set():
        job = row("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1")
        if job is None:
            stop_event.wait(0.5)
            continue
        with database() as db:
            cur = db.execute(
                "UPDATE jobs SET status='running', updated_at=? WHERE id=? AND status='queued'",
                (timestamp(), job["id"]),
            )
            if cur.rowcount != 1:
                continue
        try:
            voice = (
                row("SELECT * FROM voices WHERE id=?", (job["voice_id"],))
                if job["voice_id"]
                else None
            )
            if job["voice_id"] and not voice:
                raise ValueError("Referenced voice profile not found or deleted")
            wav, mp3 = generate(
                model_id=job["model_id"],
                text=job["text"],
                out_prefix=DATA_DIR / "outputs" / job["id"],
                reference_path=voice["ref_path"] if voice else None,
                builtin_voice=job["builtin_voice"] or "af_heart",
                speed=job["speed"],
            )
            with database() as db:
                db.execute(
                    "UPDATE jobs SET status='completed', output_wav=?, output_mp3=?, updated_at=? WHERE id=?",
                    (wav, mp3, timestamp(), job["id"]),
                )
        except Exception as exc:
            with database() as db:
                db.execute(
                    "UPDATE jobs SET status='failed', error=?, updated_at=? WHERE id=?",
                    (f"{type(exc).__name__}: {str(exc)[:500]}", timestamp(), job["id"]),
                )


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup()
    stop_event = threading.Event()
    thread = threading.Thread(target=work_loop, args=(stop_event,), daemon=True)
    thread.start()
    yield
    stop_event.set()
    thread.join(timeout=3)


app = FastAPI(
    title="SynthTone AI Studio",
    description="Studio-grade local & private neural voice generation and cloning engine.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    model_id: str = "kokoro"
    voice_id: str | None = None
    builtin_voice: str = "af_heart"
    speed: float = Field(default=1.0, ge=0.7, le=1.3)
    variations: int = Field(default=1, ge=1, le=3)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "SynthTone AI",
        "version": "1.0.0",
        "gpu": get_gpu_status(),
    }


@app.get("/api/system/gpu", dependencies=[Depends(require_auth)])
def gpu_status():
    return get_gpu_status()


@app.get("/api/models", dependencies=[Depends(require_auth)])
def models():
    return [{"id": key, **value} for key, value in MODEL_REGISTRY.items()]


@app.get("/api/voices", dependencies=[Depends(require_auth)])
def voices():
    return rows("SELECT id, name, created_at FROM voices ORDER BY created_at DESC")


@app.post("/api/voices", dependencies=[Depends(require_auth)])
async def create_voice(
    name: str = Form(...),
    consent: bool = Form(...),
    file: UploadFile = File(...),
):
    if not consent:
        raise HTTPException(
            400, "Consent required: only upload your own voice or voices with explicit permission."
        )
    name = name.strip()
    if not 1 <= len(name) <= 80:
        raise HTTPException(400, "Voice profile name must be 1–80 characters.")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in (".wav", ".mp3", ".m4a", ".flac", ".ogg"):
        raise HTTPException(400, "Audio format must be WAV, MP3, M4A, FLAC, or OGG.")
    contents = await file.read(15 * 1024 * 1024 + 1)
    if not contents or len(contents) > 15 * 1024 * 1024:
        raise HTTPException(413, "Audio file must be between 1 byte and 15 MB.")
    uid = uuid4().hex
    target = DATA_DIR / "references" / f"{uid}.wav"
    with tempfile.TemporaryDirectory() as tmp:
        raw_path = Path(tmp) / ("upload" + suffix)
        raw_path.write_bytes(contents)
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(raw_path),
            ],
            capture_output=True,
            text=True,
            timeout=20,
        )
        try:
            duration = float(probe.stdout.strip())
        except ValueError:
            raise HTTPException(400, "Unrecognized audio file format.")
        if not 3 <= duration <= 90:
            raise HTTPException(
                400, "Reference audio must be 3–90 seconds (a clean 10–20s clip is recommended)."
            )
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(raw_path),
                    "-ar",
                    "24000",
                    "-ac",
                    "1",
                    str(target),
                ],
                check=True,
                timeout=40,
                capture_output=True,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            raise HTTPException(400, "Audio could not be decoded by FFmpeg.")
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    with database() as db:
        db.execute(
            """
            INSERT INTO voices (id, name, ref_path, created_at, consent_attested, ref_sha256)
            VALUES (?, ?, ?, ?, 1, ?)
            """,
            (uid, name, str(target), timestamp(), digest),
        )
    return {"id": uid, "name": name}


@app.delete("/api/voices/{voice_id}", dependencies=[Depends(require_auth)])
def delete_voice(voice_id: str):
    voice = row("SELECT * FROM voices WHERE id=?", (voice_id,))
    if not voice:
        raise HTTPException(404, "Voice profile not found")
    target = Path(voice["ref_path"])
    with database() as db:
        db.execute("DELETE FROM voices WHERE id=?", (voice_id,))
    target.unlink(missing_ok=True)
    return {"deleted": True}


@app.post("/api/jobs", dependencies=[Depends(require_auth)])
def create_jobs(req: GenerateRequest):
    if req.model_id not in MODEL_REGISTRY:
        raise HTTPException(400, "Invalid neural model selected")
    if req.model_id != "kokoro":
        if not req.voice_id or not row("SELECT 1 FROM voices WHERE id=?", (req.voice_id,)):
            raise HTTPException(
                400, "For voice cloning, upload and select an authorized reference voice profile."
            )
        if req.speed != 1.0:
            raise HTTPException(400, "Speed adjustment is currently supported on the Kokoro engine.")
    if req.model_id == "kokoro" and req.builtin_voice not in (
        "af_heart",
        "af_bella",
        "am_adam",
        "bf_emma",
        "bm_george",
    ):
        raise HTTPException(400, "Unsupported Kokoro voice speaker")
    ids = []
    with database() as db:
        for _ in range(req.variations):
            uid = uuid4().hex
            db.execute(
                """
                INSERT INTO jobs (id, model_id, text, voice_id, builtin_voice, speed, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)
                """,
                (
                    uid,
                    req.model_id,
                    req.text.strip(),
                    req.voice_id,
                    req.builtin_voice,
                    req.speed,
                    timestamp(),
                    timestamp(),
                ),
            )
            ids.append(uid)
    return {"job_ids": ids}


@app.get("/api/jobs", dependencies=[Depends(require_auth)])
def list_jobs():
    return rows(
        """SELECT id, model_id, text, status, error, created_at,
                  output_mp3 IS NOT NULL as has_audio
           FROM jobs ORDER BY created_at DESC LIMIT 50"""
    )


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_auth)])
def job_detail(job_id: str):
    job = row("SELECT * FROM jobs WHERE id=?", (job_id,))
    if not job:
        raise HTTPException(404, "Job not found")
    return {
        key: value
        for key, value in job.items()
        if key not in ("output_wav", "output_mp3")
    }


@app.get("/api/jobs/{job_id}/audio", dependencies=[Depends(require_auth)])
def audio(job_id: str, fmt: str = "mp3"):
    if fmt not in ("wav", "mp3"):
        raise HTTPException(400, "Audio format must be wav or mp3")
    job = row("SELECT * FROM jobs WHERE id=?", (job_id,))
    if not job or job["status"] != "completed":
        raise HTTPException(404, "Audio is not ready or failed")
    path = job["output_wav"] if fmt == "wav" else job["output_mp3"]
    if not path or not Path(path).is_file():
        raise HTTPException(404, "Synthesized audio file is missing")
    return FileResponse(
        path,
        media_type="audio/wav" if fmt == "wav" else "audio/mpeg",
        filename=f"synthtone-{job_id[:8]}.{fmt}",
    )


# Mount AI character orb component standalone static files
if AI_ORB_DIR.is_dir():
    app.mount("/ai-orb", StaticFiles(directory=AI_ORB_DIR, html=True), name="ai-orb")

# Mount main web studio application
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
