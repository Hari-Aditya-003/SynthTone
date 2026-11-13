# SynthTone AI — Product Requirements and UI System

## Product positioning

An ElevenLabs-style creative workflow for independent developers and content creators, with private storage, model transparency and self-hosted inference. Feature parity with ElevenLabs is a **long-term goal**, not a claim about this starter.

## Major screens (target)

### Home / dashboard
Projects grid, voice activity, queued jobs, model availability, last exports, local device GPU health and free disk space. Clearly distinguish Ready, Download Required, Out of Memory, Unsupported Language and License Restricted.

### Text-to-Speech Studio
- Left: projects + scripts.
- Center: rich script editor with paragraph/sentence cards, per-section voice and preview, pronunciations and pause controls.
- Right: model, reference voice, language, voice consistency, style controls supported by engine, speed, pronunciation overrides, multi-take selection.
- Bottom: actual audio waveform timeline, clip trims, markers, speaker labels, layer volumes, master bus, output format.
- Primary CTA: Generate takes; visible queue status and generation progress.

### Voice Library
Voice cards with recorded preview, language, owner, privacy status, consent verification status, reference style, last used and revoke/delete actions. Local voice upload wizard with VAD/silence detection and quality feedback.

### Multi-voice Dialogue
Speaker A / B / C with independently authorized voice profiles, text blocks, automatic turn-based rendering, no overlapping AI inference in 4 GB mode, assembled timeline and batch export.

### Dubbing and localization (later)
Upload video/audio, transcribe, divide into speaker turns, translate with manual review, TTS each turn, time-align or retime, export subtitles + dubbed audio. All third-party models require license checks.

### Model Manager
Enable/disable installed engines, show download/checkpoint revision, measured memory, languages, cloning support, commercial license, last error, model cache size. Explicitly label experimental engines.

### Queue and history
Job cards: progress, retry, cancellation, audio diagnostics, original/script metadata, date, waveform, storage size, provenance, WAV/MP3/ZIP and full generation manifest.

## Visual design tokens

- Theme: dark professional studio, optional light mode; clear neutral contrast and accent purple.
- Background: `#0d1019`; panels: `#171b28`; border: `#2b3141`; accent: `#ac98ff`; primary text: `#f4f4f8`; secondary: `#9ca7bc`.
- Typography: system font/Inter; headlines 28–44px, controls 12–14px; minimum 44px tap areas on mobile in production.
- Shell: collapsible left navigation (210–248px); top status and search; max-content width 1350px; responsive center + right panels.
- Feedback: queued/running/completed/failed/cancelled; never use decorative non-working buttons.
- Accessibility: keyboard shortcuts, visible focus, ARIA labels, transcript alongside waveform, reduced-motion mode, accessible contrast and player labels.

## Major feature levels

| Feature | Alpha | Beta | Full production |
|---|---|---|---|
| Text → speech | Yes | Yes | Yes |
| Multiple takes, WAV/MP3 | Yes | Yes | Yes |
| Reference voice cloning | Yes (attestation only) | Consent verification | Auditable consent/revocation |
| Multiple voice speakers per project | No | Yes | Yes |
| Fine-grained per-word prosody | No | Model-dependent | Model-dependent |
| Audio waveform, trimming and mixes | No | Yes | Yes |
| Instant preview / streaming | No | Some models | Supported engines only |
| Multilingual TTS | No | Selected engines | Validated languages |
| Pronunciation dictionary | No | Yes | Yes |
| Batch ZIP, subtitle alignment | No | Yes | Yes |
| Multi-user accounts | No | Yes | Yes |
| Developer API / SDK | Limited API | OpenAPI + SDK | Stable versioned API |
| Fine-tuning console | No | Optional experimental | Only where hardware/license allows |
| Automated quality checks | Basic validity only | ASR/clip QA | Calibrated evaluation + human control |

## User workflows

- **Demo voiceover**: paste 5-minute script → select clone reference → generate three takes → preview → regenerate one noisy line → export WAV for editing and MP3 for sharing.
- **Multi-language course**: select language-specific, license-cleared engine → review multilingual pronunciation → generate sections → compare WER and timing → export assets.
- **Podcast**: assign voice profiles to speakers → paragraph sequence → render segment jobs → normalize and mix timeline → export mastered track.

The first of these is partially implemented. Project timeline, per-segment regeneration and direct multi-speaker UI are not yet implemented.
