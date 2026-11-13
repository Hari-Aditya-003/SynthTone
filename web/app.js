/**
 * SynthTone Studio Client Application
 * Integrates the AI Character Orb with the Dell GPU Speech Server.
 *
 * @author Hari Aditya
 * @license MIT
 */

import { AICharacterOrb } from "/components/ai-orb/ai-orb.js";

// State
let apiKey = localStorage.getItem("synthtone_key") || "";
let orb = null;
let currentVoices = [];
let pollInterval = null;

const globalAudio = document.getElementById("global-synthtone-player");

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  initAIOrb();
  bindUIEvents();
  if (apiKey) {
    document.getElementById("key").value = apiKey;
  }
  loadTelemetry();
  loadVoices();
  loadJobs();

  // Poll for job updates and telemetry every 4 seconds
  pollInterval = setInterval(() => {
    loadJobs(true);
    loadTelemetry();
  }, 4000);
});

// Initialize Interactive AI Character Orb
function initAIOrb() {
  try {
    orb = new AICharacterOrb("#hero-ai-orb-container", {
      size: 260,
      mode: "eyes",
      bubbleText: "Um...how is the weather",
      showBubble: true,
    });

    if (globalAudio) {
      orb.attachAudio(globalAudio);
    }
  } catch (err) {
    console.error("Could not initialize AI Character Orb:", err);
  }
}

// Bind DOM Events
function bindUIEvents() {
  const keyInput = document.getElementById("key");
  const connectBtn = document.getElementById("connect");
  const scriptInput = document.getElementById("script");
  const charCount = document.getElementById("char-count");
  const speedSlider = document.getElementById("speed");
  const speedDisplay = document.getElementById("speed-display");
  const speedVal = document.getElementById("speed-val");
  const modelSelect = document.getElementById("model");
  const generateBtn = document.getElementById("generate");
  const voiceForm = document.getElementById("voice-form");
  const voiceFileInput = document.getElementById("voice-file");
  const fileChosenName = document.getElementById("file-chosen-name");
  const refreshJobsBtn = document.getElementById("refresh-jobs");
  const heroMicBtn = document.getElementById("hero-mic-test");
  const sampleCardPlay = document.getElementById("sample-card-play");

  // Server Key Connect
  connectBtn.addEventListener("click", () => {
    apiKey = keyInput.value.trim();
    localStorage.setItem("synthtone_key", apiKey);
    loadTelemetry();
    loadVoices();
    loadJobs();
    if (orb) orb.setBubble("Connected to SynthTone server", 2500);
  });

  // Character Counter
  const updateCount = () => {
    charCount.textContent = scriptInput.value.length;
  };
  scriptInput.addEventListener("input", updateCount);
  updateCount();

  // Speed Slider
  speedSlider.addEventListener("input", () => {
    const val = parseFloat(speedSlider.value).toFixed(2);
    speedDisplay.textContent = `${val}×`;
    speedVal.textContent = `${val}×`;
  });

  // Model selection hints
  modelSelect.addEventListener("change", () => {
    const model = modelSelect.value;
    if (model === "kokoro") {
      speedSlider.disabled = false;
      if (orb) orb.setBubble("Kokoro: ultra-fast on CPU/GPU", 3000);
    } else {
      speedSlider.value = 1.0;
      speedDisplay.textContent = "1.00×";
      speedVal.textContent = "1.00×";
      speedSlider.disabled = true;
      if (orb) orb.setBubble("Chatterbox: zero-shot voice cloner active", 3000);
    }
  });

  // Voice File selection display
  voiceFileInput.addEventListener("change", () => {
    if (voiceFileInput.files.length > 0) {
      fileChosenName.textContent = `Selected: ${voiceFileInput.files[0].name}`;
      fileChosenName.style.display = "block";
    }
  });

  // Voice Profile Enrollment Form
  voiceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("voice-name").value.trim();
    const consent = document.getElementById("consent").checked;
    const file = voiceFileInput.files[0];

    if (!file) {
      alert("Please choose an audio reference file.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("consent", consent);
    formData.append("file", file);

    try {
      if (orb) orb.setBubble("Enrolling reference voice profile...", 0);
      const res = await fetch("/api/voices", {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }

      voiceForm.reset();
      fileChosenName.style.display = "none";
      await loadVoices();
      if (orb) orb.setBubble(`Voice "${name}" enrolled!`, 3000);
    } catch (err) {
      alert(`Voice Enrollment Error: ${err.message}`);
      if (orb) orb.setBubble("Enrollment error", 2500);
    }
  });

  // Generate Speech Button
  generateBtn.addEventListener("click", async () => {
    const text = scriptInput.value.trim();
    if (!text) {
      alert("Please enter script text to synthesize.");
      return;
    }

    const model_id = modelSelect.value;
    const voice_id = document.getElementById("voice").value;
    const builtin_voice = voice_id.startsWith("af_") || voice_id.startsWith("am_") || voice_id.startsWith("bf_") || voice_id.startsWith("bm_") ? voice_id : "af_heart";
    const custom_voice_id = !builtin_voice.includes(voice_id) ? voice_id : null;
    const speed = parseFloat(speedSlider.value);
    const variations = parseInt(document.getElementById("variations").value, 10);

    generateBtn.disabled = true;
    generateBtn.innerHTML = `<span>⏳</span> Synthesizing on Dell GPU...`;

    if (orb) {
      orb.setMode("speaking");
      orb.lookStraight(true);
      orb.setBubble("Synthesizing audio on Dell GPU...", 0);
    }

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          text,
          model_id,
          voice_id: custom_voice_id,
          builtin_voice,
          speed,
          variations,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Job creation failed");
      }

      const data = await res.json();
      await loadJobs();

      // Poll specific job until complete
      if (data.job_ids && data.job_ids.length > 0) {
        await pollJobCompletion(data.job_ids[0]);
      }
    } catch (err) {
      alert(`Synthesis Request Failed: ${err.message}`);
      if (orb) {
        orb.setMode("eyes");
        orb.lookStraight(false);
        orb.setBubble("Generation failed", 3000);
      }
    } finally {
      generateBtn.disabled = false;
      generateBtn.innerHTML = `<span>✦</span> Synthesize Speech`;
    }
  });

  // Refresh Jobs
  refreshJobsBtn.addEventListener("click", () => loadJobs());

  // Test Mic Button
  heroMicBtn.addEventListener("click", async () => {
    if (orb) {
      await orb.listenMic();
    }
  });

  // Left card sample audio play simulation
  sampleCardPlay.addEventListener("click", () => {
    const isPlaying = sampleCardPlay.textContent === "❚❚";
    if (isPlaying) {
      sampleCardPlay.textContent = "▶";
      if (globalAudio) globalAudio.pause();
    } else {
      sampleCardPlay.textContent = "❚❚";
      // Generate a pleasant synth sweep if no audio loaded
      playSyntheticTone();
    }
  });
}

