/**
 * calibration.js
 * Zone calibration: per-approach multiplier persisted to localStorage.
 * Factors account for road width, priority (arterial vs local), school/hospital zones.
 */

const Calibration = (() => {
  const STORAGE_KEY = "jv_calibration_v2";
  const DEFAULT_CAL  = 1.0;

  const PRESETS = {
    arterial:  { label: "Arterial Road",       value: 1.5 },
    local:     { label: "Local Road",           value: 0.7 },
    school:    { label: "School Zone",          value: 1.2, ped_boost: 1.5 },
    hospital:  { label: "Hospital Zone",        value: 1.3, emergency_boost: 2.0 },
    flyover:   { label: "Under Flyover",        value: 0.8 },
    highway:   { label: "Highway Approach",     value: 2.0 },
    default:   { label: "Standard",             value: 1.0 },
  };

  let _data = {};   // { [code]: { factor: number, preset: string } }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _data = raw ? JSON.parse(raw) : {};
    } catch (e) { _data = {}; }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); }
    catch (e) { console.warn("Calibration save failed:", e); }
  }

  function get(code) {
    return (_data[code]?.factor ?? DEFAULT_CAL);
  }

  function set(code, factor, preset = "default") {
    _data[code] = { factor: +factor.toFixed(2), preset };
    save();
  }

  function reset(code) {
    delete _data[code];
    save();
  }

  function resetAll() {
    _data = {};
    save();
  }

  function getAll() { return { ..._data }; }

  load();
  return { get, set, reset, resetAll, getAll, PRESETS };
})();
