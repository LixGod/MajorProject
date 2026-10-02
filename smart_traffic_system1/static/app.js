// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────
let isCalibrating = false;
let calibrationData = { "Z1": [], "Z2": [], "Z3": [], "Z4": [] };
let zoneNames = ["Z1", "Z2", "Z3", "Z4"];
let currentZoneIdx = 0;

// Junction state
let selectedJunctionKey = "weh_vile_parle";
let junctionsData = {};

// Timer countdown state (client-side interpolation)
let clientTimer = null;        // current countdown value (seconds)
let timerMax = null;           // the full predicted green time for progress bar
let lastPollTimer = null;      // last server-reported timer
let timerIntervalId = null;    // setInterval handle


// ─────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────
function goBackToUpload() {
    fetch('/stop_feed', { method: 'POST' });
    document.getElementById('analysis-view').classList.remove('active');
    document.getElementById('upload-view').classList.add('active');
    document.getElementById('main-feed').src = '';
    document.getElementById('video-upload').value = '';
    // Stop client-side timer countdown
    if (timerIntervalId) clearInterval(timerIntervalId);
    clientTimer = null;
    timerMax = null;
    // Stop image polling and reset overlay for next upload
    stopImageRefresh();
    currentFileIsImage = false;
    // Reset the loading overlay (hidden by default until next upload)
    const overlay = document.getElementById('feed-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const sub = document.getElementById('feed-loading-sub');
    if (sub) sub.textContent = 'Loading models & running detection';
}

function resetAllZones() {
    if (!confirm('Delete all saved zone calibrations and reload the AI?')) return;
    fetch('/reset_zones', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                alert('Zones reset to default grid.');
                exitCalibration();
            }
        });
}


// ─────────────────────────────────────────────────────────────
// MUMBAI MAP (Leaflet)
// ─────────────────────────────────────────────────────────────
let mumMap = null;
let junctionMarkers = {};

function initMap() {
    mumMap = L.map('mumbai-map', {
        center: [19.076, 72.877],
        zoom: 12,
        zoomControl: true,
    });

    // Dark tile layer (CartoDB Dark Matter — no API key needed)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(mumMap);

    // Custom icon factory
    function makeIcon(active) {
        return L.divIcon({
            className: '',
            html: `<div style="
                width:14px; height:14px; border-radius:50%;
                background:${active ? '#00d9a3' : '#8b949e'};
                border:3px solid ${active ? '#fff' : '#444'};
                box-shadow:${active ? '0 0 10px #00d9a3' : 'none'};
                transition:all 0.2s;
            "></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
        });
    }

    // Load junctions from backend
    fetch('/junctions')
        .then(r => r.json())
        .then(data => {
            junctionsData = data;
            Object.entries(data).forEach(([key, j]) => {
                if (key === 'custom') return; // skip generic custom

                const marker = L.marker([j.lat, j.lon], {
                    icon: makeIcon(key === selectedJunctionKey),
                    title: j.name
                }).addTo(mumMap);

                marker.bindPopup(`
                    <div style="font-family:Inter,sans-serif;">
                        <strong style="font-size:0.95rem;">${j.name}</strong><br>
                        <span style="color:#8b949e;font-size:0.8rem;">${j.area}</span><br>
                        <span style="color:#8b949e;font-size:0.75rem;">${j.lat.toFixed(4)}, ${j.lon.toFixed(4)}</span>
                    </div>
                `);

                marker.on('click', () => selectJunction(key, marker));
                junctionMarkers[key] = { marker, icon: makeIcon, active: key === selectedJunctionKey };
            });

            // Pan to selected junction
            if (data[selectedJunctionKey]) {
                const j = data[selectedJunctionKey];
                mumMap.setView([j.lat, j.lon], 13);
            }
        });
}

function selectJunction(key, clickedMarker) {
    const j = junctionsData[key];
    if (!j) return;

    // Update all marker icons
    Object.entries(junctionMarkers).forEach(([k, m]) => {
        const isActive = k === key;
        m.marker.setIcon(L.divIcon({
            className: '',
            html: `<div style="
                width:${isActive ? 16 : 12}px;
                height:${isActive ? 16 : 12}px;
                border-radius:50%;
                background:${isActive ? '#00d9a3' : '#8b949e'};
                border:3px solid ${isActive ? '#fff' : '#444'};
                box-shadow:${isActive ? '0 0 12px #00d9a3' : 'none'};
                transition:all 0.2s;
            "></div>`,
            iconSize: [isActive ? 16 : 12, isActive ? 16 : 12],
            iconAnchor: [isActive ? 8 : 6, isActive ? 8 : 6],
        }));
    });

    selectedJunctionKey = key;

    // Update upload page UI
    document.getElementById('junction-badge-text').textContent = j.name;
    document.getElementById('meta-junction').textContent = j.name;
    document.getElementById('meta-area').textContent = j.area;
    document.getElementById('meta-coords').textContent = `${j.lat.toFixed(4)}, ${j.lon.toFixed(4)}`;

    // Tell backend
    fetch('/set_junction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
    });
}


