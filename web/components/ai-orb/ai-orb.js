/**
 * AICharacterOrb — Pure Canvas 2D AI character component for SynthTone.
 *
 * Visual design: dark glass sphere floating in space with:
 *   - Dark navy/purple sphere, internal glow
 *   - Two glowing "eye" bars in idle state (iOS Siri-style)
 *   - Sine wave visualization in speaking/wave mode (cyan/purple/pink)
 *   - Particle sparkles floating above the sphere
 *   - Specular highlight (top-left reflection)
 *   - Parallax mouse tracking: internal glow/eyes shift ~15% toward cursor
 *
 * States: idle | speaking | listening | thinking
 *
 * @author Hari Aditya (SynthTone)
 * @license MIT
 */

// ONE global AudioContext shared across all orb instances
let _sharedAudioContext = null;

function getSharedAudioContext() {
  if (!_sharedAudioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      _sharedAudioContext = new AudioCtx();
    }
  }
  return _sharedAudioContext;
}

export class AICharacterOrb {
  constructor(container, options = {}) {
    this.container =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!this.container) {
      throw new Error("AICharacterOrb: container not found.");
    }

    const size = parseInt(options.size || this.container.getAttribute?.("size") || 300, 10);

    this.options = {
      size,
      smoothing: options.smoothing ?? 0.1,
      maxParticles: options.maxParticles ?? 50,
    };

    // State
    this._state = "idle";
    this._expression = "neutral";

    // Mouse parallax (normalized -1..1)
    this._mouseNX = 0;
    this._mouseNY = 0;
    this._gaze = { x: 0, y: 0 }; // smoothed

    // Animation phase counters
    this._t = 0;
    this._wavePhase = 0;
    this._breathPhase = 0;
    this._arcAngle = 0;
    this._blinkProgress = 0; // 0 = open, 1 = fully closed
    this._blinkDir = 0;      // 0 = idle, 1 = closing, -1 = opening
    this._nextBlinkIn = this._randomBlinkDelay();

    // Particle system
    this._particles = [];
    this._initParticles();

    // Audio
    this._analyser = null;
    this._dataArray = null;
    this._micStream = null;
    this._audioLevel = 0;

    // RAF
    this._raf = null;
    this._destroyed = false;
    this._canvasReady = false;

    // Build canvas
    this._buildCanvas();

