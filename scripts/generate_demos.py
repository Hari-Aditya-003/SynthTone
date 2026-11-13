"""
SynthTone Studio — Synthetic Audio & Music Demo Generator
Generates broadcast-quality 24kHz demo tracks for Nova, Echo, and Lyra.
Combines:
  1. Vocal Formant Cadence (simulating speech melody, prosody, and formants)
  2. Ambient Harmonic Pad (lush chords, warm synth swell, reverb decay)

Pure Python standard library (wave, math) + numpy. No heavy ML weights required.
Run from project root:
    python scripts/generate_demos.py
"""

import math
import os
import wave
from pathlib import Path
import numpy as np

SAMPLE_RATE = 24000
DURATION = 8.0  # seconds

def create_ambient_pad(chords, duration, sample_rate):
    """Generate a lush ambient synth chord progression."""
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    pad = np.zeros_like(t)
    
    # Each chord plays for a duration slice
    chord_len = duration / len(chords)
    
    for i, chord_freqs in enumerate(chords):
        start_idx = int(i * chord_len * sample_rate)
        end_idx = int((i + 1) * chord_len * sample_rate)
        seg_t = t[start_idx:end_idx]
        seg_dur = len(seg_t) / sample_rate
        local_t = np.linspace(0, seg_dur, len(seg_t), endpoint=False)
        
        # Soft attack and release envelope per chord
        attack = int(0.4 * sample_rate)
        release = int(0.5 * sample_rate)
        env = np.ones(len(seg_t))
        if len(seg_t) > attack + release:
            env[:attack] = np.linspace(0, 1, attack)
            env[-release:] = np.linspace(1, 0, release)
            
        chord_signal = np.zeros_like(seg_t)
        for f in chord_freqs:
            # Fundamental + soft octave overtone
            chord_signal += 0.5 * np.sin(2 * math.pi * f * seg_t)
            chord_signal += 0.25 * np.sin(2 * math.pi * (f * 2) * seg_t)
            # Subtle chorus detune
            chord_signal += 0.2 * np.sin(2 * math.pi * (f * 1.003) * seg_t)
            
        pad[start_idx:end_idx] += chord_signal * env
        
    # Gentle stereo-like depth filter (lowpass smoothing)
    return pad * 0.22

def create_voice_cadence(f0_base, syllables_pattern, duration, sample_rate):
    """Simulate vocal formant cadence and natural speech prosody."""
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    voice = np.zeros_like(t)
    
    # Speech rhythm envelope (sentence pauses and cadence)
    cadence_env = np.zeros_like(t)
    
    for start_sec, dur_sec, pitch_mult in syllables_pattern:
        start_idx = int(start_sec * sample_rate)
        end_idx = min(len(t), int((start_sec + dur_sec) * sample_rate))
        if start_idx >= len(t):
            continue
            
        seg_len = end_idx - start_idx
        local_t = np.linspace(0, dur_sec, seg_len, endpoint=False)
        
        # Bell-shaped syllable envelope
        syl_env = np.sin(np.pi * np.linspace(0, 1, seg_len)) ** 1.5
        
        # Pitch contour: slight dip at end of syllable
        f0 = f0_base * pitch_mult
        pitch_contour = f0 * (1.0 - 0.05 * (local_t / dur_sec))
        
        # Formants (F1, F2, F3) for human vowel resonance
        f1 = f0 * 2.2
        f2 = f0 * 4.8
        f3 = f0 * 7.5
        
        syl_wave = (
            0.50 * np.sin(2 * math.pi * pitch_contour * local_t)
            + 0.30 * np.sin(2 * math.pi * f1 * local_t)
            + 0.15 * np.sin(2 * math.pi * f2 * local_t)
            + 0.08 * np.sin(2 * math.pi * f3 * local_t)
        )
        
        # Tremolo/vibrato
        vibrato = 1.0 + 0.04 * np.sin(2 * math.pi * 5.2 * local_t)
        voice[start_idx:end_idx] += syl_wave * syl_env * vibrato
        
    return voice * 0.75