// ─────────────────────────────────────────────────────────────
// CLIENT-SIDE TIMER COUNTDOWN
// ─────────────────────────────────────────────────────────────
function startClientCountdown(serverTimer) {
    // If the server reports a meaningfully different timer, re-sync
    if (lastPollTimer === null || Math.abs(serverTimer - lastPollTimer) > 3) {
        clientTimer = serverTimer;
        if (timerMax === null || serverTimer > timerMax) timerMax = serverTimer;
    }
    lastPollTimer = serverTimer;

    // Clear old interval
    if (timerIntervalId) clearInterval(timerIntervalId);

    // Count down every second between polls
    timerIntervalId = setInterval(() => {
        if (clientTimer === null) return;
        clientTimer = Math.max(0, clientTimer - 1);
        renderTimerUI(clientTimer);
    }, 1000);
}

function renderTimerUI(seconds) {
    const timerEl = document.getElementById('timer-text');
    const barEl = document.getElementById('timer-bar');
    const labelEl = document.getElementById('timer-label-text');

    if (timerEl) timerEl.textContent = Math.ceil(seconds) + 's';

    // Progress bar
    if (barEl && timerMax && timerMax > 0) {
        const pct = (seconds / timerMax) * 100;
        barEl.style.width = pct + '%';
        // Colour shift: green → amber → red as time runs out
        if (pct > 40) barEl.style.background = '#00d9a3';
        else if (pct > 15) barEl.style.background = '#ffa502';
        else barEl.style.background = '#ff4757';
    }

    if (labelEl) {
        labelEl.textContent = seconds > 5 ? 'Green Phase' : (seconds > 0 ? 'Phase Ending…' : 'Predicting next cycle…');
    }
}


// ─────────────────────────────────────────────────────────────
// STATE POLLING
// ─────────────────────────────────────────────────────────────
function updateState() {
    if (isCalibrating) return;
    const analysisView = document.getElementById('analysis-view');
    if (!analysisView || !analysisView.classList.contains('active')) return;

    fetch('/state_feed')
        .then(response => response.json())
        .then(data => {
            // Vehicle counts
            const cats = data.category_counts || {};
            document.getElementById('count-lmv').textContent   = cats['LMV']           ?? 0;
            document.getElementById('count-hmv').textContent   = cats['HMV']           ?? 0;
            document.getElementById('count-auto').textContent  = cats['Auto Rickshaw']  ?? 0;
            document.getElementById('count-emergency').textContent = cats['Emergency']  ?? 0;

            // Junction name in nav
            if (data.junction_name) {
                document.getElementById('nav-junction-name').textContent = data.junction_name;
                document.getElementById('nav-junction-area').textContent = data.junction_area || '';
                document.getElementById('signal-junction-label').textContent = `📍 ${data.junction_name}`;
            }

            // Traffic light
            const timer = data.active_timer || 0;
            const isGreen = timer > 5;
            const isYellow = timer > 0 && timer <= 5;
            const isRed = timer === 0;

            document.getElementById('light-red').classList.toggle('active', isRed);
            document.getElementById('light-yellow').classList.toggle('active', isYellow);
            document.getElementById('light-green').classList.toggle('active', isGreen);
            document.getElementById('signal-status-text').textContent = isRed ? 'STOP' : isYellow ? 'CAUTION' : 'PROCEED';

            // Sync client-side countdown
            startClientCountdown(timer);
        })
        .catch(err => console.warn('State poll error:', err));
}