function getAuthHeaders() {
  return apiKey ? { "X-API-Key": apiKey } : {};
}

// Telemetry & Hardware Status
async function loadTelemetry() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return;
    const data = await res.json();

    const gpu = data.gpu || {};
    const badgeText = document.getElementById("gpu-badge-text");
    const cudaEl = document.getElementById("telemetry-cuda");
    const nameEl = document.getElementById("telemetry-name");
    const vramEl = document.getElementById("telemetry-vram");
    const engineEl = document.getElementById("telemetry-engine");

    if (gpu.cuda_available) {
      badgeText.textContent = `Dell GPU Online (${gpu.device_name.split(" ")[0]})`;
      cudaEl.textContent = "CUDA Active (NVIDIA)";
      cudaEl.style.color = "#00f0ff";
      nameEl.textContent = gpu.device_name;
      vramEl.textContent = `${gpu.allocated_vram_gb || 0} / ${gpu.total_vram_gb || 4} GB`;
    } else {
      badgeText.textContent = "Dell CPU Mode";
      cudaEl.textContent = "CPU Fallback";
      cudaEl.style.color = "#94a3b8";
      nameEl.textContent = gpu.device_name || "Host CPU";
      vramEl.textContent = "System RAM";
    }

    engineEl.textContent = gpu.active_engine || "Idle";
  } catch (err) {
    console.debug("Telemetry fetch error:", err);
  }
}

// Load Voices
async function loadVoices() {
  try {
    const res = await fetch("/api/voices", { headers: getAuthHeaders() });
    if (!res.ok) return;
    currentVoices = await res.json();

    const voiceSelect = document.getElementById("voice");
    const voicesList = document.getElementById("voices-list");

    // Clear custom voices from select
    const defaultVoices = [
      { id: "af_heart", name: "Heart · English / Feminine (Warm)" },
      { id: "af_bella", name: "Bella · English / Feminine (Narrator)" },
      { id: "am_adam", name: "Adam · English / Masculine (Studio)" },
      { id: "bf_emma", name: "Emma · British / Feminine (Crisp)" },
      { id: "bm_george", name: "George · British / Masculine (Deep)" },
    ];

    voiceSelect.innerHTML = "";
    defaultVoices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.name;
      voiceSelect.appendChild(opt);
    });

    if (currentVoices.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "── My Cloned Voices ──";
      currentVoices.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.id;
        opt.textContent = `Clone: ${v.name}`;
        group.appendChild(opt);
      });
      voiceSelect.appendChild(group);

      // Render enrolled list
      voicesList.innerHTML = "";
      currentVoices.forEach((v) => {
        const item = document.createElement("div");
        item.className = "voice-item";
        item.innerHTML = `
          <div><strong>${v.name}</strong> <small style="color:var(--text-dim);">(${new Date(v.created_at).toLocaleDateString()})</small></div>
          <button class="voice-del-btn" data-id="${v.id}" title="Delete Voice">✕</button>
        `;
        item.querySelector(".voice-del-btn").addEventListener("click", () => deleteVoice(v.id));
        voicesList.appendChild(item);
      });
    } else {
      voicesList.innerHTML = `<div style="color:var(--text-dim);font-size:12.5px;padding:8px 0;">No cloned voices loaded yet.</div>`;
    }
  } catch (err) {
    console.debug("Voices fetch error:", err);
  }
}

