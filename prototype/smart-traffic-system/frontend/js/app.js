/**
 * app.js — Main orchestration for Junction Vision Smart Traffic System
 *
 * Manages:
 *  - Approach state (vehicle counts, scores, calibration)
 *  - Junction diagram updates
 *  - Signal plan computation & live ticker
 *  - Mumbai junction selector
 *  - Calibration panel
 *  - Backend status monitoring
 */

/* ── direction definitions ──────────────────────────────────────────────── */
const DIRECTIONS = [
  { code: "N", name: "North approach", opposite: "S" },
  { code: "E", name: "East approach",  opposite: "W" },
  { code: "S", name: "South approach", opposite: "N" },
  { code: "W", name: "West approach",  opposite: "E" },
];

/* ── global state ───────────────────────────────────────────────────────── */
const State = {};
DIRECTIONS.forEach(d => {
  State[d.code] = {
    vehicle_count:  0,
    weighted_score: 0,
    class_counts:   {},
    has_emergency:  false,
    processed:      false,
  };
});

let _signalResult   = null;
let _cycleStartTime = null;
let _phaseTickerId  = null;
let _autoDetect     = false;

/* ── DOM ready ──────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  buildUploadCards();
  buildMumbaiSelector();
  buildCalibrationPanel();
  initJunctionSVG();
  initialSignalPlan();
  setupEventListeners();
  checkBackendStatus();
  locateJunction();          // load default map location
  startPhaseTicker();
});

/* ════════════════════════════════════════════════════════════════════════
   JUNCTION SELECTOR
   ════════════════════════════════════════════════════════════════════════ */
