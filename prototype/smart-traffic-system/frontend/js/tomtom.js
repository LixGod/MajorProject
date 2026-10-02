/**
 * tomtom.js
 * TomTom Maps SDK v6 integration:
 *  - Map init with night style + traffic flow overlay
 *  - Traffic Flow API fetch (speed, free-flow, confidence)
 *  - Auto-refresh every 60s
 */

const TomTomModule = (() => {
  const API_KEY = "Qx47lCBXmLrYwqEm10FHf6lJQtcXiHtM";
  let _map = null;
  let _marker = null;
  let _refreshTimer = null;
  let _currentLat = 19.0760;
  let _currentLon = 72.8777;

  function initMap(lat, lon) {
    try {
      if (_map) { try { _map.remove(); } catch(e) {} }

      _currentLat = lat;
      _currentLon = lon;

      _map = tt.map({
        key:       API_KEY,
        container: "map",
        center:    [lon, lat],
        zoom:      16,
        style: "https://api.tomtom.com/style/1/style/22.2.1-9?map=basic_night&traffic_incidents=incidents_night&traffic_flow=flow_relative0",
      });

      // Marker
      const el = document.createElement("div");
      el.className = "custom-marker";
      el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="#5EA8FF"/>
        <circle cx="14" cy="14" r="6" fill="#0F141B"/>
      </svg>`;
      el.style.cssText = "cursor:pointer;";

      if (_marker) { try { _marker.remove(); } catch(e) {} }
      _marker = new tt.Marker({ element: el }).setLngLat([lon, lat]).addTo(_map);

      // Traffic flow tile overlay
      _map.on("load", () => {
        try {
          _map.addLayer({
            id:   "tt-flow-overlay",
            type: "raster",
            source: {
              type:     "raster",
              tiles:    [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${API_KEY}`],
              tileSize: 256,
            },
            paint: { "raster-opacity": 0.6 },
          });
        } catch(e) { console.warn("Traffic overlay unavailable:", e); }

        // Incident markers
        try {
          _map.addLayer({
            id:   "tt-incident-overlay",
            type: "raster",
            source: {
              type:     "raster",
              tiles:    [`https://api.tomtom.com/traffic/map/4/tile/incidents/night/{z}/{x}/{y}.png?key=${API_KEY}`],
              tileSize: 256,
            },
            paint: { "raster-opacity": 0.85 },
          });
        } catch(e) {}
      });

      // Start auto-refresh
      if (_refreshTimer) clearInterval(_refreshTimer);
      _refreshTimer = setInterval(() => fetchFlow(_currentLat, _currentLon), 60000);

    } catch(err) {
      console.error("TomTom map init failed:", err);
      const mapEl = document.getElementById("map");
      if (mapEl) mapEl.innerHTML = `<div class="map-error">
        <p>Map unavailable — check API key and network connection.</p>
        <code>${err.message}</code></div>`;
    }
  }

  async function fetchFlow(lat, lon) {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${API_KEY}`;
    const speedEl    = document.getElementById("tt-speed");
    const freeflowEl = document.getElementById("tt-freeflow");
    const confEl     = document.getElementById("tt-conf");
    const barEl      = document.getElementById("tt-bar");
    const trendEl    = document.getElementById("tt-trend");

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const f    = data.flowSegmentData;

      const ratio = f.freeFlowSpeed > 0
        ? Math.min(100, Math.round((f.currentSpeed / f.freeFlowSpeed) * 100))
        : 0;

      if (speedEl)    speedEl.textContent    = `${f.currentSpeed} km/h`;
      if (freeflowEl) freeflowEl.textContent = `${f.freeFlowSpeed} km/h`;
      if (confEl)     confEl.textContent     = `${Math.round(f.confidence * 100)}%`;
      if (barEl) {
        barEl.style.width = `${ratio}%`;
        barEl.style.background =
          ratio > 70 ? "#34D399" :
          ratio > 40 ? "#FBBF24" : "#F87171";
      }

      // congestion status for signal engine secondary adjustment
      const congestionFactor = ratio < 40 ? 1.3 : ratio < 70 ? 1.0 : 0.85;
      if (trendEl) {
        const icon  = ratio > 70 ? "↑ Free flow" : ratio > 40 ? "~ Moderate" : "↓ Congested";
        trendEl.textContent = icon;
        trendEl.className   = `tt-trend ${ratio > 70 ? "go" : ratio > 40 ? "caution" : "critical"}`;
      }

      return { currentSpeed: f.currentSpeed, freeFlowSpeed: f.freeFlowSpeed, ratio, congestionFactor };
    } catch(err) {
      if (speedEl) speedEl.textContent = "unavailable";
      if (freeflowEl) freeflowEl.textContent = "—";
      if (confEl) confEl.textContent = "—";
      console.warn("TomTom flow fetch failed:", err);
      return null;
    }
  }

  function panTo(lat, lon) {
    _currentLat = lat;
    _currentLon = lon;
    if (_map) {
      _map.flyTo({ center: [lon, lat], zoom: 16, speed: 1.2 });
      if (_marker) _marker.setLngLat([lon, lat]);
    }
    fetchFlow(lat, lon);
  }

  return { initMap, fetchFlow, panTo };
})();
