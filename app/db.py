import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(
    os.getenv("SYNTHTONE_DATA_DIR") or os.getenv("VOX_DATA_DIR") or "./data"
).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "synthtone.sqlite3"


@contextmanager
def database():
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=5000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def setup():
    (DATA_DIR / "references").mkdir(exist_ok=True)
    (DATA_DIR / "outputs").mkdir(exist_ok=True)
    (DATA_DIR / "demos").mkdir(exist_ok=True)
    with database() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS voices (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                ref_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                consent_attested INTEGER NOT NULL,
                ref_sha256 TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                model_id TEXT NOT NULL,
                text TEXT NOT NULL,
                voice_id TEXT,
                builtin_voice TEXT,
                speed REAL NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                output_wav TEXT,
                output_mp3 TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at);
            CREATE TABLE IF NOT EXISTS voice_agents (
                id TEXT PRIMARY KEY,
                name TEXT,
                tagline TEXT,
                description TEXT,
                model_id TEXT,
                builtin_voice TEXT,
                personality TEXT,
                demo_audio_path TEXT,
                created_at TEXT
            );
            """
        )
        # Seed built-in agents
        db.executemany(
            """
            INSERT OR IGNORE INTO voice_agents
                (id, name, tagline, description, model_id, builtin_voice, personality, demo_audio_path, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            [
                (
                    "nova", "Nova", "Warm Narrator",
                    "A warm, expressive feminine voice perfect for storytelling and empathetic narration.",
                    "kokoro", "af_heart", "Optimistic, nurturing, clear-spoken.",
                    "data/demos/nova.wav",
                ),
                (
                    "echo", "Echo", "Deep Professional",
                    "A deep authoritative masculine voice for corporate narration and documentaries.",
                    "kokoro", "bm_george", "Composed, formal, gravitas.",
                    "data/demos/echo.wav",
                ),
                (
                    "lyra", "Lyra", "Crisp British",
                    "A crisp British feminine voice for educational content and audiobooks.",
                    "kokoro", "bf_emma", "Elegant, precise, articulate.",
                    "data/demos/lyra.wav",
                ),
            ],
        )
        # Following an unexpected shutdown or crash, recover jobs
        db.execute("UPDATE jobs SET status='queued' WHERE status='running'")


def rows(query: str, params=()):
    with database() as db:
        return [dict(row) for row in db.execute(query, params).fetchall()]


def row(query: str, params=()):
    with database() as db:
        value = db.execute(query, params).fetchone()
        return dict(value) if value is not None else None
