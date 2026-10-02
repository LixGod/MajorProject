import numpy as np
import pandas as pd
import os
import pickle
import json
import time
import math
from datetime import datetime
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

# ─────────────────────────────────────────────────────────────
# MUMBAI JUNCTIONS DICTIONARY
# lat, lon, name, typical_peak_vehicles
# ─────────────────────────────────────────────────────────────
MUMBAI_JUNCTIONS = {
    "cst_junction": {
        "name": "CST Junction",
        "lat": 18.9396, "lon": 72.8354,
        "area": "Fort / CST"
    },
    "haji_ali": {
        "name": "Haji Ali Junction",
        "lat": 18.9774, "lon": 72.8105,
        "area": "Mahalaxmi"
    },
    "dadar_tt": {
        "name": "Dadar TT Circle",
        "lat": 19.0178, "lon": 72.8478,
        "area": "Dadar"
    },
    "sion": {
        "name": "Sion Junction",
        "lat": 19.0400, "lon": 72.8550,
        "area": "Sion"
    },
    "bandra_turner": {
        "name": "Bandra Turner Road",
        "lat": 19.0596, "lon": 72.8295,
        "area": "Bandra West"
    },
    "juhu_circle": {
        "name": "Juhu Circle",
        "lat": 19.1075, "lon": 72.8263,
        "area": "Juhu"
    },
    "andheri_east": {
        "name": "Andheri East Junction",
        "lat": 19.1136, "lon": 72.8697,
        "area": "Andheri East"
    },
    "weh_vile_parle": {
        "name": "WEH Vile Parle",
        "lat": 19.0990, "lon": 72.8493,
        "area": "Western Express Highway"
    },
    "powai_lake": {
        "name": "Powai Lake Junction",
        "lat": 19.1176, "lon": 72.9060,
        "area": "Powai"
    },
    "thane_station": {
        "name": "Thane Station Road",
        "lat": 19.1815, "lon": 72.9755,
        "area": "Thane"
    },
    "kurla_junction": {
        "name": "Kurla Junction",
        "lat": 19.0726, "lon": 72.8796,
        "area": "Kurla"
    },
    "borivali_station": {
        "name": "Borivali Station Road",
        "lat": 19.2288, "lon": 72.8573,
        "area": "Borivali"
    },
    "marine_drive": {
        "name": "Marine Drive North",
        "lat": 18.9444, "lon": 72.8234,
        "area": "Marine Drive"
    },
    "worli_naka": {
        "name": "Worli Naka",
        "lat": 19.0105, "lon": 72.8160,
        "area": "Worli"
    },
    "custom": {
        "name": "Custom Location",
        "lat": 19.0760, "lon": 72.8777,
        "area": "Mumbai"
    }
}