// Poll server every 2s; client-side interpolates every 1s
setInterval(updateState, 2000);


// ─────────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────────
let currentFileIsImage = false;
let imageRefreshInterval = null;

const IMAGE_EXTENSIONS = ['jpg','jpeg','png','bmp','tiff','tif','webp','gif'];

function isImageFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

function showFeedLoading(message) {
    const overlay = document.getElementById('feed-loading-overlay');
    const sub = document.getElementById('feed-loading-sub');
    if (overlay) overlay.classList.remove('hidden');
    if (sub && message) sub.textContent = message;
}

function hideFeedLoading() {
    const overlay = document.getElementById('feed-loading-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function startImageRefresh() {
    // Poll /current_frame every 800ms to update the image display
    if (imageRefreshInterval) clearInterval(imageRefreshInterval);
    imageRefreshInterval = setInterval(() => {
        if (!currentFileIsImage) return;
        const feed = document.getElementById('main-feed');
        if (feed) {
            feed.src = '/current_frame?' + Date.now();
        }
    }, 800);
}

function stopImageRefresh() {
    if (imageRefreshInterval) {
        clearInterval(imageRefreshInterval);
        imageRefreshInterval = null;
    }
}

function waitForFirstFrame(isImage, onReady) {
    let attempts = 0;
    const maxAttempts = 120; // 60 seconds max wait
    const sub = document.getElementById('feed-loading-sub');

    const poll = () => {
        if (attempts >= maxAttempts) {
            if (sub) sub.textContent = 'Taking longer than expected… check server logs';
            return;
        }
        attempts++;
        if (sub && attempts % 4 === 0) {
            const dots = '.'.repeat((attempts / 4) % 4 + 1);
            sub.textContent = `Running AI detection${dots}`;
        }

        fetch('/frame_ready')
            .then(r => r.json())
            .then(data => {
                if (data.ready) {
                    onReady();
                } else {
                    setTimeout(poll, 500);
                }
            })
            .catch(() => setTimeout(poll, 1000));
    };
    poll();
}

document.getElementById('video-upload').addEventListener('change', function () {
    if (!this.files.length) return;
    const file = this.files[0];
    const status = document.getElementById('upload-status');

    status.innerText = `Uploading ${file.name}…`;
    status.style.color = '#8b949e';

    currentFileIsImage = isImageFile(file.name);

    const formData = new FormData();
    formData.append('file', file);

    fetch('/upload', { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                status.innerText = 'Upload successful! Starting AI…';
                status.style.color = '#00d9a3';

                // Reset timer state for new session
                clientTimer = null; timerMax = null; lastPollTimer = null;
                if (timerIntervalId) clearInterval(timerIntervalId);
                stopImageRefresh();

                // Switch to analysis view immediately, show loading overlay
                document.getElementById('upload-view').classList.remove('active');
                document.getElementById('analysis-view').classList.add('active');
                status.innerText = '';

                // Update nav bar junction
                const j = junctionsData[selectedJunctionKey];
                if (j) {
                    document.getElementById('nav-junction-name').textContent = j.name;
                    document.getElementById('nav-junction-area').textContent = j.area || '';
                    document.getElementById('signal-junction-label').textContent = `📍 ${j.name}`;
                }

                // Clear old feed src and show loading overlay
                const feed = document.getElementById('main-feed');
                feed.src = '';
                showFeedLoading('Running AI detection…');

                // Poll until the first frame is ready, then display it
                waitForFirstFrame(currentFileIsImage, () => {
                    hideFeedLoading();
                    if (currentFileIsImage) {
                        // For images: poll /current_frame (reliable for static images)
                        feed.src = '/current_frame?' + Date.now();
                        startImageRefresh();
                    } else {
                        // For videos: use MJPEG stream
                        feed.src = '/video_feed?' + Date.now();
                    }
                });

            } else {
                status.innerText = 'Upload failed: ' + (data.error || 'Unknown error');
                status.style.color = '#ff4757';
            }
        })
        .catch(() => {
            status.innerText = 'Network error. Is the server running?';
            status.style.color = '#ff4757';
        });
});