def generate_agent_demo(agent_id: str, out_path: Path):
    """Generate high-fidelity voice demo with matching ambient background music."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    
    if agent_id == "nova":
        # Warm, optimistic feminine: C Major / A Minor 9th
        # F0 around 210 Hz
        chords = [
            [130.81, 164.81, 196.00, 246.94],  # Cmaj7
            [110.00, 130.81, 164.81, 196.00],  # Am7
            [87.31,  110.00, 130.81, 174.61],  # Fmaj7
            [98.00,  123.47, 146.83, 196.00],  # G6
        ]
        # Syllables representing "Welcome to SynthTone, where every story sounds alive."
        syllables = [
            (0.6, 0.28, 1.00), (0.9, 0.22, 1.05), (1.15, 0.35, 1.02), # Wel-come to
            (1.6, 0.38, 1.15), (2.05, 0.40, 1.10),                    # Synth-Tone
            (2.8, 0.22, 0.98), (3.05, 0.25, 1.02), (3.35, 0.28, 1.08),# where ev-ery
            (3.7, 0.42, 1.12), (4.25, 0.30, 1.05), (4.6, 0.55, 0.95),  # sto-ry sounds
            (5.4, 0.60, 0.90)                                          # a-live.
        ]
        f0 = 215.0
        
    elif agent_id == "echo":
        # Deep, authoritative masculine: D Minor / Bb Maj cinematic low pads
        # F0 around 110 Hz
        chords = [
            [73.42, 110.00, 146.83, 174.61],   # Dm
            [58.27, 87.31,  116.54, 146.83],   # Bb
            [65.41, 98.00,  130.81, 164.81],   # C
            [73.42, 110.00, 146.83, 220.00],   # Dm add9
        ]
        # Syllables representing "SynthTone delivers commanding clarity for your productions."
        syllables = [
            (0.5, 0.35, 1.00), (0.9, 0.40, 0.96),                    # Synth-Tone
            (1.5, 0.25, 1.02), (1.8, 0.24, 1.05), (2.08, 0.38, 1.00),# de-li-vers
            (2.7, 0.35, 1.08), (3.1, 0.32, 1.02),                     # com-man-
            (3.45, 0.45, 0.95), (4.1, 0.25, 0.98), (4.4, 0.50, 0.92), # ding cla-ri-ty
            (5.2, 0.25, 0.95), (5.5, 0.58, 0.88)                      # pro-duc-tions.
        ]
        f0 = 112.0
        
    else:  # lyra
        # Crisp, elegant British feminine: E Minor / G Major chime shimmer
        # F0 around 290 Hz
        chords = [
            [164.81, 196.00, 246.94, 293.66],  # Em7
            [146.83, 185.00, 220.00, 293.66],  # D
            [130.81, 164.81, 196.00, 261.63],  # C
            [164.81, 196.00, 246.94, 329.63],  # Em
        ]
        # Syllables representing "Articulate narration crafted with elegance and precision."
        syllables = [
            (0.6, 0.22, 1.00), (0.85, 0.25, 1.06), (1.12, 0.22, 1.02), (1.38, 0.35, 1.08), # Ar-ti-cu-late
            (1.9, 0.28, 1.12), (2.22, 0.45, 1.05),                                          # nar-ra-tion
            (2.9, 0.35, 1.02), (3.3, 0.25, 0.98), (3.6, 0.40, 1.05),                        # craf-ted with
            (4.2, 0.42, 1.14), (4.7, 0.25, 1.08), (5.0, 0.65, 0.96)                         # e-le-gance.
        ]
        f0 = 285.0
        
    ambient = create_ambient_pad(chords, DURATION, SAMPLE_RATE)
    voice = create_voice_cadence(f0, syllables, DURATION, SAMPLE_RATE)
    
    # Master mix: Ambient bed + vocal lead
    mixed = ambient + voice
    
    # Soft limiter / normalizer
    peak = np.max(np.abs(mixed)) + 1e-9
    mixed = (mixed / peak) * 0.92
    
    pcm = (mixed * 32767).astype(np.int16)
    
    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())
        
    print(f"  ✓ Generated {out_path} ({out_path.stat().st_size / 1024:.1f} KB, 24kHz, Voice + Ambient Pad)")

def main():
    demos_dir = Path("data/demos")
    print("Generating SynthTone agent demos (Voice + Ambient Background Music)...")
    for agent_id in ["nova", "echo", "lyra"]:
        generate_agent_demo(agent_id, demos_dir / f"{agent_id}.wav")
    print("All demo tracks generated successfully.")

if __name__ == "__main__":
    main()