async function deleteVoice(id) {
  if (!confirm("Are you sure you want to delete this voice profile?")) return;
  try {
    const res = await fetch(`/api/voices/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      loadVoices();
    }
  } catch (err) {
    alert("Error deleting voice: " + err.message);
  }
}

// Load Generation Jobs
async function loadJobs(silent = false) {
  try {
    const res = await fetch("/api/jobs", { headers: getAuthHeaders() });
    if (!res.ok) return;
    const jobs = await res.json();

    const jobsContainer = document.getElementById("jobs-list");
    if (!jobs || jobs.length === 0) {
      if (!silent) {
        jobsContainer.innerHTML = `
          <div style="color:var(--text-dim);text-align:center;padding:36px;font-size:14px;">
            Generated takes and synthesized audio clips will appear here.
          </div>
        `;
      }
      return;
    }

    jobsContainer.innerHTML = "";
    jobs.forEach((job) => {
      const row = document.createElement("div");
      row.className = "job-row";

      const statusClass = job.status.toLowerCase();
      const hasAudio = job.has_audio;

      row.innerHTML = `
        <div class="job-info">
          <div class="job-text-preview">"${escapeHTML(job.text)}"</div>
          <div class="job-meta-row">
            <span class="job-status-pill ${statusClass}">${job.status}</span>
            <span>Model: ${job.model_id}</span>
            <span>${new Date(job.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
        <div class="job-actions">
          ${
            hasAudio
              ? `
            <button class="btn-icon btn-play-job" data-id="${job.id}">
              ▶ Play Take
            </button>
            <a href="/api/jobs/${job.id}/audio?fmt=wav" download="synthtone-${job.id.substring(0, 8)}.wav" class="btn-icon">
              ↓ WAV
            </a>
            <a href="/api/jobs/${job.id}/audio?fmt=mp3" download="synthtone-${job.id.substring(0, 8)}.mp3" class="btn-icon">
              ↓ MP3
            </a>
          `
              : `<span style="font-size:12px;color:var(--text-dim);">${job.status === "failed" ? job.error || "Failed" : "Processing..."}</span>`
          }
        </div>
      `;

      const playBtn = row.querySelector(".btn-play-job");
      if (playBtn) {
        playBtn.addEventListener("click", () => playJobAudio(job.id, playBtn));
      }

      jobsContainer.appendChild(row);
    });
  } catch (err) {
    console.debug("Jobs fetch error:", err);
  }
}

// Play Audio for a Completed Job
function playJobAudio(jobId, buttonEl) {
  if (!globalAudio) return;

  const audioUrl = `/api/jobs/${jobId}/audio?fmt=mp3`;
  globalAudio.src = audioUrl;
  globalAudio.play();

  if (orb) {
    orb.setMode("speaking");
    orb.lookStraight(true);
    orb.setBubble("Playing synthesized voice...", 0);
  }

  buttonEl.textContent = "❚❚ Playing";
  globalAudio.onended = () => {
    buttonEl.textContent = "▶ Play Take";
    if (orb) {
      orb.setMode("eyes");
      orb.lookStraight(false);
      orb.setBubble("Ready for next script", 2500);
    }
  };
}

// Poll specific job until complete
async function pollJobCompletion(jobId) {
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { headers: getAuthHeaders() });
      if (!res.ok) continue;
      const job = await res.json();
      if (job.status === "completed") {
        await loadJobs();
        if (orb) {
          orb.setBubble("Speech synthesized! Playing audio...", 3000);
        }
        playJobAudio(jobId, { textContent: "" });
        break;
      } else if (job.status === "failed") {
        if (orb) {
          orb.setMode("eyes");
          orb.lookStraight(false);
          orb.setBubble("Generation error", 3000);
        }
        break;
      }
    } catch (e) {
      console.debug("Poll error:", e);
    }
  }
}

// Synthetic Audio for demo card
function playSyntheticTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.2);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 1.5);

    if (orb) {
      orb.setMode("wave");
      orb.setBubble("Previewing AI Voice Sample", 2000);
      setTimeout(() => {
        orb.setMode("eyes");
        document.getElementById("sample-card-play").textContent = "▶";
      }, 1600);
    }
  } catch (e) {
    console.debug("Synthetic tone fallback error:", e);
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, (tag) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[tag] || tag));
}
