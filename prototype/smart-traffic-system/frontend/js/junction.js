/**
 * junction.js
 * Dynamic SVG junction renderer for 4-way junctions.
 * Supports live phase animation and per-arm congestion coloring.
 */

const JunctionRenderer = (() => {

  const COLORS = {
    road:    "#1E2631",
    surface: "#252E3A",
    dash:    "#2A3441",
    text:    "#E7ECF2",
    dimText: "#8B96A5",
    go:      "#34D399",
    caution: "#FBBF24",
    critical:"#F87171",
    accent:  "#5EA8FF",
    emergency:"#FF3B3B",
    allRed:  "#F87171",
  };

  const DIRS_4 = [
    { code: "N", label: "North", angle: -90 },
    { code: "E", label: "East",  angle:   0 },
    { code: "S", label: "South", angle:  90 },
    { code: "W", label: "West",  angle: 180 },
  ];

  function levelColor(level, hasEmergency) {
    if (hasEmergency) return COLORS.emergency;
    if (level === "high")   return COLORS.critical;
    if (level === "med")    return COLORS.caution;
    return COLORS.go;
  }

  /**
   * Build the static 4-way junction SVG (roads + dashes + center box).
   * Returns an SVG element.
   */
  function buildSVG() {
    const W = 400, H = 400, ROAD = 100, CX = 200, CY = 200;
    const ns = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("id", "junction-svg");
    svg.style.cssText = "width:100%;max-width:460px;height:auto;";

    const g = (tag, attrs = {}) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    };

    // ── roads ──────────────────────────────────────────────────
    // North-South road
    svg.appendChild(g("rect", { x: CX - ROAD/2, y: 0, width: ROAD, height: H, fill: COLORS.road }));
    // East-West road
    svg.appendChild(g("rect", { x: 0, y: CY - ROAD/2, width: W, height: ROAD, fill: COLORS.road }));
    // Center intersection
    svg.appendChild(g("rect", { x: CX - ROAD/2, y: CY - ROAD/2, width: ROAD, height: ROAD, fill: COLORS.surface }));

    // ── center logo ────────────────────────────────────────────
    const cLogo = g("circle", { cx: CX, cy: CY, r: 16, fill: "#131922", stroke: COLORS.dash, "stroke-width": 1 });
    svg.appendChild(cLogo);
    const cTxt = g("text", { x: CX, y: CY + 5, "text-anchor": "middle", "font-size": 9, "font-family": "IBM Plex Mono", fill: COLORS.dimText });
    cTxt.textContent = "JXN";
    svg.appendChild(cTxt);

    // ── center lane dashes ────────────────────────────────────
    const dashAttrs = { stroke: COLORS.dash, "stroke-width": 2, "stroke-dasharray": "8 8" };
    svg.appendChild(g("line", { x1: CX, y1: 0, x2: CX, y2: CY - ROAD/2, ...dashAttrs }));
    svg.appendChild(g("line", { x1: CX, y1: CY + ROAD/2, x2: CX, y2: H, ...dashAttrs }));
    svg.appendChild(g("line", { x1: 0, y1: CY, x2: CX - ROAD/2, y2: CY, ...dashAttrs }));
    svg.appendChild(g("line", { x1: CX + ROAD/2, y1: CY, x2: W, y2: CY, ...dashAttrs }));

    // ── crosswalk stripes ─────────────────────────────────────
    const stripe = (x, y, w, h) => g("rect", { x, y, width: w, height: h, fill: "#2D3A4A", rx: 1 });
    // North crosswalk
    for (let i = 0; i < 5; i++) svg.appendChild(stripe(CX - ROAD/2 + i*20, CY - ROAD/2 - 12, 12, 10));
    // South crosswalk
    for (let i = 0; i < 5; i++) svg.appendChild(stripe(CX - ROAD/2 + i*20, CY + ROAD/2 + 2, 12, 10));
    // West crosswalk
    for (let i = 0; i < 5; i++) svg.appendChild(stripe(CX - ROAD/2 - 12, CY - ROAD/2 + i*20, 10, 12));
    // East crosswalk
    for (let i = 0; i < 5; i++) svg.appendChild(stripe(CX + ROAD/2 + 2, CY - ROAD/2 + i*20, 10, 12));

    // ── arm elements (congestion bars + traffic lights + labels) ──
    DIRS_4.forEach(dir => {
      const arm = buildArmElements(ns, g, dir, ROAD, CX, CY, W, H);
      arm.forEach(el => svg.appendChild(el));
    });

    return svg;
  }

  function buildArmElements(ns, g, dir, ROAD, CX, CY, W, H) {
    const els = [];
    const { code } = dir;

    // Traffic light signal indicator (circle, position near intersection edge)
    const TL_POS = {
      N: { x: CX + ROAD/2 + 10, y: CY - ROAD/2 - 22 },
      S: { x: CX - ROAD/2 - 22, y: CY + ROAD/2 + 10 },
      E: { x: CX + ROAD/2 + 10, y: CY + ROAD/2 + 10 },
      W: { x: CX - ROAD/2 - 22, y: CY - ROAD/2 - 22 },
    };

    // Congestion bar (colored rectangle near junction edge)
    const BAR = {
      N: { x: CX - ROAD/2, y: CY - ROAD/2 - 18, width: ROAD, height: 10, rx: 3 },
      S: { x: CX - ROAD/2, y: CY + ROAD/2 + 8,  width: ROAD, height: 10, rx: 3 },
      E: { x: CX + ROAD/2 + 8,  y: CY - ROAD/2, width: 10, height: ROAD, rx: 3 },
      W: { x: CX - ROAD/2 - 18, y: CY - ROAD/2, width: 10, height: ROAD, rx: 3 },
    }[code];

    const bar = g("rect", { ...BAR, fill: COLORS.go, id: `bar-${code}` });
    els.push(bar);

    // Traffic signal housing
    const tl = TL_POS[code];
    const housing = g("rect", { x: tl.x, y: tl.y, width: 12, height: 28, rx: 3,
                                 fill: "#131922", stroke: COLORS.dash, "stroke-width": 1 });
    els.push(housing);

    // Signal lights (red, amber, green circles)
    const lights = [
      { cy: tl.y + 5,  color: COLORS.critical, id: `sig-red-${code}`,   opacity: 0.3 },
      { cy: tl.y + 14, color: COLORS.caution,  id: `sig-amb-${code}`,   opacity: 0.3 },
      { cy: tl.y + 23, color: COLORS.go,       id: `sig-green-${code}`, opacity: 0.3 },
    ];
    lights.forEach(l => els.push(g("circle", { cx: tl.x + 6, cy: l.cy, r: 4, fill: l.color, id: l.id, opacity: l.opacity })));

    // Approach flow arrows
    const ARROW = {
      N: { x1: CX, y1: 50, x2: CX, y2: CY - ROAD/2 - 22, dir: "down" },
      S: { x1: CX, y1: H-50, x2: CX, y2: CY + ROAD/2 + 22, dir: "up" },
      E: { x1: W-50, y1: CY, x2: CX + ROAD/2 + 22, y2: CY, dir: "left" },
      W: { x1: 50, y1: CY, x2: CX - ROAD/2 - 22, y2: CY, dir: "right" },
    }[code];
    const arrow = g("line", { x1: ARROW.x1, y1: ARROW.y1, x2: ARROW.x2, y2: ARROW.y2,
                               stroke: COLORS.dimText, "stroke-width": 1.5,
                               "stroke-dasharray": "4 4", id: `arrow-${code}`,
                               "marker-end": "url(#arrowhead)" });
    els.push(arrow);

    // Vehicle count text
    const COUNT_POS = {
      N: { x: CX, y: 35 },
      S: { x: CX, y: H - 22 },
      E: { x: W - 22, y: CY - 8 },
      W: { x: 22,     y: CY - 8 },
    }[code];
    const countText = g("text", { x: COUNT_POS.x, y: COUNT_POS.y, "text-anchor": "middle",
                                   "font-family": "Space Grotesk, sans-serif",
                                   "font-size": 18, "font-weight": 700,
                                   fill: "#E7ECF2", id: `count-${code}` });
    countText.textContent = "0";
    els.push(countText);

    // Weighted score sub-label
    const SCORE_POS = {
      N: { x: CX, y: 52 },
      S: { x: CX, y: H - 7 },
      E: { x: W - 22, y: CY + 10 },
      W: { x: 22,     y: CY + 10 },
    }[code];
    const scoreText = g("text", { x: SCORE_POS.x, y: SCORE_POS.y, "text-anchor": "middle",
                                   "font-family": "IBM Plex Mono, monospace",
                                   "font-size": 9, fill: COLORS.dimText, id: `score-${code}` });
    scoreText.textContent = "score: 0";
    els.push(scoreText);

    // Direction label
    const LABEL_POS = {
      N: { x: CX + 12, y: 35 },
      S: { x: CX + 12, y: H - 22 },
      E: { x: W - 6,   y: CY + 26 },
      W: { x: 6,       y: CY + 26 },
    }[code];
    const labelText = g("text", { x: LABEL_POS.x, y: LABEL_POS.y, "text-anchor": "start",
                                   "font-family": "IBM Plex Mono, monospace",
                                   "font-size": 10, fill: COLORS.dimText });
    labelText.textContent = code;
    els.push(labelText);

    return els;
  }

  /**
   * Update a single arm's visual state.
   */
  function updateArm(code, { vehicle_count = 0, weighted_score = 0, level = "low", has_emergency = false }) {
    const color = levelColor(level, has_emergency);
    const bar = document.getElementById(`bar-${code}`);
    if (bar) bar.setAttribute("fill", color);
    const ct = document.getElementById(`count-${code}`);
    if (ct) ct.textContent = vehicle_count;
    const sc = document.getElementById(`score-${code}`);
    if (sc) sc.textContent = `w:${weighted_score.toFixed(1)}`;
  }

  /**
   * Update traffic signal lights for an arm.
   * state: "green" | "amber" | "red" | "all_red"
   */
  function setSignalState(code, state) {
    const redEl   = document.getElementById(`sig-red-${code}`);
    const ambEl   = document.getElementById(`sig-amb-${code}`);
    const greenEl = document.getElementById(`sig-green-${code}`);
    if (!redEl) return;
    redEl.setAttribute("opacity",   state === "red" || state === "all_red" ? 1 : 0.2);
    ambEl.setAttribute("opacity",   state === "amber" ? 1 : 0.2);
    greenEl.setAttribute("opacity", state === "green" ? 1 : 0.2);
  }

  /**
   * Animate all arms to all-red, then set the active one green.
   */
  function setActivePhase(activeCode, allCodes) {
    allCodes.forEach(code => setSignalState(code, code === activeCode ? "green" : "red"));
  }

  /**
   * Build and inject the SVG arrowhead marker def.
   */
  function injectDefs(svg) {
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "arrowhead");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("refX", "3");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");
    const poly = document.createElementNS(ns, "polygon");
    poly.setAttribute("points", "0 0, 6 3, 0 6");
    poly.setAttribute("fill", "#2A3441");
    marker.appendChild(poly);
    defs.appendChild(marker);
    svg.insertBefore(defs, svg.firstChild);
  }

  function render(container) {
    container.innerHTML = "";
    const svg = buildSVG();
    injectDefs(svg);
    container.appendChild(svg);
    return svg;
  }

  return { render, updateArm, setSignalState, setActivePhase, levelColor };
})();
