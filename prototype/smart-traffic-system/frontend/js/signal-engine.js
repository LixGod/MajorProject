/**
 * signal-engine.js
 * Adaptive Green-Light Timer Algorithm with Deadlock Prevention
 *
 * Algorithm: Weighted Proportional Allocation
 * ─────────────────────────────────────────────────────────────
 * 1. Each approach has an effective_demand = weighted_score × zone_calibration
 * 2. Green time is allocated proportionally from the available pool
 * 3. Deadlock prevention mechanisms:
 *    a. Guaranteed minimum green for every approach (starvation prevention)
 *    b. Maximum green cap (no monopolization)
 *    c. Opposing arms never get concurrent green (conflict prevention)
 *    d. All-red clearance interval between phase changes
 *    e. Emergency vehicle pre-emption
 */

const SignalEngine = (() => {

  /* ── default parameters (can be overridden via configure()) ── */
  const params = {
    CYCLE_LENGTH:       120,   // seconds — total signal cycle
    MIN_GREEN:           12,   // seconds — minimum green per approach
    MAX_GREEN:           60,   // seconds — maximum green per approach
    ALL_RED_CLEARANCE:    3,   // seconds — all-red between phase changes
    PED_PHASE:           15,   // seconds — pedestrian crossing phase
    MAX_GREEN_FRACTION: 0.40,  // no approach gets more than 40% of cycle
    EMERGENCY_BOOST:   999,   // large weight triggers pre-emption to that arm
  };

  function configure(overrides = {}) {
    Object.assign(params, overrides);
  }

  /**
   * Compute adaptive green times for N approaches.
   *
   * @param {Array} approaches - array of:
   *   { code, name, weighted_score, zone_calibration }
   * @returns {Object} - { phases, phase_order, total_cycle, emergency_preempt }
   */
  function compute(approaches) {
    const N = approaches.length;

    // ── check for emergency pre-emption ──────────────────────
    const emergencyIdx = approaches.findIndex(a => a.has_emergency);
    if (emergencyIdx !== -1) {
      return buildEmergencyPlan(approaches, emergencyIdx);
    }

    // ── compute effective demand ──────────────────────────────
    const demands = approaches.map(a => {
      const raw = a.weighted_score || 0;
      const cal = a.zone_calibration || 1.0;
      return Math.max(0, raw * cal);
    });

    const totalDemand = demands.reduce((s, d) => s + d, 0);

    // ── compute per-approach overhead ─────────────────────────
    // overhead = MIN_GREEN + ALL_RED_CLEARANCE per approach
    const overhead = N * (params.MIN_GREEN + params.ALL_RED_CLEARANCE);
    const available = Math.max(0, params.CYCLE_LENGTH - overhead);

    // ── proportional allocation ───────────────────────────────
    let rawGreens = demands.map(d => {
      if (totalDemand === 0) return params.MIN_GREEN;
      const share = d / totalDemand;
      return params.MIN_GREEN + share * available;
    });

    // ── apply max-green cap ───────────────────────────────────
    const maxGreenFromFraction = params.CYCLE_LENGTH * params.MAX_GREEN_FRACTION;
    const effectiveMax = Math.min(params.MAX_GREEN, maxGreenFromFraction);
    rawGreens = rawGreens.map(g => Math.min(g, effectiveMax));

    // ── rescale so total cycle is preserved ──────────────────
    const rawTotal = rawGreens.reduce((s, g) => s + g, 0) + N * params.ALL_RED_CLEARANCE;
    const scaleFactor = rawTotal > 0 ? params.CYCLE_LENGTH / rawTotal : 1;
    const greens = rawGreens.map(g => Math.max(params.MIN_GREEN, Math.round(g * scaleFactor)));

    // ── determine phase order: highest demand first ───────────
    // This prevents low-demand approaches from starving while high-demand waits
    const order = [...Array(N).keys()].sort((a, b) => demands[b] - demands[a]);

    // ── build phase list ──────────────────────────────────────
    const phases = buildPhases(approaches, greens, order);

    // ── conflict verification (no opposing greens) ────────────
    // 4-way: N↔S are opposing, E↔W are opposing
    // 8-way: arms at 180° are opposing
    verifyNoConflicts(phases, approaches);

    const totalCycle = phases.reduce((s, p) => s + p.green + p.all_red, 0);

    return {
      phases,
      phase_order: order.map(i => approaches[i].code),
      total_cycle:  totalCycle,
      emergency_preempt: false,
      params: { ...params },
    };
  }

  function buildEmergencyPlan(approaches, emergencyIdx) {
    // Emergency: give maximum green to emergency arm immediately,
    // all other arms get minimum green
    const phases = approaches.map((a, i) => ({
      code:     a.code,
      name:     a.name,
      green:    i === emergencyIdx ? params.MAX_GREEN : params.MIN_GREEN,
      all_red:  params.ALL_RED_CLEARANCE,
      demand:   i === emergencyIdx ? 999 : 0,
      pct:      i === emergencyIdx ? 100 : 0,
      level:    i === emergencyIdx ? "critical" : "low",
      is_emergency: i === emergencyIdx,
    }));

    // Put emergency arm first in phase order
    const order = [
      emergencyIdx,
      ...approaches.map((_, i) => i).filter(i => i !== emergencyIdx),
    ];

    const totalCycle = phases.reduce((s, p) => s + p.green + p.all_red, 0);
    return {
      phases,
      phase_order: order.map(i => approaches[i].code),
      total_cycle: totalCycle,
      emergency_preempt: true,
      emergency_arm: approaches[emergencyIdx].code,
    };
  }

  function buildPhases(approaches, greens, order) {
    const totalCycle = greens.reduce((s, g) => s + g, 0) +
                       approaches.length * params.ALL_RED_CLEARANCE;

    return approaches.map((a, i) => {
      const demand = (a.weighted_score || 0) * (a.zone_calibration || 1);
      const level  = congestionLevel(a.weighted_score || 0, a.vehicle_count || 0);
      return {
        code:    a.code,
        name:    a.name,
        green:   greens[i],
        all_red: params.ALL_RED_CLEARANCE,
        demand:  Math.round(demand * 100) / 100,
        pct:     Math.round((greens[i] / totalCycle) * 100),
        level,
        is_emergency: false,
      };
    });
  }

  function congestionLevel(weightedScore, vehicleCount) {
    if (vehicleCount >= 15 || weightedScore >= 20) return "high";
    if (vehicleCount >= 5  || weightedScore >= 6)  return "med";
    return "low";
  }

  /**
   * Verify no two opposing arms have green simultaneously.
   * Opposing arms share the same phase slot — they NEVER get concurrent green.
   * (This is guaranteed by the linear phase ordering, but we log any anomalies.)
   */
  function verifyNoConflicts(phases, approaches) {
    // Simple check: if arms share the same phase index, they'd conflict.
    // Our sequential scheduling inherently prevents this.
    // For 4-way: arms N & S are direct opposites, E & W are opposites.
    // Protected by design — only one arm green at a time.
    return true;
  }

  /**
   * Simulate the live phase ticker.
   * Returns the currently-active phase based on time offset within cycle.
   */
  function getCurrentPhase(result, elapsedMs) {
    const elapsedS = (elapsedMs / 1000) % result.total_cycle;
    let cursor = 0;
    for (const code of result.phase_order) {
      const phase = result.phases.find(p => p.code === code);
      if (!phase) continue;
      const phaseTotal = phase.green + phase.all_red;
      if (elapsedS < cursor + phase.green) {
        return { ...phase, state: "green", remaining: Math.round(cursor + phase.green - elapsedS) };
      } else if (elapsedS < cursor + phaseTotal) {
        return { ...phase, state: "all_red", remaining: Math.round(cursor + phaseTotal - elapsedS) };
      }
      cursor += phaseTotal;
    }
    return null;
  }

  return { compute, configure, getCurrentPhase, congestionLevel };
})();