    // Kick off — defer first resize to RAF so layout is settled
    this._raf = requestAnimationFrame(() => {
      this._resizeCanvas();
      this._canvasReady = true;
      this._loop();
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Set the orb state: 'idle' | 'speaking' | 'listening' | 'thinking' */
  setState(state) {
    const valid = ["idle", "speaking", "listening", "thinking"];
    if (!valid.includes(state)) {
      console.warn(`AICharacterOrb.setState: unknown state "${state}"`);
      return;
    }
    this._state = state;

    // CSS class for container so external styles can react
    this.container.classList.toggle("speaking", state === "speaking");
    this.container.classList.toggle("listening", state === "listening");
    this.container.classList.toggle("thinking", state === "thinking");
  }

  /** Set robot facial expression: 'neutral' | 'happy' | 'hearts' | 'stars' | 'wink' | 'sleepy' | 'confused' | 'spiral' | 'blush' */
  setExpression(expr) {
    this._expression = expr || "neutral";
  }

  /** Shortcut: setWave(true) → 'speaking', setWave(false) → 'idle' */
  setWave(active) {
    this.setState(active ? "speaking" : "idle");
  }

  /**
   * Called with page-relative cursor coordinates.
   * The sphere itself does NOT move; only the internal glow/eyes shift.
   */
  trackMouse(pageX, pageY) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + window.scrollX;
    const cy = rect.top + rect.height / 2 + window.scrollY;
    const dx = pageX - cx;
    const dy = pageY - cy;
    const maxDist = Math.max(window.innerWidth, window.innerHeight) * 0.5;
    this._mouseNX = Math.max(-1, Math.min(1, dx / maxDist));
    this._mouseNY = Math.max(-1, Math.min(1, dy / maxDist));
  }

  /**
   * Attach a Web Audio AnalyserNode for real audio reactivity.
   * Accepts either an AnalyserNode directly or an HTMLAudioElement.
   */
  attachAudio(analyserNodeOrElement) {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      if (analyserNodeOrElement instanceof AnalyserNode) {
        // Direct analyser node
        this._analyser = analyserNodeOrElement;
        this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);
      } else if (analyserNodeOrElement instanceof HTMLMediaElement ||
                 analyserNodeOrElement instanceof HTMLAudioElement) {
        // HTML audio element — build the graph
        if (!this._analyser) {
          this._analyser = ctx.createAnalyser();
          this._analyser.fftSize = 64;
          this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);
          this._analyser.connect(ctx.destination);
        }
        const src = ctx.createMediaElementSource(analyserNodeOrElement);
        src.connect(this._analyser);

        analyserNodeOrElement.addEventListener("play",  () => this.setState("speaking"));
        analyserNodeOrElement.addEventListener("pause", () => this.setState("idle"));
        analyserNodeOrElement.addEventListener("ended", () => this.setState("idle"));
      }
    } catch (err) {
      console.warn("AICharacterOrb.attachAudio:", err);
    }
  }

  /** Request microphone stream and react to user's voice. */
  async listenMic() {
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") await ctx.resume();

      this._micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (!this._analyser) {
        this._analyser = ctx.createAnalyser();
        this._analyser.fftSize = 64;
        this._dataArray = new Uint8Array(this._analyser.frequencyBinCount);
        // Note: mic analyser is NOT connected to destination to avoid feedback
      }

      this._micSource = ctx.createMediaStreamSource(this._micStream);
      this._micSource.connect(this._analyser);

      this.setState("listening");
    } catch (err) {
      console.error("AICharacterOrb.listenMic:", err);
    }
  }

  /** Stop microphone stream started by listenMic(). */
  stopMic() {
    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }
    if (this._micSource) {
      try { this._micSource.disconnect(); } catch (_) {}
      this._micSource = null;
    }
    this.setState("idle");
  }

  /** Clean up RAF loops, event listeners, and canvas. */
  destroy() {
    this._destroyed = true;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this.stopMic();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    window.removeEventListener("mousemove", this._onMouseMove);
    this.canvas.remove();
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _buildCanvas() {
    this.container.classList.add("ai-orb-container");

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = `
      display: block;
      border-radius: 50%;
      cursor: pointer;
    `;
    this.ctx = this.canvas.getContext("2d");
    this.container.appendChild(this.canvas);

    // Click toggles speaking/idle
    this.canvas.addEventListener("click", () => {
      this.setState(this._state === "idle" ? "speaking" : "idle");
    });

    // Mouse tracking
    this._onMouseMove = (e) => this.trackMouse(e.pageX, e.pageY);
    window.addEventListener("mousemove", this._onMouseMove, { passive: true });

    // Resize observer
    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        if (!this._destroyed) this._resizeCanvas();
      });
      this._resizeObserver.observe(this.container);
    } else {
      window.addEventListener("resize", () => {
        if (!this._destroyed) this._resizeCanvas();
      });
    }
  }

  _resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const size = this.options.size;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.ctx.scale(dpr, dpr);
    this._size = size;
    this._cx = size / 2;
    this._cy = size / 2;
    this._r = size * 0.44; // sphere radius
  }

  _initParticles() {
    this._particles = [];
    for (let i = 0; i < this.options.maxParticles; i++) {
      this._particles.push(this._newParticle(true));
    }
  }

  _newParticle(scatter = false) {
    const size = this.options.size || 300;
    const r = size * 0.44;
    // Spawn anywhere within/above sphere in scatter mode, else just above sphere
    const angle = Math.random() * Math.PI * 2;
    const dist = scatter
      ? Math.random() * r * 0.9
      : r * (0.3 + Math.random() * 0.5);
    const spawnY = scatter
      ? this.options.size / 2 + (Math.random() - 0.5) * r * 1.2
      : this.options.size / 2 - r * 0.3 + (Math.random() - 0.5) * r * 0.6;
    return {
      x: this.options.size / 2 + Math.cos(angle) * dist * (scatter ? 1 : 0.6),
      y: spawnY,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(Math.random() * 0.6 + 0.2),
      radius: Math.random() * 1.8 + 0.5,
      alpha: Math.random() * 0.7 + 0.2,
      hue: Math.random() > 0.45 ? 186 : 285,
      life: 1,
      decay: Math.random() * 0.004 + 0.003,
    };
  }

  _randomBlinkDelay() {
    return Math.random() * 3000 + 2000; // 2–5 s
  }

  _readAudioLevel() {
    if (!this._analyser || !this._dataArray) return 0;
    this._analyser.getByteFrequencyData(this._dataArray);
    let sum = 0;
    for (let i = 0; i < this._dataArray.length; i++) sum += this._dataArray[i];
    return sum / (this._dataArray.length * 255);
  }

  _loop() {
    if (this._destroyed) return;
    this._tick();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _tick() {
    this._t += 1;

    // Smooth gaze toward mouse
    const targetX = this._mouseNX * this.options.maxOffset * 15;
    const targetY = this._mouseNY * this.options.maxOffset * 15;

    // Max internal offset = 15% of radius
    const maxOff = this._r * 0.15;
    const tX = this._mouseNX * maxOff;
    const tY = this._mouseNY * maxOff;
    this._gaze.x += (tX - this._gaze.x) * this.options.smoothing;
    this._gaze.y += (tY - this._gaze.y) * this.options.smoothing;

    // Blink logic (only in idle/listening)
    if (this._state === "idle" || this._state === "listening") {
      this._nextBlinkIn--;
      if (this._nextBlinkIn <= 0 && this._blinkDir === 0) {
        this._blinkDir = 1;
      }
      if (this._blinkDir === 1) {
        this._blinkProgress = Math.min(1, this._blinkProgress + 0.15);
        if (this._blinkProgress >= 1) this._blinkDir = -1;
      } else if (this._blinkDir === -1) {
        this._blinkProgress = Math.max(0, this._blinkProgress - 0.1);
        if (this._blinkProgress <= 0) {
          this._blinkDir = 0;
          this._nextBlinkIn = this._randomBlinkDelay() / 16.67; // convert ms to frames @ 60fps
        }
      }
    } else {
      this._blinkProgress = 0;
    }

    // Breath (scale pulse 0.98–1.02)
    this._breathPhase += 0.012;
    this._breathScale = 1 + Math.sin(this._breathPhase) * 0.02;

    // Wave phase
    const audioLvl = this._readAudioLevel();
    this._audioLevel += (audioLvl - this._audioLevel) * 0.15;
    this._wavePhase += 0.06 + this._audioLevel * 0.1;

    // Thinking arc
    this._arcAngle += 0.04;

    // Particles
    this._updateParticles();

    // Draw
    this._draw();
  }

  _updateParticles() {
    const speakingBoost = this._state === "speaking" ? 2 : 1;
    for (let p of this._particles) {
      p.x += p.vx + Math.sin(p.y * 0.05) * 0.2;
      p.y += p.vy * speakingBoost;
      p.life -= p.decay * speakingBoost;
      p.alpha = Math.max(0, p.life * 0.9);

      if (p.life <= 0 || p.y < this._cy - this._r * 1.6) {
        Object.assign(p, this._newParticle(false));
      }
    }
  }

  _draw() {
    if (!this._size) return;
    const ctx = this.ctx;
    const cx = this._cx;
    const cy = this._cy;
    const r = this._r * this._breathScale;
    const size = this._size;

    ctx.clearRect(0, 0, size, size);

    // ── 1. Sphere body ──────────────────────────────────────────────────────
    const sphereGrad = ctx.createRadialGradient(
      cx - r * 0.2, cy - r * 0.2, r * 0.05,
      cx, cy, r
    );
    sphereGrad.addColorStop(0, "rgba(28, 22, 60, 0.95)");
    sphereGrad.addColorStop(0.5, "rgba(10, 8, 25, 0.97)");
    sphereGrad.addColorStop(1, "rgba(4, 3, 10, 0.99)");

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();
    ctx.restore();

    // Outer glow (ambient ring)
    const glowIntensity = this._state === "speaking" ? 0.5 : 0.25;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.shadowBlur = 40;
    ctx.shadowColor = `rgba(0,220,255, ${glowIntensity})`;
    ctx.strokeStyle = `rgba(0, 220, 255, ${glowIntensity * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Purple outer haze
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    ctx.shadowBlur = 60;
    ctx.shadowColor = `rgba(121, 40, 202, 0.3)`;
    ctx.strokeStyle = "transparent";
    ctx.stroke();
    ctx.restore();

    // ── 2. Internal glow (shifts with mouse, parallax) ──────────────────────
    const gx = cx + this._gaze.x;
    const gy = cy + this._gaze.y;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const internalGlow = ctx.createRadialGradient(gx, gy, r * 0.05, gx, gy, r * 0.75);
    const glowAlpha = this._state === "speaking" ? 0.45 : 0.25;
    internalGlow.addColorStop(0, `rgba(60, 90, 220, ${glowAlpha + 0.1})`);
    internalGlow.addColorStop(0.4, `rgba(100, 40, 200, ${glowAlpha})`);
    internalGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = internalGlow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    // ── 3. State-specific inner content ─────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
    ctx.clip();

    switch (this._state) {
      case "idle":
        this._drawEyes(ctx, cx, cy, r, "idle");
        break;
      case "speaking":
        this._drawWave(ctx, cx, cy, r);
        break;
      case "listening":
        this._drawEyes(ctx, cx, cy, r, "listening");
        this._drawMicPulse(ctx, cx, cy, r);
        break;
      case "thinking":
        this._drawThinkingArc(ctx, cx, cy, r);
        break;
    }

    ctx.restore();

    // ── 4. Specular highlight (top-left, fixed — not parallax) ───────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const specX = cx - r * 0.32;
    const specY = cy - r * 0.35;
    const specGrad = ctx.createRadialGradient(specX, specY, 0, specX, specY, r * 0.42);
    specGrad.addColorStop(0, "rgba(255,255,255, 0.42)");
    specGrad.addColorStop(0.4, "rgba(255,255,255, 0.08)");
    specGrad.addColorStop(1, "rgba(255,255,255, 0)");
    ctx.fillStyle = specGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    // ── 5. Sphere rim / glass edge ──────────────────────────────────────────
    ctx.save();
    const rimGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rimGrad.addColorStop(0, "rgba(255,255,255,0.22)");
    rimGrad.addColorStop(0.5, "rgba(100,120,255,0.08)");
    rimGrad.addColorStop(1, "rgba(0,0,0,0.0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // ── 6. Particles ─────────────────────────────────────────────────────────
    this._drawParticles(ctx);
  }

  _drawEyes(ctx, cx, cy, r, mode) {
    // Eyes shift with gaze parallax
    const ex = cx + this._gaze.x;
    const ey = cy + this._gaze.y;
    const expr = this._expression || "neutral";

    const isListening = mode === "listening";
    const eyeGap = r * 0.32;
    const alpha = isListening ? 1.0 : 0.95;
    const glowColor = isListening ? "rgba(0,240,255,0.95)" : "rgba(0,220,255,0.8)";
    const eyeColor = isListening ? "#80f0ff" : "#ffffff";

    // 1. Blush cheeks if expression is blush or happy
    if (expr === "blush" || expr === "hearts") {
      ctx.save();
      for (let side of [-1, 1]) {
        const bx = ex + side * (eyeGap * 0.9);
        const by = ey + r * 0.16;
        const bGrad = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.12);
        bGrad.addColorStop(0, "rgba(255, 60, 110, 0.45)");
        bGrad.addColorStop(1, "rgba(255, 60, 110, 0)");
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 2. Expression: HEARTS
    if (expr === "hearts") {
      ctx.save();
      ctx.shadowBlur = 24;
      ctx.shadowColor = "rgba(255, 40, 110, 0.9)";
      ctx.fillStyle = "#ff3366";
      const hSize = r * 0.13;
      for (let side of [-1, 1]) {
        const hx = ex + side * eyeGap / 2;
        const hy = ey - hSize * 0.3;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.bezierCurveTo(hx - hSize, hy - hSize * 0.8, hx - hSize * 1.3, hy + hSize * 0.5, hx, hy + hSize * 1.2);
        ctx.bezierCurveTo(hx + hSize * 1.3, hy + hSize * 0.5, hx + hSize, hy - hSize * 0.8, hx, hy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // 3. Expression: STARS
    if (expr === "stars") {
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = "rgba(0, 240, 255, 0.9)";
      ctx.fillStyle = "#ffffff";
      const starR = r * 0.14;
      for (let side of [-1, 1]) {
        const sx = ex + side * eyeGap / 2;
        const sy = ey;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rad = i % 2 === 0 ? starR : starR * 0.32;
          const a = (i * Math.PI) / 4;
          const px = sx + Math.cos(a) * rad;
          const py = sy + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // 4. Expression: HAPPY (curved chevrons ^ ^)
    if (expr === "happy" || expr === "blush") {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = r * 0.06;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 18;
      ctx.shadowColor = glowColor;
      const hw = r * 0.12;
      const hh = r * 0.12;
      for (let side of [-1, 1]) {
        const hx = ex + side * eyeGap / 2;
        ctx.beginPath();
        ctx.moveTo(hx - hw, ey + hh * 0.4);
        ctx.lineTo(hx, ey - hh * 0.6);
        ctx.lineTo(hx + hw, ey + hh * 0.4);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // 5. Expression: WINK (left bar, right <)
    if (expr === "wink") {
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = glowColor;
      ctx.fillStyle = eyeColor;
      // Left eye bar
      const eyeW = r * 0.065;
      const eyeH = r * 0.36;
      const rr = eyeW / 2;
      const lx = ex - eyeGap / 2;
      ctx.beginPath();
      ctx.roundRect(lx - rr, ey - eyeH / 2, eyeW, eyeH, rr);
      ctx.fill();

      // Right eye wink (< shape)
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = r * 0.06;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const rx = ex + eyeGap / 2;
      const ww = r * 0.11;
      ctx.beginPath();
      ctx.moveTo(rx + ww, ey - ww * 0.8);
      ctx.lineTo(rx - ww * 0.5, ey);
      ctx.lineTo(rx + ww, ey + ww * 0.8);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 6. Expression: SLEEPY (- - with floating z)
    if (expr === "sleepy") {
      ctx.save();
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = r * 0.06;
      ctx.lineCap = "round";
      ctx.shadowBlur = 12;
      ctx.shadowColor = glowColor;
      const sw = r * 0.12;
      for (let side of [-1, 1]) {
        const sx = ex + side * eyeGap / 2;
        ctx.beginPath();
        ctx.moveTo(sx - sw, ey);
        ctx.lineTo(sx + sw, ey);
        ctx.stroke();
      }
      // Floating Z
      const zPhase = (this._t * 0.03) % 1;
      ctx.font = `bold ${r * 0.14}px sans-serif`;
      ctx.fillStyle = "rgba(0, 220, 255, " + (1 - zPhase) + ")";
      ctx.fillText("z", ex + eyeGap * 0.8 + zPhase * 10, ey - r * 0.2 - zPhase * 20);
      ctx.restore();
      return;
    }

    // 7. Expression: CONFUSED (left bar, right question mark)
    if (expr === "confused") {
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = glowColor;
      ctx.fillStyle = eyeColor;
      const eyeW = r * 0.065;
      const eyeH = r * 0.36;
      const rr = eyeW / 2;
      const lx = ex - eyeGap / 2;
      ctx.beginPath();
      ctx.roundRect(lx - rr, ey - eyeH / 2, eyeW, eyeH, rr);
      ctx.fill();

      // Right question mark
      const rx = ex + eyeGap / 2;
      ctx.font = `bold ${r * 0.32}px sans-serif`;
      ctx.fillStyle = eyeColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", rx, ey);
      ctx.restore();
      return;
    }

    // 8. Expression: SPIRAL (dizzy @ @)
    if (expr === "spiral") {
      ctx.save();
      ctx.strokeStyle = eyeColor;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 14;
      ctx.shadowColor = glowColor;
      const sAngle = this._t * 0.08;
      for (let side of [-1, 1]) {
        const sx = ex + side * eyeGap / 2;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.2) {
          const dist = (a / (Math.PI * 4)) * (r * 0.14);
          const px = sx + Math.cos(a + sAngle) * dist;
          const py = ey + Math.sin(a + sAngle) * dist;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // 9. DEFAULT / NEUTRAL: Sleek glowing vertical bars with natural blinking
    const eyeW = r * 0.065;
    const eyeH = r * (isListening ? 0.42 : 0.36) * (1 - this._blinkProgress * 0.97);

    for (let side of [-1, 1]) {
      const ex2 = ex + side * eyeGap / 2;

      ctx.save();
      ctx.shadowBlur = isListening ? 22 : 15;
      ctx.shadowColor = glowColor;
      ctx.fillStyle = eyeColor;

      const rr = eyeW / 2;
      const halfH = eyeH / 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(ex2 - rr, ey - halfH, eyeW, eyeH, rr);
      } else {
        ctx.moveTo(ex2 - rr, ey - halfH + rr);
        ctx.arcTo(ex2 - rr, ey - halfH, ex2 + rr, ey - halfH, rr);
        ctx.arcTo(ex2 + rr, ey - halfH, ex2 + rr, ey + halfH, rr);
        ctx.arcTo(ex2 + rr, ey + halfH, ex2 - rr, ey + halfH, rr);
        ctx.arcTo(ex2 - rr, ey + halfH, ex2 - rr, ey - halfH, rr);
      }
      ctx.closePath();
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.restore();
    }
  }

  _drawWave(ctx, cx, cy, r) {
    // Smooth rolling sine wave visualization — iOS Siri style
    const w = r * 1.5;
    const h = r * 0.6;
    const x0 = cx - w / 2;
    const y0 = cy;

    // Audio-reactive amplitude
    const baseAmp = r * 0.1;
    const amp = baseAmp + this._audioLevel * r * 0.25;

    const layers = [
      { hue: 186, sat: 100, lit: 70, alpha: 0.9, speed: 1.0, freq: 0.025, ampMul: 1.0 },
      { hue: 285, sat: 100, lit: 65, alpha: 0.75, speed: 1.4, freq: 0.032, ampMul: 0.75 },
      { hue: 320, sat: 100, lit: 70, alpha: 0.65, speed: 0.7, freq: 0.018, ampMul: 0.6 },
    ];

    for (const layer of layers) {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = `hsla(${layer.hue},${layer.sat}%,${layer.lit}%,${layer.alpha})`;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 18;
      ctx.shadowColor = `hsla(${layer.hue},100%,65%,0.6)`;

      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const nx = i / steps;
        const px = x0 + nx * w;
        // Bell-curve envelope to pinch at edges
        const env = Math.sin(nx * Math.PI);
        const py = y0 + Math.sin(nx * w * layer.freq + this._wavePhase * layer.speed)
          * amp * layer.ampMul * env;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawThinkingArc(ctx, cx, cy, r) {
    const arcR = r * 0.3;
    const startAngle = this._arcAngle;
    const endAngle = startAngle + Math.PI * 1.3;

    // Rotating arc (progress-indicator style)
    ctx.save();
    ctx.strokeStyle = "rgba(0, 220, 255, 0.85)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "rgba(0, 220, 255, 0.7)";
    ctx.beginPath();
    ctx.arc(cx + this._gaze.x, cy + this._gaze.y, arcR, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();

    // Small trailing dot
    ctx.save();
    ctx.fillStyle = "rgba(224, 64, 251, 0.9)";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(224, 64, 251, 0.8)";
    ctx.beginPath();
    ctx.arc(
      cx + this._gaze.x + Math.cos(endAngle) * arcR,
      cy + this._gaze.y + Math.sin(endAngle) * arcR,
      4, 0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  _drawMicPulse(ctx, cx, cy, r) {
    // Subtle pulsing mic ring (listening indicator)
    const pulse = 0.5 + 0.5 * Math.sin(this._t * 0.08);
    const micR = r * 0.12 + this._audioLevel * r * 0.08;

    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.3;
    ctx.strokeStyle = "rgba(0, 230, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(0, 230, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(cx + this._gaze.x, cy + this._gaze.y + r * 0.22, micR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawParticles(ctx) {
    for (const p of this._particles) {
      if (p.alpha <= 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 72%, ${p.alpha})`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 65%, 0.7)`;
      ctx.fill();
      ctx.restore();
    }
  }
}

// ─── Web Component ────────────────────────────────────────────────────────────

class AIOrb extends HTMLElement {
  static get observedAttributes() {
    return ["size", "state"];
  }

  connectedCallback() {
    const size = parseInt(this.getAttribute("size") || "300", 10);
    const state = this.getAttribute("state") || "idle";

    // Shadow DOM so component styles don't leak
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    // Inject host style into shadow
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: inline-block;
        border-radius: 50%;
        overflow: hidden;
      }
    `;
    this.shadowRoot.appendChild(style);

    const wrapper = document.createElement("div");
    this.shadowRoot.appendChild(wrapper);

    this._orb = new AICharacterOrb(wrapper, { size });
    if (state !== "idle") this._orb.setState(state);
  }

  attributeChangedCallback(name, _old, value) {
    if (!this._orb) return;
    if (name === "state") this._orb.setState(value);
    if (name === "size") {
      // Recreate with new size
      this._orb.destroy();
      const wrapper = document.createElement("div");
      this.shadowRoot.replaceChild(wrapper, this.shadowRoot.querySelector("div"));
      this._orb = new AICharacterOrb(wrapper, { size: parseInt(value, 10) });
    }
  }

  disconnectedCallback() {
    if (this._orb) this._orb.destroy();
  }

  // Proxy public API
  setState(state) { this._orb?.setState(state); }
  setWave(active) { this._orb?.setWave(active); }
  trackMouse(x, y) { this._orb?.trackMouse(x, y); }
  attachAudio(node) { this._orb?.attachAudio(node); }
  listenMic() { return this._orb?.listenMic(); }
  stopMic() { this._orb?.stopMic(); }
  destroy() { this._orb?.destroy(); }
}

if (typeof customElements !== "undefined" && !customElements.get("ai-orb")) {
  customElements.define("ai-orb", AIOrb);
}

export { AIOrb };
export default AICharacterOrb;
