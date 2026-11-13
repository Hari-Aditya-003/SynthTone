/**
 * SynthTone — Neural Voice Studio Client Application
 * Widescreen Studio UI · Reactive AI Character Orb · Real-time Voice Auditions
 *
 * @author Hari Aditya
 * @license MIT
 */

import { AICharacterOrb } from "/components/ai-orb/ai-orb.js";

// Global State
let apiKey = localStorage.getItem("synthtone_key") || "";
let orb = null;
let voiceAgents = [];
let availableVoices = [];
let activeDemoAudio = null;
let activePlayingAgentId = null;
let pollTimer = null;

const globalAudio = document.getElementById("global-player");

// Helper: Auth Headers
function getAuthHeaders(extra = {}) {
  const headers = { ...extra };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

// ══════════════════════════════════════════════════════════════════════════
// Toast Notification System (replaces all window.alert)
// ══════════════════════════════════════════════════════════════════════════
export function showToast(message, type = "info", durationMs = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;

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

  // Trigger animation frame
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

    // Parallax mouse tracking
    window.addEventListener("mousemove", (e) => {
      if (orb) {
        orb.trackMouse(e.pageX, e.pageY);
      }
    });
  } catch (err) {
    console.warn("AI Character Orb initialization error:", err);
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
    if (!res.ok) throw new Error("Failed to load voice agents");
    voiceAgents = await res.json();
    renderVoiceAgents(voiceAgents);
    populateVoiceGrid(voiceAgents);
  } catch (err) {
    console.error("Error loading voice agents:", err);
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">
        Unable to load voice characters. Is the SynthTone backend running?
      </div>
    `;
  }
}

function renderVoiceAgents(agents) {
  const grid = document.getElementById("agents-grid");
  if (!grid) return;

  grid.innerHTML = "";

  agents.forEach((agent) => {
    const card = document.createElement("div");
    card.className = "agent-card";
    card.id = `agent-card-${agent.id}`;

    // Map orb CSS gradient modifier
    const orbMod = ["nova", "echo", "lyra"].includes(agent.id) ? `agent-orb--${agent.id}` : "agent-orb--default";

    card.innerHTML = `
      <div class="agent-orb ${orbMod}"></div>
      <h3 class="agent-name">${escapeHtml(agent.name)}</h3>
      <span class="agent-tagline">${escapeHtml(agent.tagline || "Voice Agent")}</span>
      <p class="agent-desc">${escapeHtml(agent.description)}</p>
      <div class="agent-quote">"${escapeHtml(agent.personality || "Studio ready.")}"</div>
      <div class="agent-spec">
        <span>${escapeHtml(agent.model_id.toUpperCase())}</span> · 
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

    // Interactive expression on hover
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
  // If already playing this agent, stop it
  if (activePlayingAgentId === agent.id) {
    stopCurrentAudition();
    return;
  }

  // Stop any other active playback first
  stopCurrentAudition();

  activePlayingAgentId = agent.id;
  card.classList.add("is-playing");
  btn.classList.add("is-playing");
  btn.querySelector(".demo-icon").textContent = "◼";
  btn.querySelector(".demo-text").textContent = "Stop Demo";

  if (orb) {
    orb.setWave(true);
    orb.setState("speaking");
  }

  activeDemoAudio = new Audio(`/api/agents/${encodeURIComponent(agent.id)}/demo`);
  activeDemoAudio.play().catch((err) => {
    console.warn("Playback error:", err);
    showToast("Could not play demo audio.", "error");
    stopCurrentAudition();
  });

  activeDemoAudio.addEventListener("ended", () => {
    stopCurrentAudition();
  });

  activeDemoAudio.addEventListener("error", () => {
    showToast("Audio stream interrupted.", "error");
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
    if (card) {
      card.classList.remove("is-playing");
      const btn = card.querySelector(`#btn-demo-${activePlayingAgentId}`);
      if (btn) {
        btn.classList.remove("is-playing");
        btn.querySelector(".demo-icon").textContent = "▶";
        btn.querySelector(".demo-text").textContent = "Audition Voice";
      }
    }
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
    // Hidden option
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.name} (${v.id})`;
    hiddenSelect.appendChild(opt);

    // Clickable Tile
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

  showToast(`Voice set to: ${voiceName || voiceId}`, "info", 2000);
}

// ══════════════════════════════════════════════════════════════════════════
// AI Script Assistant (LLM Integration with Dell GPU Ollama / Neural Templates)
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

      if (!res.ok) {
        throw new Error("Script generation failed");
      }

      const data = await res.json();
      scriptTextarea.value = data.script;
      updateTextCounters();

      if (orb) {
        orb.setState("idle");
        orb.setExpression("happy");
      }

      showToast(`Drafted script via ${data.source === "ollama" ? "Ollama LLM" : "Neural Template"} (${data.word_count} words)`, "success");
      panel.style.display = "none";
      toggleBtn.classList.remove("active");
    } catch (err) {
      console.error(err);
      showToast("Could not generate script.", "error");
      if (orb) orb.setState("idle");
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = `<span>✦</span> Draft Script`;
    }
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
      throw new Error(err.detail || "Synthesis request failed");
    }

    const data = await res.json();
    showToast(`Job queued (${data.job_ids.length} variation(s)). Processing on GPU...`, "info");
    loadJobs();
  } catch (err) {
    console.error("Synthesis error:", err);
    showToast(err.message, "error");
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
    if (!silent) console.error("Error loading jobs:", err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Event Listeners & Bootstrapping
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  initAIOrb();
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
      showToast(apiKey ? "API key saved." : "Cleared API key.", "success");
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
  loadJobs();

  // Background polling for jobs every 3.5 seconds
  pollTimer = setInterval(() => {
    loadJobs(true);
  }, 3500);
});