// ─────────────────────────────────────────────────────────────
// CALIBRATION
// ─────────────────────────────────────────────────────────────
function startCalibration() {
    isCalibrating = true;
    calibrationData = { "Z1": [], "Z2": [], "Z3": [], "Z4": [] };
    currentZoneIdx = 0;

    document.getElementById('btn-start-calib').style.display = 'none';
    document.getElementById('btn-reset-calib').style.display = 'none';
    document.getElementById('btn-save-calib').style.display = '';
    document.getElementById('btn-cancel-calib').style.display = '';
    document.getElementById('calib-controls').style.display = 'flex';

    const canvas = document.getElementById('calibration-canvas');
    canvas.style.display = 'block';
    resizeCanvas();
    updateZoneLabel();

    canvas.addEventListener('click', onCanvasClick);
}

function exitCalibration() {
    isCalibrating = false;
    const canvas = document.getElementById('calibration-canvas');
    canvas.style.display = 'none';
    canvas.removeEventListener('click', onCanvasClick);

    document.getElementById('btn-start-calib').style.display = '';
    document.getElementById('btn-reset-calib').style.display = '';
    document.getElementById('btn-save-calib').style.display = 'none';
    document.getElementById('btn-cancel-calib').style.display = 'none';
    document.getElementById('calib-controls').style.display = 'none';
}

function cancelCalibration() { exitCalibration(); }

function resizeCanvas() {
    const img = document.getElementById('main-feed');
    const canvas = document.getElementById('calibration-canvas');
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
}

function updateZoneLabel() {
    const label = document.getElementById('current-zone-label');
    if (currentZoneIdx < zoneNames.length) {
        label.textContent = zoneNames[currentZoneIdx];
    } else {
        label.textContent = 'Done';
    }
}

function resetCurrentZone() {
    if (currentZoneIdx < zoneNames.length) {
        calibrationData[zoneNames[currentZoneIdx]] = [];
    }
    redrawCanvas();
}

function onCanvasClick(e) {
    if (currentZoneIdx >= zoneNames.length) return;
    const canvas = document.getElementById('calibration-canvas');
    const rect = canvas.getBoundingClientRect();
    const img = document.getElementById('main-feed');

    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);

    const currentZone = zoneNames[currentZoneIdx];
    calibrationData[currentZone].push([x, y]);

    redrawCanvas();

    if (calibrationData[currentZone].length >= 4) {
        currentZoneIdx++;
        updateZoneLabel();
    }
}

const ZONE_COLORS = ['#ff4757', '#ffa502', '#00d9a3', '#748ffc'];

function redrawCanvas() {
    const canvas = document.getElementById('calibration-canvas');
    const ctx = canvas.getContext('2d');
    const img = document.getElementById('main-feed');

    const scaleX = img.clientWidth / img.naturalWidth;
    const scaleY = img.clientHeight / img.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    zoneNames.forEach((zone, idx) => {
        const pts = calibrationData[zone];
        if (!pts || pts.length === 0) return;
        const color = ZONE_COLORS[idx % ZONE_COLORS.length];

        ctx.beginPath();
        ctx.moveTo(pts[0][0] * scaleX, pts[0][1] * scaleY);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0] * scaleX, pts[i][1] * scaleY);
        }
        if (pts.length >= 4) ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = color + '33';
        ctx.fill();

        pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p[0] * scaleX, p[1] * scaleY, 5, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
        });

        if (pts.length > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Inter, sans-serif';
            ctx.fillText(zone, pts[0][0] * scaleX + 6, pts[0][1] * scaleY - 6);
        }
    });
}

function saveCalibration() {
    const allDone = zoneNames.every(z => calibrationData[z].length >= 4);
    if (!allDone) {
        alert('Please define all 4 zones (4 points each) before saving.');
        return;
    }
    fetch('/save_zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calibrationData)
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('Zones saved! AI reloading with new calibration.');
            exitCalibration();
        } else {
            alert('Error saving: ' + data.error);
        }
    });
}


// ─────────────────────────────────────────────────────────────
// DRAG & DROP UPLOAD SUPPORT
// ─────────────────────────────────────────────────────────────
function setupDropzone() {
    const dropzone = document.getElementById('upload-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        dropzone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (!files.length) return;
        const input = document.getElementById('video-upload');
        // Assign dropped files to the input and fire the change event
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
    });
}


// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupDropzone();
});
