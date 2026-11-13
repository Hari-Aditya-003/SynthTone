# Third-Party Notices & Open-Source Attributions

SynthTone is licensed under the MIT License (Copyright (c) 2026 Hari Aditya).

The underlying speech synthesis models, neural inference frameworks, and upstream dependencies are independently developed and governed by their respective licenses:

- **Kokoro 82M**: Apache License 2.0  
  Repository: https://huggingface.co/hexgrad/Kokoro-82M  
  Python library & phonemizer: https://github.com/hexgrad/kokoro

- **Chatterbox Nano 110M & Chatterbox Turbo 350M**: MIT License  
  Model Weights: https://huggingface.co/ResembleAI/chatterbox-turbo  
  Software: https://github.com/resemble-ai/chatterbox

- **PyTorch & CUDA Toolkit**: BSD-style license  
  https://pytorch.org

- **FastAPI & Uvicorn**: MIT License  
  https://fastapi.tiangolo.com

- **FFmpeg**: LGPL / GPL  
  Used via external CLI for loudness normalization (EBU R128) and MP3 encoding.

SynthTone does not bundle neural model weights within git; model weights are downloaded securely on first invocation from Hugging Face into the designated local cache.
