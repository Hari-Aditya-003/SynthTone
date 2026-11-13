/**
 * AICharacterOrb — High-performance, reactive AI character component.
 * Features:
 *   1. Smooth mouse-tracking parallax gaze with 3D sphere perspective.
 *   2. Natural eye blinking & micro-saccades.
 *   3. Floating cosmic stardust particle aura.
 *   4. Seamless transformation to fluid soundwave in "wave" / "speaking" mode.
 *   5. Web Audio API integration for real-time speech / microphone reactivity.
 *
 * @author Hari Aditya (SynthTone)
 * @license MIT
 */

export class AICharacterOrb {
  constructor(container, options = {}) {
    this.container =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!this.container) {
      throw new Error(`AICharacterOrb: Container element not found.`);
    }

    this.options = {
      size: options.size || 260,
      mode: options.mode || "eyes", // 'eyes' | 'wave' | 'speaking' | 'listening'
      bubbleText: options.bubbleText || "Um...how is the weather",
      showBubble: options.showBubble !== false,
      smoothing: options.smoothing || 0.12,
      maxOffset: options.maxOffset || 22,
      ...options,
    };

    // Tracking state
    this.targetX = 0;
    this.targetY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.isLookingStraight = false;
    this.mode = this.options.mode;

    // Particle system
    this.particles = [];
    this.maxParticles = 42;

    // Audio reactive state
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.isAudioConnected = false;
    this.wavePhase = 0;
    this.waveAmplitude = 0.5;

    // Blinking
    this.blinkTimer = null;
    this.isBlinking = false;

