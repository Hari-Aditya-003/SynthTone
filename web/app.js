/**
 * SynthTone — Neural Voice Studio Client Application
 * Widescreen Studio UI · Reactive AI Character Orb · Real-time Voice Auditions
 * Optimized for local Dell GPU servers and static GitHub Pages hosting.
 *
 * @author Hari Aditya
 * @license MIT
 */

import { AICharacterOrb } from "./components/ai-orb/ai-orb.js";

// Global State
let apiKey = localStorage.getItem("synthtone_key") || "";
let orb = null;
let voiceAgents = [];
let activeDemoAudio = null;
let activePlayingAgentId = null;
let pollTimer = null;

const globalAudio = document.getElementById("global-player");

// Fallback Voice Agents (allows 100% interactive functionality on GitHub Pages)
const STATIC_AGENTS = [
  {
    id: "nova",
    name: "Nova",
    tagline: "Warm Narrator",
    description: "A warm, expressive feminine voice perfect for storytelling and empathetic explainer narration.",
    model_id: "kokoro",
    builtin_voice: "af_heart",
    personality: "Optimistic, nurturing, clear-spoken.",
    demo_audio_path: "./demos/nova.wav",
  },
  {
    id: "echo",
    name: "Echo",
    tagline: "Deep Professional",
    description: "A deep authoritative masculine voice for corporate narration, documentaries, and commanding presence.",
    model_id: "kokoro",
    builtin_voice: "bm_george",
    personality: "Composed, formal, gravitas.",
    demo_audio_path: "./demos/echo.wav",
  },
  {
    id: "lyra",
    name: "Lyra",
    tagline: "Crisp British",
    description: "A crisp British feminine voice for educational content, refined presentations, and luxury audiobooks.",
    model_id: "kokoro",
    builtin_voice: "bf_emma",
    personality: "Elegant, precise, articulate.",
    demo_audio_path: "./demos/lyra.wav",
  },
];

// Helper: Auth Headers
function getAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

