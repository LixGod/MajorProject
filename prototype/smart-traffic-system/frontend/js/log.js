/**
 * log.js — Detection event log manager
 */

const Log = (() => {
  const MAX_ROWS = 100;
  let _count = 0;

  const LEVEL_META = {
    low:  { cls: "low",  label: "Low",      bg: "rgba(52,211,153,.15)",  fg: "#34D399" },
    med:  { cls: "med",  label: "Medium",   bg: "rgba(251,191,36,.15)",  fg: "#FBBF24" },
    high: { cls: "high", label: "High",     bg: "rgba(248,113,113,.15)", fg: "#F87171" },
  };

  function congestionLabel(vehicleCount, weightedScore) {
    if (vehicleCount >= 15 || weightedScore >= 20) return "high";
    if (vehicleCount >= 5  || weightedScore >= 6)  return "med";
    return "low";
  }

  function addRow({ code, filename, source_type, vehicle_count, weighted_score, class_counts, has_emergency }) {
    const tbody = document.getElementById("log-body");
    if (!tbody) return;

    const emptyRow = tbody.querySelector(".empty-row");
    if (emptyRow) emptyRow.remove();

    const level    = has_emergency ? "high" : congestionLabel(vehicle_count, weighted_score);
    const lm       = LEVEL_META[level];
    const time     = new Date().toLocaleTimeString("en-IN");
    const classes  = Object.entries(class_counts || {})
      .map(([k, v]) => `${k}×${v}`)
      .join(", ") || "—";

    const emergencyBadge = has_emergency
      ? `<span class="tag high" style="background:rgba(255,59,59,.25);color:#FF3B3B;margin-left:4px;">🚨 EMERGENCY</span>`
      : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${time}</td>
      <td><span class="arm-badge">${code}</span></td>
      <td class="fname-cell" title="${filename}">${truncate(filename, 22)}</td>
      <td><span class="type-pill">${source_type}</span></td>
      <td class="mono">${vehicle_count}</td>
      <td class="mono">${weighted_score.toFixed(1)}</td>
      <td class="classes-cell dim">${classes}</td>
      <td><span class="tag ${lm.cls}">${lm.label}</span>${emergencyBadge}</td>
    `;
    tbody.prepend(tr);
    _count++;

    // Prune old rows
    const rows = tbody.querySelectorAll("tr:not(.empty-row)");
    if (rows.length > MAX_ROWS) rows[rows.length - 1].remove();
  }

  function clear() {
    const tbody = document.getElementById("log-body");
    if (!tbody) return;
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No detections yet — upload a feed for any approach to begin.</td></tr>`;
    _count = 0;
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  }

  return { addRow, clear };
})();
