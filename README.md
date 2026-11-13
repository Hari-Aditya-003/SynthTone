# SynthTone — Studio-Grade AI Voice Production & Voice Cloning

[![Live Demo: GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-00f0ff?style=flat&logo=github)](https://hari-aditya-003.github.io/SynthTone/)
[![SynthTone CI](https://github.com/Hari-Aditya-003/SynthTone/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Hari-Aditya-003/SynthTone/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CUDA Accelerated](https://img.shields.io/badge/GPU-NVIDIA%20RTX%203050%20Ti-76B900?logo=nvidia)](https://developer.nvidia.com/cuda-zone)

🌐 **Live Demo Website:** [https://hari-aditya-003.github.io/SynthTone/](https://hari-aditya-003.github.io/SynthTone/)

**SynthTone** is a private, high-performance neural speech synthesis and zero-shot voice cloning studio engineered for **Dell Linux GPU servers** (NVIDIA RTX 3050 Ti / CUDA) with a responsive, futuristic web interface accessible from your MacBook, workstation, or mobile device.

SynthTone includes an interactive **AI Character Orb** that tracks your mouse cursor with 3D sphere parallax, blinks naturally, and dynamically morphs into a fluid soundwave when generating speech or playing audio.

---

## 🌟 Core Features

- **Voice Characters & Instant Auditions:**
  - **Nova:** Warm, expressive feminine voice designed for storytelling and empathetic explainer videos.
  - **Echo:** Deep, commanding masculine voice built for corporate narration, documentaries, and authoritative delivery.
  - **Lyra:** Crisp British feminine voice tailored for education, refined presentations, and luxury audiobooks.
  - **Broadcast Audio with Ambient Music:** Hear every voice with harmonic ambient synth bed preview before synthesizing.
- **Neural Script Assistant (Local LLM):**
  - Instant script drafting powered by local Ollama on your GPU server (Llama 3.2 / Qwen 2.5 / Mistral) with built-in neural templates.
  - Generates optimized TTS text across multiple tones: Cinematic, Explainer, Storytelling, Commercial, and Podcast.
- **Interactive AI Character Orb (Canvas 2D):**
  - **Parallax Mouse Tracking:** Internal glows and eyes track cursor movement across the viewport with realistic 3D sphere parallax.
  - **Digital Robot Facial Expressions:** Supports 9 expressions (Neutral, Happy `^ ^`, Hearts `♥`, Stars `✦`, Wink `| <`, Sleepy `- -`, Confused `?`, Dizzy `@ @`, Blush `🌸`).
  - **Fluid Siri-style Waveform:** Morphs smoothly during speech synthesis or live audio playback.
  - **Reusable Module:** Self-contained in [`ai-character-orb/`](ai-character-orb/) for immediate use in other web and mobile projects!
- **Multi-Tier Neural Speech Engines:**
  - **Kokoro 82M:** Ultra-fast, natural speech with 5 built-in voices; CPU and GPU accelerated.
  - **Chatterbox Nano 110M:** Zero-shot voice cloning optimized for 4 GB VRAM GPUs like the RTX 3050 Ti.
  - **Chatterbox Turbo 350M:** Studio-fidelity expressive voice cloning with custom reference audio prompts.
- **Engineered for Dell GPU Linux Servers:**
  - Single heavy neural model in memory to prevent VRAM pressure on 4 GB GPUs.
  - Explicit post-generation VRAM garbage collection (`torch.cuda.empty_cache()`).
  - Live Dell GPU telemetry (CUDA status, VRAM allocation, GPU device name).
- **Private Audio Pipeline:**
  - SQLite persistent job queue and generation history.
  - EBU R128 (-16 LUFS) broadcast loudness normalization via FFmpeg.
  - Lossless WAV and 192kbps MP3 exports.

---

## 🖥️ Requirements & Target Hardware

- **Server:** Dell Linux system (x86_64, Ubuntu 22.04+ or Debian 12 recommended).
- **GPU:** NVIDIA GeForce RTX 3050 Ti (4 GB VRAM) or any modern NVIDIA GPU with NVIDIA Container Toolkit.
- **Docker:** Docker Engine + Docker Compose plugin (`docker compose`).
- **Client:** Any modern browser (MacBook Safari/Chrome, iPhone, iPad, PC).

---

## 🚀 Quickstart (Dell GPU Server)

### 1. Clone the Repository
```bash
git clone https://github.com/Hari-Aditya-003/SynthTone.git
cd SynthTone
```

### 2. Launch with One Command
Run the automated launcher:
```bash
./start.sh
```
Or manually configure environment and launch via Docker Compose:
```bash
cp .env.example .env

# Generate a secure 32+ character API key:
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
# Paste into SYNTHTONE_API_KEY in .env

# Build and start container
docker compose up -d
docker compose logs -f synthtone
```

### 3. Access the Studio

The service listens on `http://127.0.0.1:8000`.

To connect securely from your MacBook or workstation across your local network:
```bash
# Forward port 8000 through SSH:
ssh -L 8000:127.0.0.1:8000 <dell-username>@<dell-server-ip>
```
Then open your browser to:
```text
http://127.0.0.1:8000
```
Paste your API key from `.env` into the top bar to connect.

---

## 🔮 Standalone AI Character Orb Component

The interactive AI companion is packaged as a standalone, zero-dependency module in [`ai-character-orb/`](ai-character-orb/):

```html
<!-- Drop into any web page -->
<link rel="stylesheet" href="./ai-character-orb/ai-orb.css" />
<div id="orb"></div>

<script type="module">
  import { AICharacterOrb } from "./ai-character-orb/ai-orb.js";

  const orb = new AICharacterOrb("#orb", {
    size: 260,
    mode: "eyes", // 'eyes' | 'wave' | 'speaking' | 'listening'
    bubbleText: "Um...how is the weather",
  });
</script>
```

Open [`ai-character-orb/index.html`](ai-character-orb/index.html) in your browser for an interactive playground! See the [AI Orb Documentation](ai-character-orb/README.md) for React, Vue, Next.js, and Web Component guides.

---

## 📁 Repository Structure

```text
SynthTone/
├── ai-character-orb/       # Reusable, standalone AI Character Orb component
│   ├── ai-orb.js           # ES6 module & Web Component
│   ├── ai-orb.css          # Orb styling, glassmorphism & animations
│   ├── index.html          # Interactive standalone demo
│   ├── reference-images/   # Original design artwork & references
│   └── README.md           # Standalone integration guide
├── app/                    # FastAPI backend & neural engines
│   ├── db.py               # SQLite schema & job queue
│   ├── engines.py          # Kokoro & Chatterbox model adapters (GPU/CUDA)
│   └── server.py           # REST API endpoints & static file serving
├── web/                    # Widescreen Studio UI
│   ├── index.html          # Main web studio interface
│   ├── styles.css          # Deep obsidian & neon aurora theme
│   ├── app.js              # Client state, Web Audio & telemetry
│   └── components/ai-orb/  # Embedded AI orb assets
├── docs/                   # Architectural & technical documentation
│   ├── ARCHITECTURE.md     # System architecture & hardware allocation
│   ├── DEPLOYMENT.md       # Dell GPU Linux server deployment guide
│   ├── MODELS.md           # Model specifications & benchmarks
│   └── PRODUCT.md          # Feature matrix & UI system
├── Dockerfile              # Container definition with PyTorch & FFmpeg
├── compose.yaml            # Docker Compose with NVIDIA GPU reservation
├── start.sh                # Dell GPU server one-click startup script
├── requirements.txt        # Python dependencies
├── LICENSE                 # MIT License (Copyright (c) 2026 Hari Aditya)
└── THIRD_PARTY_NOTICES.md  # Upstream model licenses & attributions
```

---

## 📄 License & Attribution

- **SynthTone** is authored by **Hari Aditya** and released under the [MIT License](LICENSE).
- Neural models (Kokoro 82M: Apache 2.0; Chatterbox Turbo/Nano: MIT) are governed by their respective licenses as detailed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