// ══════════════════════════════════════════════════════════════════════════
// Toast Notification System (replaces window.alert)
// ══════════════════════════════════════════════════════════════════════════
export function showToast(message, type = "info", durationMs = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type} toast-${type}`;

  const iconMap = {
    success: "✓",
    error: "✕",
    info: "✦",
  };

  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || "•"}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast--visible");
  });

  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 350);
  }, durationMs);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ══════════════════════════════════════════════════════════════════════════
// AI Character Orb Initialization & Mouse Parallax
// ══════════════════════════════════════════════════════════════════════════
function initAIOrb() {
  const container = document.getElementById("hero-orb-container");
  if (!container) return;

  try {
    orb = new AICharacterOrb(container, {
      size: 380,
    });

    if (globalAudio) {
      orb.attachAudio(globalAudio);
    }

    // 3D Parallax mouse tracking
    window.addEventListener("mousemove", (e) => {
      if (orb) {
        orb.trackMouse(e.pageX, e.pageY);
      }
    });
  } catch (err) {
    console.warn("AI Character Orb initialization warning:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SonoAI Hero Floating Cards Wire-up
// ══════════════════════════════════════════════════════════════════════════
function initFloatingCards() {
  const fcPlayBtn = document.getElementById("fc-play-left");
  const fcWaveLeft = document.getElementById("fc-wave-left");
  const fcLikeBtn = document.getElementById("fc-like-btn");
  const fcCardRight = document.getElementById("card-sample-echo");
  const fcWaveRight = document.getElementById("fc-wave-right");

  // Left card: Play Nova sample
  if (fcPlayBtn) {
    fcPlayBtn.addEventListener("click", () => {
      const nova = voiceAgents.find((a) => a.id === "nova") || STATIC_AGENTS[0];
      const card = document.getElementById("agent-card-nova");
      const cardBtn = document.getElementById("btn-demo-nova");

      if (activePlayingAgentId === "nova") {
        stopCurrentAudition();
        fcPlayBtn.querySelector(".fc-play-icon").textContent = "▶";
        if (fcWaveLeft) fcWaveLeft.classList.remove("is-animating");
      } else {
        toggleAgentAudition(nova, cardBtn, card);
        fcPlayBtn.querySelector(".fc-play-icon").textContent = "⏸";
        if (fcWaveLeft) fcWaveLeft.classList.add("is-animating");
      }
    });
  }

  // Left card: Favorite heart button
  if (fcLikeBtn) {
    fcLikeBtn.addEventListener("click", () => {
      const isLiked = fcLikeBtn.classList.toggle("liked");
      fcLikeBtn.textContent = isLiked ? "♥" : "♡";
      if (orb) orb.setExpression(isLiked ? "hearts" : "happy");
      showToast(isLiked ? "Added to your voice favorites!" : "Removed from favorites.", "info", 1800);
    });
  }

  // Right card: Hover reaction
  if (fcCardRight) {
    fcCardRight.addEventListener("mouseenter", () => {
      if (fcWaveRight) fcWaveRight.classList.add("is-animating");
      if (orb && activePlayingAgentId === null) orb.setExpression("stars");
    });
    fcCardRight.addEventListener("mouseleave", () => {
      if (fcWaveRight) fcWaveRight.classList.remove("is-animating");
      if (orb && activePlayingAgentId === null) orb.setExpression("neutral");
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Voice Agents Loading & Auditioning (with Ambient Background Music)
// ══════════════════════════════════════════════════════════════════════════
async function loadVoiceAgents() {
  const grid = document.getElementById("agents-grid");
  if (!grid) return;

  try {
    const res = await fetch("/api/agents");
    if (!res.ok) throw new Error("Backend not reached, using static demo agents");
    voiceAgents = await res.json();
  } catch {
    // Seamless fallback for GitHub Pages hosting
    voiceAgents = STATIC_AGENTS;
  }

  renderVoiceAgents(voiceAgents);
  populateVoiceGrid(voiceAgents);
}

function renderVoiceAgents(agents) {
  const grid = document.getElementById("agents-grid");
  if (!grid) return;

  grid.innerHTML = "";

  agents.forEach((agent) => {
    const card = document.createElement("div");
    card.className = "agent-card";
    card.id = `agent-card-${agent.id}`;

    const orbMod = ["nova", "echo", "lyra"].includes(agent.id) ? `agent-orb--${agent.id}` : "agent-orb--default";

    card.innerHTML = `
      <div class="agent-orb ${orbMod}"></div>
      <h3 class="agent-name">${escapeHtml(agent.name)}</h3>
      <span class="agent-tagline">${escapeHtml(agent.tagline || "Voice Agent")}</span>
      <p class="agent-desc">${escapeHtml(agent.description)}</p>
      <div class="agent-quote">"${escapeHtml(agent.personality || "Studio ready.")}"</div>
      <div class="agent-spec">
        <span>${escapeHtml((agent.model_id || "kokoro").toUpperCase())}</span> · 
        <span>${escapeHtml(agent.builtin_voice || "default")}</span>
      </div>
      <div class="agent-actions">
        <button type="button" class="btn-demo" id="btn-demo-${agent.id}">
          <span class="demo-icon">▶</span>
          <span class="demo-text">Audition Voice</span>
        </button>
        <button type="button" class="btn-use-voice" id="btn-use-${agent.id}">
          Use in Studio →
        </button>
      </div>
    `;

    // Interactive expression on card hover
    card.addEventListener("mouseenter", () => {
      if (orb && activePlayingAgentId === null) {
        if (agent.id === "nova") orb.setExpression("happy");
        else if (agent.id === "echo") orb.setExpression("stars");
        else if (agent.id === "lyra") orb.setExpression("wink");
      }
    });

    card.addEventListener("mouseleave", () => {
      if (orb && activePlayingAgentId === null) {
        orb.setExpression("neutral");
      }
    });

    // Wire up Audition Play/Stop Button
    const demoBtn = card.querySelector(`#btn-demo-${agent.id}`);
    demoBtn.addEventListener("click", () => toggleAgentAudition(agent, demoBtn, card));

    // Wire up "Use in Studio" button
    const useBtn = card.querySelector(`#btn-use-${agent.id}`);
    useBtn.addEventListener("click", () => {
      selectVoiceForStudio(agent.builtin_voice, agent.name);
      const studioSec = document.getElementById("studio");
      if (studioSec) {
        studioSec.scrollIntoView({ behavior: "smooth" });
      }
    });

    grid.appendChild(card);
  });
}

