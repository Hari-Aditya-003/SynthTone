# Model selection and licensing — 14 November 2026 research snapshot

**Critical distinction:** The application shell's MIT license does not automatically apply to bundled model weights. Check each upstream model card and transitive dependency before commercial redistribution.

| Engine | Voice reference cloning | Typical purpose | License shown upstream | Dell RTX 3050 Ti 4 GB recommendation |
|---|---|---|---|---|
| Kokoro 82M | No (preset/style voices) | Fast preset narration | Apache-2.0 | **Primary CPU model** |
| Chatterbox Nano 110M | Yes (`audio_prompt_path`) | Efficient English clone, tags such as `[laugh]` | MIT | **Primary cloned-voice model**, CPU fallback |
| Chatterbox Turbo 350M | Yes (`audio_prompt_path`) | Richer English / expression; tags | MIT | **Try sequentially** after benchmarking; avoid other GPU models loaded |
| OpenVoice V2 | Yes, tone-color transfer | Multilingual identity transfer with upstream TTS engine | MIT | Add as optional adapter (separate dependency stack) |
| Chatterbox Multilingual V3 500M | Yes | Includes Hindi, not Telugu in official list | MIT (check specific checkpoint) | Optional, peak VRAM to be measured |
| Qwen3-TTS 12Hz 0.6B Base | Yes (reference clip) | Advanced multilingual cloning | Apache-2.0 | **Experimental**; model card weights ~2.5GB on disk, runtime memory higher |
| Qwen3-TTS 1.7B | Yes / variants | More demanding cloning and controllable voices | Apache-2.0 (check checkpoint) | **Not a reasonable primary choice** on 4GB GPU |
| F5-TTS pretrained models | Yes | High-quality zero-shot TTS | **CC-BY-NC** pretrained weights, MIT code | Exclude from commercial default |

## Primary source links

- Original MLX project (Apple Silicon only): https://github.com/rorystandley/mlx-tts-studio
- Kokoro card: https://huggingface.co/hexgrad/Kokoro-82M
- Chatterbox source: https://github.com/resemble-ai/chatterbox
- Chatterbox Nano: https://huggingface.co/ResembleAI/chatterbox-nano
- Chatterbox Turbo: https://huggingface.co/ResembleAI/chatterbox-turbo
- Chatterbox multilingual: https://github.com/resemble-ai/chatterbox
- OpenVoice V2: https://github.com/myshell-ai/OpenVoice
- Qwen3-TTS official repo: https://github.com/QwenLM/Qwen3-TTS
- Qwen 0.6B Base: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base
- F5-TTS: https://github.com/SWivid/F5-TTS

## Resource planning

- 4 GB VRAM is a **hard limit**, not a total-model storage limit. Weights + tokenizer + vocoder + KV cache + intermediate tensors + CUDA runtime must fit concurrently.
- Do not treat parameter count or checkpoint size as GPU memory requirements. The values are runtime/framework/batch-dependent.
- Use `nvidia-smi` while generating ten different clips; measure **peak VRAM** and **real-time factor (RTF = generation seconds / audio seconds)**.
- On single GPU: concurrency 1, one loaded checkpoint, short segment lengths, batch size 1; offload to CPU only when response time is acceptable.
- CPU mode is viable but speed depends on Intel CPU model, RAM channels, and thermal limits. No speeds are guaranteed here.
- Chatterbox Nano and Turbo both use the same `ChatterboxTurboTTS` class with `nano=True` for Nano in upstream examples.
- Qwen's native 0.6B Base voice clone supports reference audio; **Kokoro does not produce arbitrary cloned voices** without a separate voice-conversion system.
- Language support: Nano and Turbo are English-only as shown in upstream model zoo; Chatterbox Multilingual includes Hindi. Neither Qwen3's official 10-language list nor Chatterbox's 23-language list includes Telugu. Do not advertise native Telugu cloning without testing a specific supported engine.

## Compatibility test checklist

1. Verify host PyTorch/CUDA and `torch.cuda.is_available()`.
2. Generate 10 seconds of English Kokoro audio and check no clipping/silence.
3. Clone voice with Nano using 10 sec authorized reference, then evaluate similarity and intelligibility.
4. Generate three takes of a 60-second script with Nano and Turbo, one checkpoint loaded at a time.
5. Record loading seconds, generation RTF, peak GPU, peak system RAM and disk use.
6. Reject or fall back to CPU if a checkpoint causes OOM. Never silently advertise an unavailable model.
7. Check `THIRD_PARTY_NOTICES.md`, upstream card and dependency licenses prior to releases.
