# Dell Linux Deployment — Private Web Studio

## Verified assumptions vs. unverified environment

Target user hardware: Dell laptop/server, Linux, Intel CPU, 16 GB RAM, RTX 3050 Ti (4 GB). These are **design assumptions supplied by the user**, not measurements taken on the current server. Docker image, Python dependency resolution and TTS inference have **not** been run on that Dell. No deployment is claimed to be complete until the hardware test checklist passes.

## 1. Prepare NVIDIA host

Check driver and GPU visible:

```bash
nvidia-smi
uname -m
cat /etc/os-release
```

Install Docker Engine + Compose from your Linux distribution's officially supported Docker instructions. Install NVIDIA Container Toolkit following NVIDIA's current Docker instructions: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html . Configure Docker to use NVIDIA runtime then restart Docker. Test a minimal NVIDIA CUDA-compatible base image with `nvidia-smi` **for the driver/CUDA version actually supported on your machine**. Do not assume a randomly selected CUDA image matches your current driver.

## 2. Start private service

```bash
cp .env.example .env
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
# Paste output as SYNTHTONE_API_KEY in .env

docker compose build
docker compose up -d
docker compose ps
docker compose logs -f studio
```

The Compose port mapping is **host loopback only** (`127.0.0.1:8000:8000`). The internet cannot reach the service directly through this mapping. Keep the firewall closed to unsolicited ports.

### From a MacBook

```bash
ssh -L 8000:127.0.0.1:8000 YOUR_DELL_USERNAME@YOUR_DELL_IP
```

Go to `http://127.0.0.1:8000` on the Mac. Browser-to-SSH traffic is encrypted; local browser sees HTTP because tunnel terminates on loopback. Enter the API key from `.env`.

### From an iPhone / remote devices

Install Tailscale on both Dell and device. Configure **Tailscale Serve** on the Dell to serve the local `http://127.0.0.1:8000` endpoint over your private tailnet. Use the exact contemporary commands from https://tailscale.com/kb/1312/serve ; command flags evolve. This setup provides HTTPS device access without exposing port 8000 to the public internet. Do **not** use Tailscale Funnel for an alpha voice-cloning deployment.

## 3. First inference smoke tests

1. Enter API key; verify `GET /api/models` works.
2. Select Kokoro / Heart, generate a 20-word English sentence. First download can take time and disk space. Confirm MP3 and WAV playback.
3. Record 10–20 seconds of your own speech. Create voice profile and choose Chatterbox Nano. Generate one short sentence.
4. Check `nvidia-smi` and `docker stats` during generation for peak memory and CPU pressure.
5. If Turbo fails OOM, switch back to Nano and log the failure; never increase concurrency on 4 GB GPU.
6. Test reconnect after service restart: projects/voices/jobs still present in bind-mounted `data/`.
7. Test voice deletion; verify private reference WAV disappears.
8. Confirm unauthorized request returns HTTP 401.

## 4. Troubleshooting

- GPU not detected in container: check NVIDIA Container Toolkit, `docker info`, host driver, runtime and `gpus: all` support.
- Docker build dependency conflict: pin a tested `chatterbox-tts`, PyTorch, Kokoro and Python 3.11 dependency set; see upstream releases. Do not blindly upgrade torch/torchaudio independently.
- `Killed`, CUDA out of memory: use Nano/Kokoro, reduce other GPU processes; only one model loaded at a time. CUDA fragmentation can also need a clean process restart.
- Audio upload fails: check 3–60 sec duration, supported input extensions and FFmpeg codecs.
- Browser can't access server: Compose listens on localhost intentionally. Use SSH tunnel on Mac or private Tailscale Serve instead of changing bind to a public IP.
- Slow generation: track RTF, number of segments and cold starts, not only model parameter count.

## 5. Storage and backups

Private state is in Docker Compose named volume `synthtone_data` (SQLite DB, voice WAV files, generated WAV/MP3). Downloaded models cache in `synthtone_models`. List volumes with `docker volume ls`. Back up the **named data volume** with encryption and test restore, excluding model-cache volume when bandwidth matters. Since this alpha uses SQLite, stop the container before copying its database (or use a SQLite-consistent online backup); copying a live database without its WAL can corrupt backups. Rotate secrets, set disk retention rules and avoid logging private scripts or samples.

## 6. Production deployment hardening

Before any public access, replace this starter's single-user secret with server-side sessions / scoped tokens, build per-user access controls, async Redis queue and production DB, media scanning, per-user quotas and upload validation, complete audit/consent verification, request logging redaction, cancellation and retries, telemetry, TLS via hardened reverse proxy, signed URLs, backup restores and independent security review. See `SECURITY.md`.

### Force CPU instead of CUDA

Set `SYNTHTONE_DEVICE=cpu` in `.env`, restart the service, and use Nano for slow but lower-VRAM fallback. The automatic mode prefers CUDA if PyTorch detects it; it does not automatically recover an OOM by switching to CPU.