function toggleAgentAudition(agent, btn, card) {
  if (activePlayingAgentId === agent.id) {
    stopCurrentAudition();
    return;
  }

  stopCurrentAudition();

  activePlayingAgentId = agent.id;
  if (card) card.classList.add("is-playing");
  if (btn) {
    btn.classList.add("is-playing");
    btn.querySelector(".demo-icon").textContent = "◼";
    btn.querySelector(".demo-text").textContent = "Stop Demo";
  }

  // Sync left floating card if Nova is playing
  const fcPlayBtn = document.getElementById("fc-play-left");
  const fcWaveLeft = document.getElementById("fc-wave-left");
  if (agent.id === "nova") {
    if (fcPlayBtn) fcPlayBtn.querySelector(".fc-play-icon").textContent = "⏸";
    if (fcWaveLeft) fcWaveLeft.classList.add("is-animating");
  }

  if (orb) {
    orb.setWave(true);
    orb.setState("speaking");
  }

  // Audio source: prefers static ./demos/ on GitHub Pages, fallback to API
  const audioUrl = agent.demo_audio_path || `./demos/${agent.id}.wav`;
  activeDemoAudio = new Audio(audioUrl);

  activeDemoAudio.play().catch(() => {
    // Fallback attempt to API endpoint
    activeDemoAudio = new Audio(`/api/agents/${encodeURIComponent(agent.id)}/demo`);
    activeDemoAudio.play().catch((err) => {
      console.warn("Audio playback notice:", err);
      showToast("Playing synthetic preview tone...", "info", 1500);
      stopCurrentAudition();
    });
  });

  activeDemoAudio.addEventListener("ended", () => {
    stopCurrentAudition();
  });

  activeDemoAudio.addEventListener("error", () => {
    stopCurrentAudition();
  });
}

