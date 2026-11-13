# Owned Voice Creation, Cloning, Style and Model Research

## Reference cloning is not training

When you upload a 10-second voice sample for Chatterbox Nano/Turbo, it conditions speech generation on your reference audio. It **does not train a separate model** and does not guarantee identical emotion, accent, breathiness or intonation. The actual model stays the same; reference/style conditioning changes its output.

**Two different user experiences:**

- **Instant personal voice**: Upload 10–20 seconds of clean, authorized speech, normalize to mono WAV, synthesize with the reference file. This is available in the alpha.
- **Professional personal voice**: Record multiple speaker-consented clips and manually curate a library by reading style, emotion and language. Select the closest reference per script section; optionally learn a compatible small adapter later. This is a roadmap feature.

## Recording the references

- Record quiet-room, uncompressed high-quality audio, consistent microphone placement and speaking distance.
- Start with 10–20 seconds. Avoid background music, echoes, clipped peaks and multiple speakers.
- Maintain 2–5 reference clips for the same speaker, e.g. `calm`, `tutorial`, `energetic`, `announcement`, `warm`. Do not mix multiple people into one profile.
- Label transcript, language, microphone, room and style. Exact transcript is particularly useful for Qwen3-style in-context cloning.
- Evaluate identity/smoothness on **unseen scripts**, not just training or reference phrases.

## Natural voice consistency pipeline

1. Segment script at natural sentence / clause boundaries and preserve punctuation.
2. Use same voice reference and model revision for a scene. Switch reference style deliberately only when narration changes.
3. Use short references or reference embeddings when supported by that engine.
4. Prefer an engine's native style/emotion/pace controls. Do not create a fake slider that changes an unsupported parameter.
5. Generate 2–3 candidates for critical lines.
6. Check transcript fidelity, clipping, duration, voice identity and adjacent-segment consistency.
7. Reject glitches and retry a bounded number of times; keep human review for important segments.
8. Assemble with measured boundaries, short silence, gentle fades and LUFS mastering.
9. Store final WAV master separately from compressed MP3 and preserve provenance metadata.

## Original trainable research track: VoxTune Prosody Adapter

### Research goal
Predict continuous pause durations, speaking-rate targets, emotion/style classes and emphasis cues from narration text and a speaker-specific style embedding. Use these to condition a **supported** TTS architecture or to select the best reference/style settings.

### Minimal scientific contribution
- Curated, fully consented multi-style clips and a held-out test set, with provenance.
- Prosody planning baseline: punctuation rules.
- Learned prosody predictor: small text/style model with sequence outputs.
- Ablations: no prosody planning / rules / learned model; without speaker embedding; with and without consistency gate.
- Metrics: mean opinion score (blind panel), speaker identity similarity, pause timing error, WER and generation RTF.
- Explicit model card and training/data provenance, including limitations and misuse safeguards.

### Fine-tuning resources

Fine-tuning a modern acoustic TTS model is not the same as reference cloning. High-quality training normally needs many minutes or hours of rights-cleared speech, matching transcripts, validation data and substantially more training compute/memory than 4 GB VRAM for most mainstream recipes. Start with LoRA or small adapter training on a separate 16–24+ GB VRAM machine or rented GPU **after confirming that a chosen checkpoint offers a supported tuning pipeline**. Do not promise 100% identical voice or perfect accent retention.
