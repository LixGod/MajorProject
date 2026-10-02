import cv2
import threading
import time
import math
import os
from flask import Flask, render_template, Response, jsonify, request
from werkzeug.utils import secure_filename

# STRICT CPU MODE: Bypasses the hanging CUDA driver on this machine
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ["YOLO_VERBOSE"] = "False"
os.environ["YOLO_CHECK_UPDATE"] = "False"

from vision_tracker import TrafficVision
from traffic_predictor import TrafficMLPredictor
from main import JunctionManager

app = Flask(__name__)

# Global State
global_state = {
    "active_road_id": "Road_1",
    "active_timer": 0,
    "roads": {},
    "category_counts": {
        "LMV": 0,
        "HMV": 0,
        "Auto Rickshaw": 0
    }
}

app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024 # 100MB

# Global state for dynamic source switching
source_config = {
    "video_path": None,
    "must_reload": False
}

# Selected Mumbai junction (key into MUMBAI_JUNCTIONS)
selected_junction_key = "weh_vile_parle"

latest_frame = None

def traffic_engine_thread():
    global latest_frame, global_state, source_config

    print("Starting traffic engine...", flush=True)

    while True:
        try:
            current_path = source_config["video_path"]

            if current_path is None:
                source_config["must_reload"] = False
                time.sleep(0.5)
                continue

            cap = cv2.VideoCapture(current_path)
            print(f"Video opened: {current_path} (Success: {cap.isOpened()})", flush=True)

            vision       = TrafficVision()
            ml_predictor = TrafficMLPredictor()
            ml_predictor.set_junction(selected_junction_key)

            fps = int(cap.get(cv2.CAP_PROP_FPS))
            if fps == 0: fps = 30
            time_step = 1.0 / fps

            frame_idx = 0
            source_config["must_reload"] = False

            while not source_config["must_reload"]:
                if not cap.isOpened():
                    break

                ret, frame = cap.read()
                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

                if not vision.zones:
                    h, w = frame.shape[:2]
                    vision.setup_zones(w, h, camera_id="default_camera")

                annotated_frame, zone_counts, emergency_presence, cats = vision.process_frame(frame)
                is_emergency = any(emergency_presence.values())

                # ── Zone-based timer: predict once → countdown → predict again ──
                remaining = ml_predictor.tick_timer(zone_counts, is_emergency, time_step)

                global_state["active_timer"]       = round(remaining, 1)
                global_state["green_time_max"]     = round(ml_predictor._current_green_time or 60, 1)
                global_state["category_counts"]    = cats
                global_state["zone_counts"]        = zone_counts
                global_state["is_emergency"]       = is_emergency

                ret2, buffer = cv2.imencode('.jpg', annotated_frame)
                if ret2:
                    latest_frame = buffer.tobytes()
                    if frame_idx % 30 == 0:
                        print(f"[LIVE] {current_path} | Timer: {remaining:.1f}s / {ml_predictor._current_green_time:.1f}s | Zones: {zone_counts}", flush=True)
                    frame_idx += 1

                time.sleep(0.005)

            cap.release()
            print("Reloading engine for new source/config...", flush=True)

        except Exception as e:
            import traceback
            print(f"ENGINE ERROR: {e}\n{traceback.format_exc()}", flush=True)
            time.sleep(2)


@app.route('/')
def index():
    return render_template('index.html')

def gen_frames():
    global latest_frame
    while True:
        if latest_frame is not None:
            # Standard RFC 2046 MJPEG Format
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + latest_frame + b'\r\n')
        time.sleep(0.01)

@app.route('/video_feed')
def video_feed():
    return Response(gen_frames(), 
                    mimetype='multipart/x-mixed-replace; boundary=frame',
                    headers={'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0'})

@app.route('/state_feed')
def state_feed():
    from traffic_predictor import MUMBAI_JUNCTIONS
    j = MUMBAI_JUNCTIONS.get(selected_junction_key, {})
    return jsonify({
        **global_state,
        "junction_name": j.get("name", "Unknown"),
        "junction_area": j.get("area", ""),
    })

@app.route('/junctions', methods=['GET'])
def get_junctions():
    from traffic_predictor import MUMBAI_JUNCTIONS
    return jsonify(MUMBAI_JUNCTIONS)

@app.route('/set_junction', methods=['POST'])
def set_junction():
    global selected_junction_key
    data = request.json
    key = data.get("key")
    from traffic_predictor import MUMBAI_JUNCTIONS
    if key not in MUMBAI_JUNCTIONS:
        return jsonify({"error": "Unknown junction key"}), 400
    selected_junction_key = key
    # Reload engine so ml_predictor picks up new junction
    source_config["must_reload"] = True
    print(f"[JUNCTION] Switched to: {MUMBAI_JUNCTIONS[key]['name']}", flush=True)
    return jsonify({"success": True, "junction": MUMBAI_JUNCTIONS[key]})

@app.route('/upload', methods=['POST'])
def upload_file():
    global source_config
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if file:
        filename = secure_filename(file.filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)
        
        # Trigger reload of the AI engine with the new video
        source_config["video_path"] = save_path
        source_config["must_reload"] = True
        return jsonify({"success": True, "filename": filename})

@app.route('/save_zones', methods=['POST'])
def save_zones():
    global source_config
    try:
        data = request.json
        # Format: {"Z1": [[x,y],...], "Z2": [...]}
        config_path = os.path.join("configs", "default_camera.json")
        os.makedirs("configs", exist_ok=True)
        with open(config_path, 'w') as f:
            import json
            json.dump(data, f, indent=4)
        
        # Trigger reload to pick up new zone definitions
        source_config["must_reload"] = True
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/reset_zones', methods=['POST'])
def reset_zones():
    global source_config
    try:
        config_path = os.path.join("configs", "default_camera.json")
        if os.path.exists(config_path):
            os.remove(config_path)
        source_config["must_reload"] = True
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/stop_feed', methods=['POST'])
def stop_feed():
    global source_config, latest_frame
    source_config["video_path"] = None
    source_config["must_reload"] = True
    latest_frame = None
    return jsonify({"success": True})


if __name__ == '__main__':
    # Start Flask in a background thread to prevent PyTorch deadlocks on Windows
    flask_thread = threading.Thread(
        target=lambda: app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False), 
        daemon=True
    )
    flask_thread.start()

    
    # Run the rigorous Deep Learning inference on the MAIN thread to heavily stabilize OpenCV/CUDA
    traffic_engine_thread()