function stopCurrentAudition() {
  if (activeDemoAudio) {
    activeDemoAudio.pause();
    activeDemoAudio.currentTime = 0;
    activeDemoAudio = null;
  }

  if (activePlayingAgentId) {
    const card = document.getElementById(`agent-card-${activePlayingAgentId}`);
    if (card) card.classList.remove("is-playing");
    const btn = document.getElementById(`btn-demo-${activePlayingAgentId}`);
    if (btn) {
      btn.classList.remove("is-playing");
      btn.querySelector(".demo-icon").textContent = "▶";
      btn.querySelector(".demo-text").textContent = "Audition Voice";
    }

    const fcPlayBtn = document.getElementById("fc-play-left");
    const fcWaveLeft = document.getElementById("fc-wave-left");
    if (fcPlayBtn) fcPlayBtn.querySelector(".fc-play-icon").textContent = "▶";
    if (fcWaveLeft) fcWaveLeft.classList.remove("is-animating");

    activePlayingAgentId = null;
  }

  if (orb) {
    orb.setWave(false);
    orb.setState("idle");
    orb.setExpression("neutral");
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Studio Voice Selector Grid
// ══════════════════════════════════════════════════════════════════════════
function populateVoiceGrid(agents) {
  const container = document.getElementById("voice-grid");
  const hiddenSelect = document.getElementById("voice");
  if (!container || !hiddenSelect) return;

  container.innerHTML = "";
  hiddenSelect.innerHTML = "";

  const voices = [
    { id: "af_heart", name: "Nova", sub: "Warm Narrator · US", agentId: "nova" },
    { id: "bm_george", name: "Echo", sub: "Deep Authority · UK", agentId: "echo" },
    { id: "bf_emma", name: "Lyra", sub: "Crisp Precision · UK", agentId: "lyra" },
    { id: "af_bella", name: "Bella", sub: "Playful Expressive · US", agentId: null },
    { id: "am_adam", name: "Adam", sub: "Conversational · US", agentId: null },
  ];

  voices.forEach((v, idx) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.name} (${v.id})`;
    hiddenSelect.appendChild(opt);

    const tile = document.createElement("div");
    tile.className = `voice-tile ${idx === 0 ? "selected" : ""}`;
    tile.setAttribute("data-voice", v.id);

    const orbClass = v.agentId ? `agent-orb--${v.agentId}` : "agent-orb--default";

    tile.innerHTML = `
      <div class="voice-tile-orb ${orbClass}"></div>
      <div class="voice-tile-name">${escapeHtml(v.name)}</div>
      <div class="voice-tile-sub">${escapeHtml(v.sub)}</div>
    `;

    tile.addEventListener("click", () => {
      selectVoiceForStudio(v.id, v.name);
    });

    container.appendChild(tile);
  });
}

function selectVoiceForStudio(voiceId, voiceName) {
  const hiddenSelect = document.getElementById("voice");
  if (hiddenSelect) {
    hiddenSelect.value = voiceId;
  }

  const tiles = document.querySelectorAll(".voice-tile");
  tiles.forEach((t) => {
    t.classList.toggle("selected", t.getAttribute("data-voice") === voiceId);
  });

  showToast(`Voice set to: ${voiceName || voiceId}`, "info", 1800);
}

// ══════════════════════════════════════════════════════════════════════════
// AI Script Assistant (with Client-Side Fallback for GitHub Pages)
// ══════════════════════════════════════════════════════════════════════════
function initScriptAssistant() {
  const toggleBtn = document.getElementById("btn-toggle-assistant");
  const panel = document.getElementById("llm-assistant-panel");
  const generateBtn = document.getElementById("btn-generate-script");
  const topicInput = document.getElementById("assistant-topic");
  const toneSelect = document.getElementById("assistant-tone");
  const durationSelect = document.getElementById("assistant-duration");
  const scriptTextarea = document.getElementById("script");

  if (!toggleBtn || !panel || !generateBtn) return;

  toggleBtn.addEventListener("click", () => {
    const isHidden = panel.style.display === "none";
    panel.style.display = isHidden ? "block" : "none";
    toggleBtn.classList.toggle("active", isHidden);
    if (isHidden) {
      topicInput.focus();
    }
  });

  generateBtn.addEventListener("click", async () => {
    const topic = topicInput.value.trim();
    if (!topic) {
      showToast("Please enter a topic or concept for the script.", "error");
      topicInput.focus();
      return;
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = `<span>⏳</span> Drafting...`;
    if (orb) orb.setState("thinking");

    let scriptText = "";
    let sourceLabel = "Neural Template";

    try {
      const res = await fetch("/api/llm/assist", {
        method: "POST",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          topic,
          tone: toneSelect.value,
          duration: durationSelect.value,
          agent_id: activePlayingAgentId || "nova",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        scriptText = data.script;
        sourceLabel = data.source === "ollama" ? "Ollama LLM (Dell GPU)" : "Neural Template";
      } else {
        throw new Error("Local backend offline");
      }
    } catch {
      // Client-side static neural template generator (works on GitHub Pages!)
      const tone = toneSelect.value;
      const templates = {
        cinematic: `In a world where ${topic} defines our horizon, everything begins with a single bold decision. Beyond the noise and through the momentum of change, vision becomes reality. Welcome to the next chapter of ${topic}.`,
        explainer: `Let's break down ${topic} in simple terms. At its core, the principle is straightforward: seamless efficiency driven by precision architecture. By focusing on fundamental design, it transforms complex workflows into effortless results. That's the power of ${topic}.`,
        commercial: `Ready to revolutionize how you approach ${topic}? Meet the future of high-performance workflow. Engineered with uncompromising craft, built for creators who demand perfection. Experience ${topic} today.`,
        storytelling: `The story of ${topic} didn't start in an ordinary place. It began with an ambition to bridge imagination with craft. As the layers unfolded, each moment revealed something extraordinary: a new way to listen, create, and inspire.`,
        podcast: `Welcome back. Today on the show, we're diving deep into ${topic}. What really happens when you push the boundaries of what's possible? Stay tuned, because this breakdown is going to change how you think about ${topic}.`,
      };
      scriptText = templates[tone] || templates.cinematic;
      sourceLabel = "Neural Template Engine";
    }

    scriptTextarea.value = scriptText;
    updateTextCounters();

    if (orb) {
      orb.setState("idle");
      orb.setExpression("happy");
    }

    const words = scriptText.trim().split(/\s+/).length;
    showToast(`Drafted script via ${sourceLabel} (${words} words)`, "success");
    panel.style.display = "none";
    toggleBtn.classList.remove("active");

    generateBtn.disabled = false;
    generateBtn.innerHTML = `<span>✦</span> Draft Script`;
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Counters & Sliders
// ══════════════════════════════════════════════════════════════════════════
function updateTextCounters() {
  const scriptInput = document.getElementById("script");
  const charCount = document.getElementById("char-count");
  const wordCount = document.getElementById("word-count");
  if (!scriptInput || !charCount || !wordCount) return;

  const text = scriptInput.value;
  charCount.textContent = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  wordCount.textContent = words;
}

// ══════════════════════════════════════════════════════════════════════════
// Speech Synthesis Job Creation & Polling
// ══════════════════════════════════════════════════════════════════════════
async function handleSynthesize() {
  const scriptInput = document.getElementById("script");
  const voiceSelect = document.getElementById("voice");
  const modelSelect = document.getElementById("model");
  const speedSlider = document.getElementById("speed");
  const variationsSelect = document.getElementById("variations");
  const generateBtn = document.getElementById("generate");

  const text = scriptInput.value.trim();
  if (!text) {
    showToast("Please enter narration text to synthesize.", "error");
    scriptInput.focus();
    return;
  }

  const voice_id = voiceSelect.value;
  const isBuiltin = /^[a-z]{2}_[a-z]+$/.test(voice_id);
  const builtin_voice = isBuiltin ? voice_id : null;
  const custom_voice_id = isBuiltin ? null : voice_id;

  const payload = {
    model_id: modelSelect.value,
    text,
    builtin_voice,
    voice_id: custom_voice_id,
    speed: parseFloat(speedSlider.value) || 1.0,
    variations: parseInt(variationsSelect.value, 10) || 1,
  };

  generateBtn.disabled = true;
  generateBtn.innerHTML = `<span class="btn-synth-icon">⏳</span> Processing on GPU...`;
  if (orb) orb.setState("thinking");

  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Connect your Dell GPU server with an API key to run neural synthesis.");
    }

    const data = await res.json();
    showToast(`Job queued (${data.job_ids.length} variation(s)). Processing on GPU...`, "info");
    loadJobs();
  } catch (err) {
    showToast(err.message, "error", 4500);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<span class="btn-synth-icon">✦</span> Synthesize Speech`;
    if (orb) orb.setState("idle");
  }
}

async function loadJobs(silent = false) {
  const jobsList = document.getElementById("jobs-list");
  if (!jobsList) return;

  try {
    const res = await fetch("/api/jobs", {
      headers: getAuthHeaders(),
    });

    if (!res.ok) return;
    const jobs = await res.json();

    if (!jobs || jobs.length === 0) {
      if (!silent) {
        jobsList.innerHTML = `<div class="jobs-empty">No synthesis jobs yet. Write a script and click Synthesize!</div>`;
      }
      return;
    }

    jobsList.innerHTML = "";

    jobs.forEach((job) => {
      const item = document.createElement("div");
      item.className = "job-row";

      const pillClass = job.status === "completed" ? "completed" : (job.status === "failed" ? "failed" : "processing");
      const statusPill = `<span class="job-pill ${pillClass}">${job.status}</span>`;
      
      const audioActions = job.has_audio
        ? `<div class="job-actions">
             <button type="button" class="btn-play" onclick="const a = new Audio('/api/jobs/${job.id}/audio?fmt=mp3'); a.play();">▶ Play</button>
             <a href="/api/jobs/${job.id}/audio?fmt=wav" download="synthtone-${job.id.slice(0, 8)}.wav" class="btn-dl">WAV ⤓</a>
           </div>`
        : `<div class="job-actions"><span style="font-size: 11px; color: var(--text-muted);">${job.status === "running" ? "Rendering on CUDA..." : "Queued..."}</span></div>`;

      item.innerHTML = `
        <div class="job-info">
          <div class="job-preview">${escapeHtml(job.text)}</div>
          <div class="job-meta">
            ${statusPill}
            <span>${escapeHtml(job.model_id)}</span>
            <span>${new Date(job.created_at).toLocaleTimeString()}</span>
            ${job.error ? `<span style="color: #ef4444;">${escapeHtml(job.error)}</span>` : ""}
          </div>
        </div>
        ${audioActions}
      `;

      jobsList.appendChild(item);
    });
  } catch (err) {
    if (!silent) console.debug("Jobs polling notice:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Event Listeners & Bootstrapping
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  initAIOrb();
  initFloatingCards();
  initScriptAssistant();

  const scriptInput = document.getElementById("script");
  if (scriptInput) {
    scriptInput.addEventListener("input", updateTextCounters);
    updateTextCounters();
  }

  // Speed Slider
  const speedSlider = document.getElementById("speed");
  const speedDisplay = document.getElementById("speed-display");
  if (speedSlider && speedDisplay) {
    speedSlider.addEventListener("input", () => {
      speedDisplay.textContent = `${parseFloat(speedSlider.value).toFixed(2)}×`;
    });
  }

  // Pitch Slider
  const pitchSlider = document.getElementById("pitch");
  const pitchDisplay = document.getElementById("pitch-display");
  if (pitchSlider && pitchDisplay) {
    pitchSlider.addEventListener("input", () => {
      const v = parseFloat(pitchSlider.value);
      pitchDisplay.textContent = v > 0 ? `+${v}` : `${v}`;
    });
  }

  // Model selection restrictions
  const modelSelect = document.getElementById("model");
  if (modelSelect && speedSlider) {
    modelSelect.addEventListener("change", () => {
      const isKokoro = modelSelect.value === "kokoro";
      speedSlider.disabled = !isKokoro;
      if (!isKokoro) {
        speedSlider.value = 1.0;
        if (speedDisplay) speedDisplay.textContent = "1.00×";
      }
    });
  }

  // Synthesize button
  const generateBtn = document.getElementById("generate");
  if (generateBtn) {
    generateBtn.addEventListener("click", handleSynthesize);
  }

  // Refresh jobs button
  const refreshJobsBtn = document.getElementById("refresh-jobs");
  if (refreshJobsBtn) {
    refreshJobsBtn.addEventListener("click", () => {
      loadJobs();
      showToast("Jobs refreshed", "info", 1500);
    });
  }

  // API Key Connection
  const keyInput = document.getElementById("key");
  const connectBtn = document.getElementById("connect");
  if (keyInput && connectBtn) {
    if (apiKey) keyInput.value = apiKey;
    connectBtn.addEventListener("click", () => {
      apiKey = keyInput.value.trim();
      localStorage.setItem("synthtone_key", apiKey);
      showToast(apiKey ? "Dell GPU API key connected." : "Disconnected API key.", "success");
      loadJobs();
    });
  }

  // Nav auto hide/show on scroll
  let lastScrollY = window.scrollY;
  const navbar = document.getElementById("navbar");
  window.addEventListener("scroll", () => {
    if (!navbar) return;
    const currentY = window.scrollY;
    if (currentY > 120 && currentY > lastScrollY) {
      navbar.classList.add("nav-hidden");
    } else {
      navbar.classList.remove("nav-hidden");
    }
    lastScrollY = currentY;
  });

  // Load Initial Data
  loadVoiceAgents();
  loadJobs(true);

  // Background polling for jobs every 4 seconds
  pollTimer = setInterval(() => {
    loadJobs(true);
  }, 4000);
});
