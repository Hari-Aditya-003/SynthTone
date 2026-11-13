# Roadmap and Engineering Work Packages

**Status: alpha code scaffold included.** Sequencing is by dependencies, not promises of delivery by dates. All phases require successful tests before release.

## Phase A — Dell hardware validation + private alpha

- [x] API key gate and private loopback Docker Compose port.
- [x] Native browser editor and voice uploader.
- [x] Kokoro, Nano, Turbo engine adapters with lazy loading.
- [x] One-at-a-time persistent jobs.
- [x] WAV/MP3 generation history and export.
- [ ] Run Docker build and benchmark on target Dell.
- [ ] Pin compatible package versions and container image digests after testing.
- [ ] Validate GPU memory usage, health/error reporting and restart behavior.
- [ ] Add model revision, seed and generation manifest in database.
- [ ] Add real unit/integration tests against CPU smoke generation.

## Phase B — Production foundations

- [ ] Next.js/React frontend with design system, typed API client and session-based authentication.
- [ ] PostgreSQL + Alembic schemas and migrations.
- [ ] Redis task queue; separate CPU and GPU worker services; crash-safe retries.
- [ ] MinIO/S3 object storage; signed URLs; per-user projects and voice access controls.
- [ ] Consent verification, revocation, encryption and retention policy.
- [ ] Cancellation, rate limits, quotas, OpenTelemetry metrics and logs redaction.
- [ ] Stable `/v1` API, TypeScript/Python SDKs and integration tests.

## Phase C — ElevenLabs-class content production

- [ ] Multi-speaker text script, scene/segment editor, project history and autosave.
- [ ] Interactive waveform/timeline editor, audio clip trims, merge, fades, silence presets.
- [ ] Candidate A/B audition, segment regeneration with reference preservation.
- [ ] Pronunciation dictionary, supported model-native emotion and pace settings.
- [ ] Queue visualizer with position, progress, cancellation and retries.
- [ ] Batch CSV/script jobs, ZIP export, subtitle file export and optional timestamps.
- [ ] Support for Chatterbox Multilingual, OpenVoice V2 and experimental Qwen3 0.6B adapters after tested compatibility.

## Phase D — VoxTune intelligence

- [ ] Consent-bound multi-style speaker profiles and reference banks.
- [ ] Text/linguistic prosody planner and pause map.
- [ ] Model selection using measured RTF, language, VRAM and speaker identity.
- [ ] ASR-based transcript QA, acoustic anomaly detection and targeted segment regeneration.
- [ ] Speaker similarity and cross-segment consistency gates; bounded retries.
- [ ] Automated evaluation suite and documented model cards.

## Phase E — Research model and open-source release

- [ ] Define a *specific* new model contribution, e.g. trainable speaker-conditioned prosody adapter or parameter-efficient fine-tune, rather than simply a multi-model selector.
- [ ] Build explicitly licensed speaker-consented dataset with training/validation/test splits.
- [ ] Train on a machine with sufficient VRAM, with reproducible scripts and model checkpoints.
- [ ] Report baselines and ablation studies: prosody rule vs model, reference selection, quality gate.
- [ ] Publish documentation, model cards, benchmark traces, license notices and security policy.
- [ ] Add CI, dependency audit, release/tag workflow and Docker image signing.

## No-go conditions for public launch

Unverified speaker consent; unauthenticated clone API; no user isolation; unavailable deletion/revocation; missing privacy protections; noncommercial weights bundled in a commercial default; recurring OOM/restarts; no artifact provenance; untested deployment. Fix these before exposing beyond trusted private users.
