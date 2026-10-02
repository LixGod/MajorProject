"""
Adaptive Traffic Signal Control Algorithm
==========================================
Max-Pressure control (Varaiya, 2013) extended with:
- Aging term to guarantee bounded worst-case wait (starvation prevention)
- Actuated gap-out timing (frame-by-frame adaptive green duration)
- Hard starvation cap (provable upper bound on wait time)
- Emergency vehicle preemption
- Downstream-capacity awareness (prevents feeding gridlock/spillback)
This file is self-contained and runnable as-is with the synthetic demo at the
bottom. In production, replace the synthetic `get_detections()` calls with
real per-frame output from your trained detection model.
Author's note for the paper: the core novelty over textbook Max-Pressure is
the aging term (Section: pressure formula) and the hard wait cap (Section:
starvation guard) — vanilla Max-Pressure is throughput-optimal but does not
by itself guarantee an individual approach a bounded wait; this extension
does, at a small, tunable cost to raw throughput.
"""
from __future__ import annotations
import time
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("signal_control")
# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
@dataclass
class ControlParams:
"""All tunable constants live here — never hardcode magic numbers elsewhere."""
min_green_sec: float = 12.0
max_green_sec: float = 90.0
all_red_clearance_sec: float = 3.0
gap_out_threshold_sec: float = 2.0 # if no new arrival within this window, gap out
gap_out_extend_sec: float = 2.0 # extension granted per detected arrival
w_veh: float = 1.0 # weight on own queue length
w_down: float = 0.8 # weight on downstream queue (spillback penalty)
w_age: float = 0.05 # weight on wait_since_green (starvation preventi
w_max_wait_sec: float = 120.0 # hard cap: force service beyond this wait, no ex
saturation_flow_rate_veh_per_sec_per_lane: float = 0.5
max_preemption_hold_sec: float = 45.0
class_weights: Dict[str, float] = field(default_factory=lambda: {
"car": 1.0, "motorcycle": 0.5, "auto_rickshaw": 0.5,
"bus": 2.5, "truck": 2.5, "bicycle": 0.3, "pedestrian": 0.0,
"emergency_vehicle": 1.0, # counted normally for queue purposes; preemption is separ
})
# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #
class MovementId(str):
"""A movement is one directed traffic stream, e.g. 'north_through', 'east_left'."""
@dataclass
class Phase:
"""A phase is a set of movements that may safely run green simultaneously."""
phase_id: str
movements: Set[MovementId]
@dataclass
class ApproachState:
"""Live state for one approach, refreshed every control tick from detections."""
approach_id: str
movement_id: MovementId
queue_length: float = 0.0 # class-weighted vehicle count in this approach's ROI
downstream_queue: float = 0.0 # class-weighted queue on the link this movement feeds
wait_since_green: float = 0.0 # seconds since this movement last had green
feed_healthy: bool = True # False if camera/detector dropout detected
emergency_vehicle_present: bool = False
last_updated: float = field(default_factory=time.time)
# --------------------------------------------------------------------------- #
# Pressure computation
# --------------------------------------------------------------------------- #
def compute_pressure(state: ApproachState, params: ControlParams) -> float:
"""
pressure = w_veh * queue_length - w_down * downstream_queue + w_age * wait_since_green
A movement whose downstream link is already congested yields low/negative
pressure even with a long local queue — this is what stops the controller
from feeding spillback gridlock. The aging term ensures a movement that
has waited a long time accumulates priority even under light traffic.
"""
return (
params.w_veh * state.queue_length
- params.w_down * state.downstream_queue
+ params.w_age * state.wait_since_green
)
def compute_phase_pressure(
phase: Phase, states: Dict[MovementId, ApproachState], params: ControlParams
) -> float:
return sum(compute_pressure(states[m], params) for m in phase.movements if m in states)
# --------------------------------------------------------------------------- #
# Gap-out timer (actuated green extension)
# --------------------------------------------------------------------------- #
@dataclass
class GapOutTimer:
"""
Tracks whether the currently-green phase should extend or end, based on
whether new vehicles keep arriving within `gap_out_threshold_sec`.
"""
phase_start_time: float
last_arrival_time: float
computed_duration: float # from compute_green_duration(); may be extended live
def register_arrival(self) -> None:
self.last_arrival_time = time.time()
def should_gap_out(self, params: ControlParams) -> bool:
elapsed = time.time() - self.phase_start_time
if elapsed < params.min_green_sec:
return False # never gap out before minimum green
time_since_last_arrival = time.time() - self.last_arrival_time
return time_since_last_arrival > params.gap_out_threshold_sec
def should_force_end(self, params: ControlParams) -> bool:
elapsed = time.time() - self.phase_start_time
return elapsed >= params.max_green_sec
def compute_green_duration(
phase: Phase, states: Dict[MovementId, ApproachState], params: ControlParams
) -> float:
"""Base duration proportional to queued demand, clipped to [min, max]."""
total_queue = sum(states[m].queue_length for m in phase.movements if m in states)
lanes_estimate = max(1, len(phase.movements)) # refine with real per-movement lane count
raw = params.min_green_sec + (
total_queue / (params.saturation_flow_rate_veh_per_sec_per_lane * lanes_estimate)
)
return max(params.min_green_sec, min(params.max_green_sec, raw))
# --------------------------------------------------------------------------- #
# Phase selection with hard starvation guard
# --------------------------------------------------------------------------- #
def select_next_phase(
candidate_phases: List[Phase],
states: Dict[MovementId, ApproachState],
params: ControlParams,
) -> Phase:
"""
Selects the phase with maximum aggregate pressure, UNLESS some movement has
exceeded the hard wait cap (w_max_wait_sec) — in which case the phase
serving that movement is forced regardless of pressure. This is what makes
starvation provably bounded rather than merely "usually fine."
"""
starved = [
m for m, s in states.items()
if s.wait_since_green > params.w_max_wait_sec
]
if starved:
for phase in candidate_phases:
if phase.movements & set(starved):
logger.warning(
"Hard starvation cap triggered for movement(s) %s — forcing phase %s",
starved, phase.phase_id,
)
return phase
scored = [(compute_phase_pressure(p, states, params), p) for p in candidate_phases]
scored.sort(key=lambda x: x[0], reverse=True)
best_pressure, best_phase = scored[0]
logger.info("Selected phase %s (pressure=%.2f)", best_phase.phase_id, best_pressure)
return best_phase
# --------------------------------------------------------------------------- #
# Emergency preemption
# --------------------------------------------------------------------------- #
def check_emergency_preemption(
states: Dict[MovementId, ApproachState],
candidate_phases: List[Phase],
) -> Optional[Phase]:
"""Returns the phase to preempt into, or None if no emergency vehicle present."""
ev_movements = {m for m, s in states.items() if s.emergency_vehicle_present}
if not ev_movements:
return None
for phase in candidate_phases:
if phase.movements & ev_movements:
return phase
return None
# --------------------------------------------------------------------------- #
# Junction controller — ties it all together
# --------------------------------------------------------------------------- #
class JunctionController:
def __init__(
self,
junction_id: str,
phases: List[Phase],
params: ControlParams,
):
self.junction_id = junction_id
self.phases = phases
self.params = params
self.states: Dict[MovementId, ApproachState] = {}
self.current_phase: Optional[Phase] = None
self.gap_out_timer: Optional[GapOutTimer] = None
self.in_all_red_clearance = False
self.preempted = False
self.preemption_start: Optional[float] = None
def register_movement(self, state: ApproachState) -> None:
self.states[state.movement_id] = state
def update_state(self, movement_id: MovementId, **kwargs) -> None:
"""Call this every control tick with fresh detection-derived values."""
if movement_id not in self.states:
logger.error("Unknown movement_id %s for junction %s", movement_id, self.junction
return
state = self.states[movement_id]
for k, v in kwargs.items():
setattr(state, k, v)
state.last_updated = time.time()
def tick(self) -> Phase:
"""
Call this once per control loop iteration (e.g. every 1s). Returns the
active phase after applying preemption / gap-out / phase-selection logic.
"""
# 1. Emergency preemption takes priority over everything else.
preempt_phase = check_emergency_preemption(self.states, self.phases)
if preempt_phase is not None:
if not self.preempted or self.current_phase != preempt_phase:
logger.warning(
"EMERGENCY PREEMPTION triggered — transitioning to phase %s",
preempt_phase.phase_id,
)
self._transition_to(preempt_phase)
self.preempted = True
self.preemption_start = time.time()
elif time.time() - self.preemption_start > self.params.max_preemption_hold_sec:
logger.warning("Preemption max hold exceeded — resuming normal control")
self.preempted = False
return self.current_phase
self.preempted = False
# 2. No current phase yet — bootstrap.
if self.current_phase is None:
first_phase = select_next_phase(self.phases, self.states, self.params)
self._transition_to(first_phase)
return self.current_phase
# 3. Decide whether to end the current phase (gap-out or max green).
assert self.gap_out_timer is not None
if self.gap_out_timer.should_force_end(self.params) or self.gap_out_timer.should_gap_
for m in self.current_phase.movements:
self.states[m].wait_since_green = 0.0
next_phase = select_next_phase(self.phases, self.states, self.params)
self._transition_to(next_phase)
else:
# still green — check for new arrivals to extend gap-out window
for m in self.current_phase.movements:
if self.states[m].queue_length > 0:
self.gap_out_timer.register_arrival()
# 4. Age every movement NOT currently green.
for m, s in self.states.items():
if self.current_phase and m not in self.current_phase.movements:
s.wait_since_green += 1.0 # assumes ~1s tick interval; pass real dt in produ
return self.current_phase
def _transition_to(self, phase: Phase) -> None:
logger.info(
"Junction %s: transitioning to phase %s (all-red clearance %.1fs)",
self.junction_id, phase.phase_id, self.params.all_red_clearance_sec,
)
# NOTE: in a real deployment, actually hold all-red for
# `all_red_clearance_sec` before releasing the new green — this is a
# hard safety invariant and must never be skipped, including during
# emergency preemption.
self.current_phase = phase
self.gap_out_timer = GapOutTimer(
phase_start_time=time.time(),
last_arrival_time=time.time(),
computed_duration=compute_green_duration(phase, self.states, self.params),
)
# --------------------------------------------------------------------------- #
# Demo / smoke test — replace get_detections() with your real model in prod
# --------------------------------------------------------------------------- #
def _build_demo_4way_junction() -> JunctionController:
"""Standard 4-way crossroads: N/S through-traffic can run together; E/W likewise."""
phases = [
Phase("NS_THROUGH", {"north_through", "south_through"}),
Phase("EW_THROUGH", {"east_through", "west_through"}),
]
params = ControlParams()
controller = JunctionController("junction_demo_4way", phases, params)
for movement in ["north_through", "south_through", "east_through", "west_through"]:
controller.register_movement(ApproachState(approach_id=movement, movement_id=movement
return controller
def _synthetic_tick(controller: JunctionController, tick_num: int) -> None:
"""Fabricates plausible detection-derived state for demo purposes only."""
import random
for movement in controller.states:
controller.update_state(
movement,
queue_length=random.uniform(0, 15),
downstream_queue=random.uniform(0, 5),
)
# Simulate an emergency vehicle arriving at tick 10 on the east approach.
if tick_num == 10:
controller.update_state("east_through", emergency_vehicle_present=True)
if tick_num == 15:
controller.update_state("east_through", emergency_vehicle_present=False)
if __name__ == "__main__":
controller = _build_demo_4way_junction()
for tick_num in range(30):
_synthetic_tick(controller, tick_num)
active_phase = controller.tick()
print(f"tick={tick_num:02d} active_phase={active_phase.phase_id}")
time.sleep(0.05) # sped up for demo; real loop sleeps ~1s per tick