class TrafficMLPredictor:
    def __init__(self, model_path="traffic_rf_hybrid.pkl", force_retrain=False):
        self.model_path = model_path
        self.force_retrain = force_retrain
        self.secrets_path = "configs/secrets.json"
        self.api_key = self._load_api_key()
        self.junctions = MUMBAI_JUNCTIONS

        # Active junction (updated from dashboard)
        self.active_junction = "weh_vile_parle"

        self.feature_cols = [
            "vision_pressure",
            "city_congestion",
            "city_speed",
            "hour",
            "day_of_week",
            "is_emergency"
        ]

        # Timer state machine
        self._current_green_time = None   # None = no timer yet
        self._timer_start = None
        self._elapsed = 0.0

        self.model = None
        self._load_or_train_model()

    def set_junction(self, junction_key):
        """Set active junction from the dashboard selection."""
        if junction_key in self.junctions:
            self.active_junction = junction_key
            print(f"[JUNCTION] Active junction set to: {self.junctions[junction_key]['name']}", flush=True)

    def get_active_lat_lon(self):
        j = self.junctions.get(self.active_junction, self.junctions["weh_vile_parle"])
        return j["lat"], j["lon"]

    def _load_api_key(self):
        try:
            with open(self.secrets_path, "r") as f:
                return json.load(f).get("tomtom_api_key")
        except:
            return None

    def get_real_traffic(self, lat, lon):
        """Fetch TomTom real traffic, fail gracefully."""
        if not self.api_key:
            return None, None
        try:
            import requests
            url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
            r = requests.get(url, params={"key": self.api_key, "point": f"{lat},{lon}"}, timeout=2)
            data = r.json().get("flowSegmentData", {})
            speed = data.get("currentSpeed", 30)
            free_speed = data.get("freeFlowSpeed", 40)
            congestion = 1 - (speed / free_speed) if free_speed > 0 else 0
            return speed, congestion
        except Exception as e:
            return None, None

    def _build_hybrid_dataset(self, samples=2000):
        print("Building Hybrid Mumbai Dataset...")
        data = []
        now = datetime.now()
        for _ in range(samples):
            h = np.random.randint(0, 24)
            d = np.random.randint(0, 7)
            is_peak = (9 <= h <= 11) or (17 <= h <= 20)
            v_pressure = np.random.randint(40, 160) if is_peak else np.random.randint(5, 60)
            is_emergency = np.random.choice([0, 1], p=[0.97, 0.03])
            c_congestion = np.random.uniform(0.6, 0.95) if is_peak else np.random.uniform(0.1, 0.5)
            c_speed = 40 * (1 - c_congestion) + np.random.normal(0, 2)
            c_speed = np.clip(c_speed, 5, 60)
            target_time = 15 + (v_pressure * 0.3) + (c_congestion * 40) + (is_emergency * 40)
            target_time = np.clip(target_time, 15, 120)
            data.append([v_pressure, c_congestion, c_speed, h, d, is_emergency, target_time])
        return pd.DataFrame(data, columns=self.feature_cols + ["target_time"])

    def _load_or_train_model(self):
        if os.path.exists(self.model_path) and not self.force_retrain:
            with open(self.model_path, "rb") as f:
                self.model = pickle.load(f)
            return

        print("Training Hybrid ML Model...")
        df = self._build_hybrid_dataset()
        X, y = df[self.feature_cols], df["target_time"]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)
        self.model = Pipeline([
            ('scaler', StandardScaler()),
            ('rf', RandomForestRegressor(n_estimators=150, max_depth=12, random_state=42))
        ])
        self.model.fit(X_train, y_train)
        print(f"Model Score: {self.model.score(X_test, y_test):.3f}")
        with open(self.model_path, "wb") as f:
            pickle.dump(self.model, f)

    def predict_green_time(self, z1, z2, z3, z4, is_emergency=False, lat=None, lon=None):
        """Predict a new green light duration from current zone vehicle counts."""
        if lat is None or lon is None:
            lat, lon = self.get_active_lat_lon()

        v_pressure = z1 + z2 + z3 + z4
        now = datetime.now()

        speed, congestion = self.get_real_traffic(lat, lon)
        if speed is None:
            is_peak = (9 <= now.hour <= 11) or (17 <= now.hour <= 20)
            congestion = 0.8 if is_peak else 0.3
            speed = 40 * (1 - congestion)

        X_infer = pd.DataFrame({
            "vision_pressure": [v_pressure],
            "city_congestion": [congestion],
            "city_speed": [speed],
            "hour": [now.hour],
            "day_of_week": [now.weekday()],
            "is_emergency": [int(is_emergency)]
        })

        pred = self.model.predict(X_infer)[0]

        junction_name = self.junctions.get(self.active_junction, {}).get("name", "Unknown")
        print(f"[ML] Junction: {junction_name} | Pressure: {v_pressure} | Congestion: {congestion:.2f} | Pred: {pred:.1f}s", flush=True)

        if is_emergency:
            return 120.0
        return float(np.clip(pred, 15, 120))

    def tick_timer(self, zone_counts, is_emergency, time_step):
        """
        Zone-based timer state machine.
        - Predicts a new timer once when timer reaches 0 (or on first call).
        - Counts down the timer each tick.
        - Returns (remaining_seconds, did_just_predict)
        """
        z_vals = list(zone_counts.values()) + [0] * (4 - len(zone_counts))
        z1, z2, z3, z4 = z_vals[0], z_vals[1], z_vals[2], z_vals[3]

        # First call or timer expired → predict new green time
        if self._current_green_time is None or self._elapsed >= self._current_green_time:
            new_time = self.predict_green_time(z1, z2, z3, z4, is_emergency)
            self._current_green_time = new_time
            self._elapsed = 0.0
            print(f"[TIMER] New green time predicted: {new_time:.1f}s", flush=True)

        self._elapsed += time_step
        remaining = max(0.0, self._current_green_time - self._elapsed)
        return remaining


if __name__ == "__main__":
    predictor = TrafficMLPredictor(force_retrain=True)
    print("\n--- HYBRID MODEL TEST ---")
    print("Normal (Vision Count 40):", predictor.predict_green_time(10, 10, 10, 10))
    print("Heavy (Vision Count 120):", predictor.predict_green_time(30, 30, 30, 30))
    print("Emergency Override:", predictor.predict_green_time(10, 10, 10, 10, True))