function buildMumbaiSelector() {
  const sel = document.getElementById("junction-select");
  if (!sel) return;

  // Group by area
  const grouped = {};
  MUMBAI_JUNCTIONS.forEach(j => {
    if (!grouped[j.area]) grouped[j.area] = [];
    grouped[j.area].push(j);
  });

  JUNCTION_AREAS.forEach(area => {
    const og = document.createElement("optgroup");
    og.label = area;
    grouped[area].forEach(j => {
      const opt = document.createElement("option");
      opt.value = j.id;
      opt.textContent = `${j.name} (${j.ways}-way)`;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });

  sel.addEventListener("change", () => {
    const jxn = MUMBAI_JUNCTIONS.find(j => j.id === sel.value);
    if (!jxn) return;
    document.getElementById("lat-input").value = jxn.lat.toFixed(4);
    document.getElementById("lon-input").value = jxn.lon.toFixed(4);
    document.getElementById("junction-note").textContent = jxn.note || "";
    locateJunction();
  });
}

/* ════════════════════════════════════════════════════════════════════════
   UPLOAD CARDS
   ════════════════════════════════════════════════════════════════════════ */
function buildUploadCards() {
  const stack = document.getElementById("upload-stack");
  if (!stack) return;

  DIRECTIONS.forEach(dir => {
    const cal = Calibration.get(dir.code);
    const card = document.createElement("div");
    card.className = "upload-card";
    card.id = `card-${dir.code}`;
    card.innerHTML = `
      <div class="uc-head">
        <div class="uc-badge" id="badge-${dir.code}">${dir.code}</div>
        <div class="uc-title">${dir.name}</div>
        <div class="uc-sub mono" id="uc-sub-${dir.code}">image · video</div>
      </div>

      <label class="drop-zone" for="file-${dir.code}" id="dropzone-${dir.code}">
        <div class="dz-icon">⬆</div>
        <div>Click or drag — any image / video file</div>
        <input type="file" id="file-${dir.code}" accept="*/*">
      </label>

      <div class="uc-canvas-wrap" id="canvas-wrap-${dir.code}">
        <canvas id="canvas-${dir.code}"></canvas>
      </div>
      <div class="uc-status mono" id="status-${dir.code}"></div>

      <div class="uc-stats" id="stats-${dir.code}"></div>
    `;
    stack.appendChild(card);

    // File input listener
    const input = card.querySelector(`#file-${dir.code}`);
    input.addEventListener("change", e => {
      if (e.target.files?.[0]) handleFile(dir.code, e.target.files[0]);
    });

    // Drag-and-drop
    const dz = card.querySelector(`#dropzone-${dir.code}`);
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("dragging"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("dragging"));
    dz.addEventListener("drop", e => {
      e.preventDefault();
      dz.classList.remove("dragging");
      if (e.dataTransfer.files?.[0]) handleFile(dir.code, e.dataTransfer.files[0]);
    });
  });
}

function handleFile(code, file) {
  Detector.processFile(code, file);
}

/* ════════════════════════════════════════════════════════════════════════
   CALIBRATION PANEL
   ════════════════════════════════════════════════════════════════════════ */
function buildCalibrationPanel() {
  const container = document.getElementById("calibration-controls");
  if (!container) return;

  DIRECTIONS.forEach(dir => {
    const cal  = Calibration.get(dir.code);
    const row  = document.createElement("div");
    row.className = "cal-row";
    row.innerHTML = `
      <div class="cal-label">
        <span class="arm-badge">${dir.code}</span>
        <span class="cal-name">${dir.name.split(" ")[0]}</span>
      </div>
      <input type="range" id="cal-slider-${dir.code}" class="cal-slider"
             min="0.5" max="2.0" step="0.05" value="${cal}">
      <span class="cal-value mono" id="cal-val-${dir.code}">${cal.toFixed(2)}×</span>
      <select class="cal-preset" id="cal-preset-${dir.code}">
        ${Object.entries(Calibration.PRESETS).map(([k, v]) =>
          `<option value="${k}">${v.label}</option>`).join("")}
      </select>
    `;
    container.appendChild(row);

    const slider  = row.querySelector(`#cal-slider-${dir.code}`);
    const valEl   = row.querySelector(`#cal-val-${dir.code}`);
    const presetEl= row.querySelector(`#cal-preset-${dir.code}`);

    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      valEl.textContent = v.toFixed(2) + "×";
      Calibration.set(dir.code, v, presetEl.value);
      recomputeSignalPlan();
    });

    presetEl.addEventListener("change", () => {
      const preset = Calibration.PRESETS[presetEl.value];
      if (preset) {
        slider.value = preset.value;
        valEl.textContent = preset.value.toFixed(2) + "×";
        Calibration.set(dir.code, preset.value, presetEl.value);
        recomputeSignalPlan();
      }
    });
  });

  // Reset button
  const resetBtn = document.getElementById("cal-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      Calibration.resetAll();
      DIRECTIONS.forEach(dir => {
        const slider = document.getElementById(`cal-slider-${dir.code}`);
        const valEl  = document.getElementById(`cal-val-${dir.code}`);
        const preset = document.getElementById(`cal-preset-${dir.code}`);
        if (slider) slider.value = 1.0;
        if (valEl)  valEl.textContent = "1.00×";
        if (preset) preset.value = "default";
      });
      recomputeSignalPlan();
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════
   JUNCTION SVG
   ════════════════════════════════════════════════════════════════════════ */
function initJunctionSVG() {
  const container = document.getElementById("junction-svg-container");
  if (container) JunctionRenderer.render(container);
}

/* ════════════════════════════════════════════════════════════════════════
   SIGNAL PLAN
   ════════════════════════════════════════════════════════════════════════ */
function initialSignalPlan() {
  recomputeSignalPlan();
}

function recomputeSignalPlan() {
  const approaches = DIRECTIONS.map(d => ({
    ...d,
    ...State[d.code],
    zone_calibration: Calibration.get(d.code),
  }));

  _signalResult   = SignalEngine.compute(approaches);
  _cycleStartTime = Date.now();

  renderSignalBars(_signalResult);
  updateAggregates();
  DIRECTIONS.forEach(d => {
    const s = State[d.code];
    const level = SignalEngine.congestionLevel(s.weighted_score, s.vehicle_count);
    JunctionRenderer.updateArm(d.code, { ...s, level });
  });

  // Emergency banner
  const emergBanner = document.getElementById("emergency-banner");
  if (emergBanner) {
    emergBanner.style.display = _signalResult.emergency_preempt ? "flex" : "none";
    if (_signalResult.emergency_preempt) {
      emergBanner.querySelector(".emerg-arm").textContent = _signalResult.emergency_arm;
    }
  }
}

function renderSignalBars(result) {
  const planEl = document.getElementById("signal-plan");
  if (!planEl) return;
  planEl.innerHTML = "";

  const order = result.phase_order || DIRECTIONS.map(d => d.code);

  order.forEach((code, idx) => {
    const phase = result.phases.find(p => p.code === code);
    if (!phase) return;

    const color =
      phase.is_emergency                 ? "#FF3B3B" :
      phase.level === "high"             ? "#F87171" :
      phase.level === "med"              ? "#FBBF24" : "#34D399";

    const pct = result.total_cycle > 0
      ? Math.min(100, (phase.green / result.total_cycle) * 100)
      : 0;

    const row = document.createElement("div");
    row.className = "sig-row";
    row.id = `sig-row-${code}`;
    row.innerHTML = `
      <div class="sig-phase-num mono">${idx + 1}</div>
      <div class="sig-label">${code}</div>
      <div class="sig-track">
        <div class="sig-fill" id="sig-fill-${code}"
             style="width:${pct}%; background:${color};"></div>
      </div>
      <div class="sig-secs mono" id="sig-secs-${code}">${phase.green}s</div>
      <div class="sig-score mono dim" id="sig-score-${code}">w:${phase.demand.toFixed(1)}</div>
    `;
    planEl.appendChild(row);
  });
}

/* ════════════════════════════════════════════════════════════════════════
   LIVE PHASE TICKER
   ════════════════════════════════════════════════════════════════════════ */
function startPhaseTicker() {
  if (_phaseTickerId) clearInterval(_phaseTickerId);
  _phaseTickerId = setInterval(tickPhase, 500);
}

function tickPhase() {
  if (!_signalResult || !_cycleStartTime) return;
  const elapsed = Date.now() - _cycleStartTime;
  const current = SignalEngine.getCurrentPhase(_signalResult, elapsed);
  if (!current) return;

  // Update signal lights
  DIRECTIONS.forEach(d => {
    JunctionRenderer.setSignalState(d.code,
      current.code === d.code ? current.state : "red");
  });

  // Highlight active row in signal plan
  DIRECTIONS.forEach(d => {
    const row = document.getElementById(`sig-row-${d.code}`);
    if (row) row.classList.toggle("active-phase", d.code === current.code);
  });

  // Update active phase timer
  const activeTimer = document.getElementById("active-phase-timer");
  if (activeTimer) {
    activeTimer.textContent =
      `${current.state === "green" ? "🟢" : "🔴"} ${current.code} — ${current.remaining}s`;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   AGGREGATES
   ════════════════════════════════════════════════════════════════════════ */
function updateAggregates() {
  let total = 0, totalScore = 0, busiest = null, busiestScore = -1, hasEmergency = false;
  DIRECTIONS.forEach(d => {
    const s = State[d.code];
    total      += s.vehicle_count;
    totalScore += s.weighted_score;
    if (s.weighted_score > busiestScore) { busiestScore = s.weighted_score; busiest = d; }
    if (s.has_emergency) hasEmergency = true;
  });

  setText("agg-total",   total);
  setText("agg-score",   totalScore.toFixed(1));
  setText("agg-busiest", busiest && busiestScore > 0 ? `${busiest.name} (${busiest.code})` : "—");
  setText("agg-peds",    "—");   // YOLO model doesn't detect pedestrians separately

  const statusDot = document.getElementById("status-dot");
  if (statusDot) {
    statusDot.className = "status-dot " + (hasEmergency ? "critical" : total > 40 ? "high" : total > 15 ? "med" : "go");
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ════════════════════════════════════════════════════════════════════════
   DETECTOR CALLBACKS
   ════════════════════════════════════════════════════════════════════════ */
Detector.onResult((code, result) => {
  // Update state
  State[code] = {
    vehicle_count:  result.vehicle_count,
    weighted_score: result.weighted_score,
    class_counts:   result.class_counts,
    has_emergency:  result.has_emergency,
    processed:      true,
  };

  // Update chip row in upload card
  updateCardChips(code, result);

  // Log entry
  Log.addRow({
    code,
    filename:      result.filename,
    source_type:   result.source_type,
    vehicle_count: result.vehicle_count,
    weighted_score:result.weighted_score,
    class_counts:  result.class_counts,
    has_emergency: result.has_emergency,
  });

  // Recompute signal plan & update diagram
  recomputeSignalPlan();
});

Detector.onProgress((code, msg) => {
  const el = document.getElementById(`status-${code}`);
  if (el) el.textContent = msg;
});

function updateCardChips(code, result) {
  const statsEl = document.getElementById(`stats-${code}`);
  if (!statsEl) return;
  statsEl.innerHTML = "";

  const level = SignalEngine.congestionLevel(result.weighted_score, result.vehicle_count);
  const chips = [
    { text: `${result.vehicle_count} vehicles`, cls: "strong" },
    { text: `score ${result.weighted_score.toFixed(1)}`, cls: "mono" },
    { text: level === "low" ? "Low load" : level === "med" ? "Medium load" : "High load",
      cls: `strong ${level === "high" ? "chip-high" : level === "med" ? "chip-med" : "chip-low"}` },
  ];
  if (result.has_emergency) chips.push({ text: "🚨 EMERGENCY", cls: "chip-emergency" });

  Object.entries(result.class_counts || {}).forEach(([cls, n]) => {
    chips.push({ text: `${cls} ×${n}`, cls: "dim" });
  });

  chips.forEach(({ text, cls }) => {
    const c = document.createElement("span");
    c.className = `chip ${cls}`;
    c.textContent = text;
    statsEl.appendChild(c);
  });
}

/* ════════════════════════════════════════════════════════════════════════
   TOMTOM / LOCATE
   ════════════════════════════════════════════════════════════════════════ */
function locateJunction() {
  const lat = parseFloat(document.getElementById("lat-input")?.value || 19.0760);
  const lon = parseFloat(document.getElementById("lon-input")?.value || 72.8777);
  if (isNaN(lat) || isNaN(lon)) return;
  TomTomModule.initMap(lat, lon);
  TomTomModule.fetchFlow(lat, lon);
}

/* ════════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ════════════════════════════════════════════════════════════════════════ */
function setupEventListeners() {
  document.getElementById("locate-btn")?.addEventListener("click", locateJunction);

  // Auto-detect toggle
  document.getElementById("auto-detect-toggle")?.addEventListener("change", e => {
    _autoDetect = e.target.checked;
    document.getElementById("auto-detect-status").textContent =
      _autoDetect ? "Auto-detect ON (reads from Mumbai DB)" : "Manual coordinates";
  });

  // Cycle length slider
  const cycleSlider = document.getElementById("cycle-length-slider");
  const cycleVal    = document.getElementById("cycle-length-val");
  if (cycleSlider) {
    cycleSlider.addEventListener("input", () => {
      const v = parseInt(cycleSlider.value);
      cycleVal.textContent = `${v}s`;
      SignalEngine.configure({ CYCLE_LENGTH: v });
      recomputeSignalPlan();
    });
  }

  // Min green slider
  const minSlider = document.getElementById("min-green-slider");
  const minVal    = document.getElementById("min-green-val");
  if (minSlider) {
    minSlider.addEventListener("input", () => {
      const v = parseInt(minSlider.value);
      minVal.textContent = `${v}s`;
      SignalEngine.configure({ MIN_GREEN: v });
      recomputeSignalPlan();
    });
  }

  // Clear log
  document.getElementById("clear-log-btn")?.addEventListener("click", () => Log.clear());
}

/* ════════════════════════════════════════════════════════════════════════
   BACKEND STATUS CHECK
   ════════════════════════════════════════════════════════════════════════ */
async function checkBackendStatus() {
  const indicator = document.getElementById("backend-indicator");
  const label     = document.getElementById("backend-label");

  const ok = await Detector.checkBackend();
  if (indicator) indicator.className = `status-pill ${ok ? "pill-ok" : "pill-err"}`;
  if (label)     label.textContent   = ok ? "Backend online" : "Backend offline";
}
