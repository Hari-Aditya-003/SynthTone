# Speech Quality and Performance Evaluation Plan

## Benchmark corpus

Create rights-cleared evaluation scripts and reference samples, separate from any training/fine-tuning clips. Proposed: 25 English scripts (short and long form), 10 authorized speaker references, varied numeric dates, abbreviations, technical terms, punctuation and emotion/pause demands. Add independent language corpora only when a specific supported engine is tested.

## Primary objective measurements

- **RTF:** generation wall time / generated audio duration (lower is faster).
- **Cold-start latency / warm-start latency:** separate model download, load, preprocessing and actual generation.
- **Peak VRAM (MiB):** use `torch.cuda.max_memory_allocated()` plus `nvidia-smi` process memory. Report both if possible.
- **Peak system RAM / disk footprint:** evaluate on 16 GB host.
- **WER/CER:** ASR-transcribed generated speech vs normalized input; numbers/acronyms manually reviewed to avoid false failures.
- **Speaker similarity:** cosine similarity between embeddings from a separately trained speaker-verification encoder; test intra-speaker stability and cross-speaker leakage.
- **Signal QA:** clipping rate, nonfinite sample detection, silence ratio, noise artifacts, LUFS, peak level and chunk-gap distributions.
- **MOS / A-B preference:** blinded human listeners score intelligibility, naturalness, similarity and expressive suitability; do not claim quality superiority based solely on a vendor's benchmark.
- **Consistency:** speaker embedding variance and perceived changes across adjacent chunks of a five-minute script.

## Gate criteria (proposed targets, not measured outcomes)

- **Correctness:** 100% of returned WAV files readable, no NaN samples, format fields consistent with encoded audio, no missing generation manifest.
- **Stability:** 100 repeated short requests produce no worker crash or unrecoverable job loss; OOM failures recorded and server stays usable.
- **Private access:** unknown API key → HTTP 401; voice files cannot be retrieved by arbitrary relative paths.
- **Voice revocation:** deleting a voice disallows future generation; production gate additionally purges embeddings and honors derivative retention policy.
- **Performance:** each model's median/P95 warm latency, cold latency, RTF, peak VRAM, and CPU/RAM measured on the actual Dell. A 4 GB GPU adapter is declared supported only if its worst-case peak stays under the safe headroom.
- **Quality:** no automatic pass based solely on model-reported similarity; WER plus blinded A/B samples required for release notes.

## Proposed benchmark data schema

`run_id, model_id, model_revision, hardware, torch_version, cuda_version, ref_id, script_id, seed, input_chars, audio_seconds, generation_wall_seconds, peak_vram_mib, peak_ram_mib, cold_or_warm, wer, similarity, lufs, clipping_ratio, human_mos, failure_code`.

Store benchmark config JSON and generated example clips if the speaker has granted redistribution rights. Compare different models under matched scripts and reference clips. Publication should include methodology and limitations.
