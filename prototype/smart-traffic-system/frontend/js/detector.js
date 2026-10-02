/**
 * detector.js
 * Handles file upload → backend YOLO detection → result delivery.
 * Backend: Flask server at localhost:5050
 */

const Detector = (() => {
  const BACKEND_URL = "http://localhost:5050";
  let _backendAvailable = null;  // null=unknown, true, false
  let _onResult = null;           // callback(code, result)
  let _onProgress = null;         // callback(code, message)

  const CLASS_WEIGHTS = {
    car:               1.0,
    biker:             0.4,
    auto:              0.8,
    truck:             3.0,
    heavy_vehicle:     3.5,
    emergency_vehicle: 5.0,
  };

  function onResult(cb)   { _onResult   = cb; }
  function onProgress(cb) { _onProgress = cb; }

  function progress(code, msg) {
    if (_onProgress) _onProgress(code, msg);
  }

  async function checkBackend() {
    if (_backendAvailable !== null) return _backendAvailable;
    try {
      const res = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
      _backendAvailable = res.ok;
    } catch(e) { _backendAvailable = false; }
    return _backendAvailable;
  }

  /**
   * Main entry: handle a file (image or video) for a given approach code.
   */
  async function processFile(code, file) {
    const available = await checkBackend();
    if (!available) {
      progress(code, `⚠ Backend offline — start start.sh first`);
      showBackendOfflineWarning();
      return;
    }

    const mime = (file.type || "").split("/")[0]; // "image" | "video" | ""
    progress(code, "Uploading to detection backend…");

    if (mime === "image") {
      await detectImage(code, file);
    } else if (mime === "video") {
      await detectVideo(code, file);
    } else {
      // Unknown mime — try image first
      const testUrl = URL.createObjectURL(file);
      const img = new Image();
      const isImg = await new Promise(res => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = testUrl;
      });
      URL.revokeObjectURL(testUrl);
      isImg ? await detectImage(code, file) : await detectVideo(code, file);
    }
  }

  async function detectImage(code, file) {
    const fd = new FormData();
    fd.append("file", file);

    progress(code, "Running YOLO detection on image…");
    try {
      const res = await fetch(`${BACKEND_URL}/api/detect/image`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        progress(code, `Detection failed: ${err.error || res.status}`);
        return;
      }
      const data = await res.json();
      deliverResult(code, file.name, "image", data);
    } catch(e) {
      progress(code, `Error: ${e.message}`);
    }
  }

  async function detectVideo(code, file) {
    const fd = new FormData();
    fd.append("file", file);

    progress(code, "Uploading video…");
    try {
      const res = await fetch(`${BACKEND_URL}/api/detect/video?frames=10`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        progress(code, `Detection failed: ${err.error || res.status}`);
        return;
      }
      const data = await res.json();
      // Use the peak frame as primary result
      const peak = data.peak || {};
      deliverResult(code, file.name, "video", peak, data);
    } catch(e) {
      progress(code, `Error: ${e.message}`);
    }
  }

  function deliverResult(code, filename, type, raw, videoData = null) {
    // Normalize result structure
    const result = {
      code,
      filename,
      source_type:     type,
      vehicle_count:   raw.vehicle_count   ?? 0,
      weighted_score:  raw.weighted_score  ?? 0,
      class_counts:    raw.class_counts    ?? {},
      detections:      raw.detections      ?? [],
      has_emergency:   raw.has_emergency   ?? false,
      annotated_image: raw.annotated_image ?? null,  // base64 JPEG
      video_data:      videoData,
    };

    // Display annotated image on canvas
    if (result.annotated_image) {
      displayAnnotatedImage(code, result.annotated_image);
    }

    const count = result.vehicle_count;
    const msg = type === "video"
      ? `Done — peak: ${count} vehicles, score: ${result.weighted_score.toFixed(1)}`
      : `Done — ${count} vehicles detected, score: ${result.weighted_score.toFixed(1)}`;
    progress(code, msg);

    if (_onResult) _onResult(code, result);
  }

  function displayAnnotatedImage(code, base64Jpeg) {
    const wrap = document.getElementById(`canvas-wrap-${code}`);
    const canvas = document.getElementById(`canvas-${code}`);
    if (!wrap || !canvas) return;
    wrap.style.display = "block";

    const img = new Image();
    img.onload = () => {
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  }

  function showBackendOfflineWarning() {
    const existing = document.getElementById("backend-warning");
    if (existing) return;
    const banner = document.createElement("div");
    banner.id = "backend-warning";
    banner.className = "backend-offline-banner";
    banner.innerHTML = `
      <div class="boff-icon">⚡</div>
      <div>
        <strong>Detection backend not running</strong><br>
        Open a terminal and run: <code>cd smart-traffic-system/backend && bash start.sh</code>
      </div>
      <button onclick="this.parentElement.remove()" class="boff-close">✕</button>
    `;
    document.body.prepend(banner);
  }

  return { processFile, onResult, onProgress, checkBackend, CLASS_WEIGHTS };
})();