    // Build DOM & Start
    this._initDOM();
    this._initParticles();
    this._bindEvents();
    this._startBlinkLoop();
    this._animate();
  }

  _initDOM() {
    this.container.classList.add("ai-orb-container");
    this.container.style.setProperty("--orb-size", `${this.options.size}px`);
    this.container.setAttribute("data-mode", this.mode);

    this.container.innerHTML = `
      <div class="ai-orb-bubble ${this.options.showBubble ? "" : "hidden"}">
        ${this.options.bubbleText}
      </div>
      <canvas class="ai-orb-particles-canvas"></canvas>
      <div class="ai-orb-sphere" role="img" aria-label="Interactive AI Companion">
        <div class="ai-orb-specular"></div>
        <div class="ai-orb-core-plane">
          <div class="ai-orb-matrix-overlay"></div>
          <div class="ai-orb-eyes">
            <div class="ai-orb-eye left-eye"></div>
            <div class="ai-orb-eye right-eye"></div>
          </div>
          <canvas class="ai-orb-waveform-canvas"></canvas>
        </div>
      </div>
    `;

    this.bubbleEl = this.container.querySelector(".ai-orb-bubble");
    this.sphereEl = this.container.querySelector(".ai-orb-sphere");
    this.corePlaneEl = this.container.querySelector(".ai-orb-core-plane");
    this.eyesEl = this.container.querySelectorAll(".ai-orb-eye");
    this.particleCanvas = this.container.querySelector(".ai-orb-particles-canvas");
    this.waveCanvas = this.container.querySelector(".ai-orb-waveform-canvas");

    this.pCtx = this.particleCanvas.getContext("2d");
    this.wCtx = this.waveCanvas.getContext("2d");

    this._resizeCanvases();
  }

  _resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const pRect = this.particleCanvas.getBoundingClientRect();
    this.particleCanvas.width = (pRect.width || this.options.size * 1.3) * dpr;
    this.particleCanvas.height = (pRect.height || this.options.size * 1.2) * dpr;
    this.pCtx.scale(dpr, dpr);

    const wRect = this.corePlaneEl.getBoundingClientRect();
    this.waveCanvas.width = (wRect.width || 150) * dpr;
    this.waveCanvas.height = (wRect.height || 100) * dpr;
    this.wCtx.scale(dpr, dpr);
    this.waveWidth = wRect.width || 150;
    this.waveHeight = wRect.height || 100;
  }

  _initParticles() {
    const width = this.options.size * 1.3;
    const height = this.options.size * 1.2;
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: width * 0.5 + (Math.random() - 0.5) * (this.options.size * 0.75),
        y: height * 0.45 + (Math.random() - 0.5) * (this.options.size * 0.55),
        radius: Math.random() * 2.2 + 0.6,
        alpha: Math.random() * 0.7 + 0.2,
        vy: -(Math.random() * 0.65 + 0.25),
        vx: (Math.random() - 0.5) * 0.4,
        hue: Math.random() > 0.45 ? 186 : 285, // Cyan or Magenta/Purple
      });
    }
  }

  _bindEvents() {
    this._onMouseMove = (e) => {
      if (this.isLookingStraight) {
        this.targetX = 0;
        this.targetY = 0;
        return;
      }
      const rect = this.sphereEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.hypot(dx, dy);
      const maxDist = Math.max(window.innerWidth, window.innerHeight) * 0.55;

      const norm = Math.min(dist / maxDist, 1.0);
      const angle = Math.atan2(dy, dx);

      this.targetX = Math.cos(angle) * norm;
      this.targetY = Math.sin(angle) * norm;
    };

    window.addEventListener("mousemove", this._onMouseMove, { passive: true });

    // Click on sphere toggles mode between Eyes & Waveform
    this.sphereEl.addEventListener("click", () => {
      const nextMode = this.mode === "eyes" ? "wave" : "eyes";
      this.setMode(nextMode);
    });

    window.addEventListener("resize", () => {
      this._resizeCanvases();
    });
  }

  _startBlinkLoop() {
    const scheduleNextBlink = () => {
      const delay = Math.random() * 3200 + 2200;
      this.blinkTimer = setTimeout(() => {
        if (this.mode === "eyes") {
          this.triggerBlink();
        }
        scheduleNextBlink();
      }, delay);
    };
    scheduleNextBlink();
  }

  triggerBlink() {
    this.eyesEl.forEach((eye) => eye.classList.add("blinking"));
    setTimeout(() => {
      this.eyesEl.forEach((eye) => eye.classList.remove("blinking"));
    }, 140);
  }

  setMode(mode) {
    this.mode = mode;
    this.container.setAttribute("data-mode", mode);
    if (mode === "speaking" || mode === "wave") {
      this.sphereEl.classList.add("active-speaking");
    } else {
      this.sphereEl.classList.remove("active-speaking");
    }
  }

  lookStraight(enable = true) {
    this.isLookingStraight = enable;
    if (enable) {
      this.targetX = 0;
      this.targetY = 0;
    }
  }

  setBubble(text, durationMs = 0) {
    if (!text) {
      this.bubbleEl.classList.add("hidden");
      return;
    }
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.remove("hidden");
    if (durationMs > 0) {
      setTimeout(() => {
        this.bubbleEl.classList.add("hidden");
      }, durationMs);
    }
  }

  /**
   * Connect an HTML5 <audio> element to drive the waveform reactively.
   */
  attachAudio(audioElement) {
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }

      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      }

      const source = this.audioContext.createMediaElementSource(audioElement);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      audioElement.addEventListener("play", () => {
        this.setMode("speaking");
        this.lookStraight(true);
      });
      audioElement.addEventListener("pause", () => {
        this.setMode("eyes");
        this.lookStraight(false);
      });
      audioElement.addEventListener("ended", () => {
        this.setMode("eyes");
        this.lookStraight(false);
      });

      this.isAudioConnected = true;
    } catch (err) {
      console.warn("AICharacterOrb: Could not attach Web Audio API:", err);
    }
  }

  /**
   * Request microphone stream to react when the user speaks.
   */
  async listenMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx();
      }
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      this.setMode("listening");
      this.lookStraight(true);
      this.setBubble("Listening to your voice...");
      this.isAudioConnected = true;
    } catch (err) {
      console.error("AICharacterOrb: Microphone permission denied or unavailable", err);
    }
  }

  _animate() {
    // 1. Mouse Tracking & Gaze Interpolation
    this.currentX += (this.targetX - this.currentX) * this.options.smoothing;
    this.currentY += (this.targetY - this.currentY) * this.options.smoothing;

    const offsetX = this.currentX * this.options.maxOffset;
    const offsetY = this.currentY * (this.options.maxOffset * 0.85);

    const rotY = this.currentX * 28;
    const rotX = -this.currentY * 22;

    this.corePlaneEl.style.transform = `
      translate3d(${offsetX}px, ${offsetY}px, 0px)
      rotateY(${rotY}deg)
      rotateX(${rotX}deg)
    `;

    // Parallax depth for the vertical slit eyes
    if (this.mode === "eyes") {
      const eyeShiftX = this.currentX * 6;
      const eyeShiftY = this.currentY * 4;
      this.eyesEl.forEach((eye) => {
        eye.style.transform = `translate(${eyeShiftX}px, ${eyeShiftY}px)`;
      });
    }

    // 2. Render Floating Particles
    this._renderParticles();

    // 3. Render Fluid Waveform
    if (this.mode === "wave" || this.mode === "speaking" || this.mode === "listening") {
      this._renderWaveform();
    }

    this._raf = requestAnimationFrame(() => this._animate());
  }

  _renderParticles() {
    const width = this.options.size * 1.3;
    const height = this.options.size * 1.2;
    this.pCtx.clearRect(0, 0, width, height);

    for (let p of this.particles) {
      p.y += p.vy;
      p.x += p.vx + Math.sin(p.y * 0.05) * 0.2;

      // Wrap particles back to bottom of top cluster
      if (p.y < 10) {
        p.y = height * 0.65;
        p.x = width * 0.5 + (Math.random() - 0.5) * (this.options.size * 0.7);
        p.alpha = Math.random() * 0.7 + 0.2;
      }

      this.pCtx.save();
      this.pCtx.beginPath();
      this.pCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.pCtx.fillStyle = `hsla(${p.hue}, 100%, 72%, ${p.alpha})`;
      this.pCtx.shadowBlur = 8;
      this.pCtx.shadowColor = `hsla(${p.hue}, 100%, 65%, 0.8)`;
      this.pCtx.fill();
      this.pCtx.restore();
    }
  }

  _renderWaveform() {
    const w = this.waveWidth || 150;
    const h = this.waveHeight || 100;
    const cy = h / 2;

    this.wCtx.clearRect(0, 0, w, h);

    let audioLevel = 0.35;
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      audioLevel = Math.max(0.15, sum / (this.dataArray.length * 255));
    }

    this.wavePhase += 0.08 + audioLevel * 0.08;

    // Draw multi-layer chromatic fluid soundwaves
    const layers = [
      { color: "rgba(0, 240, 255, 0.85)", speed: 1.0, amp: 24, freq: 0.045 },
      { color: "rgba(224, 64, 251, 0.80)", speed: 1.3, amp: 18, freq: 0.055 },
      { color: "rgba(255, 255, 255, 0.95)", speed: 0.8, amp: 12, freq: 0.035 },
    ];

    for (let layer of layers) {
      this.wCtx.save();
      this.wCtx.beginPath();
      this.wCtx.strokeStyle = layer.color;
      this.wCtx.lineWidth = 3.5;
      this.wCtx.lineCap = "round";
      this.wCtx.shadowBlur = 14;
      this.wCtx.shadowColor = layer.color;

      for (let x = 12; x <= w - 12; x += 2) {
        // Bell curve envelope to pinch wave at edges
        const normX = (x - 12) / (w - 24);
        const envelope = Math.sin(normX * Math.PI);
        const y =
          cy +
          Math.sin(x * layer.freq + this.wavePhase * layer.speed) *
            layer.amp *
            audioLevel *
            2.2 *
            envelope;

        if (x === 12) {
          this.wCtx.moveTo(x, y);
        } else {
          this.wCtx.lineTo(x, y);
        }
      }
      this.wCtx.stroke();
      this.wCtx.restore();
    }
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this.blinkTimer);
    window.removeEventListener("mousemove", this._onMouseMove);
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.container.innerHTML = "";
  }
}

// Auto-initialize any <ai-character-orb> tags on page load
if (typeof customElements !== "undefined" && !customElements.get("ai-character-orb")) {
  customElements.define(
    "ai-character-orb",
    class extends HTMLElement {
      connectedCallback() {
        const size = parseInt(this.getAttribute("size") || "260", 10);
        const mode = this.getAttribute("mode") || "eyes";
        const bubble = this.getAttribute("bubble") || "Um...how is the weather";
        this.orb = new AICharacterOrb(this, { size, mode, bubbleText: bubble });
      }
      disconnectedCallback() {
        if (this.orb) this.orb.destroy();
      }
    }
  );
}
