#!/usr/bin/env python3
"""
Smart Traffic System — YOLO Detection Backend
Flask server serving vehicle detection using trained best.pt model.
"""
import os
import sys
import io
import base64
import tempfile
import traceback
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

# ── locate model ──────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
MODEL_PATH  = SCRIPT_DIR / ".." / "best.pt"   # sibling of smart-traffic-system/
if not MODEL_PATH.exists():
    MODEL_PATH = SCRIPT_DIR / "best.pt"        # fallback: same dir
MODEL_PATH = MODEL_PATH.resolve()

# ── class definitions ─────────────────────────────────────────────────────────
CLASS_NAMES   = ["car", "biker", "auto", "truck", "heavy_vehicle", "emergency_vehicle"]
CLASS_WEIGHTS = {
    "car":               1.0,
    "biker":             0.4,
    "auto":              0.8,
    "truck":             3.0,
    "heavy_vehicle":     3.5,
    "emergency_vehicle": 5.0,   # triggers signal pre-emption on frontend
}

# ── Flask setup ───────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# lazy-load model
_model = None

def get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        print(f"[backend] Loading model from: {MODEL_PATH}")
        _model = YOLO(str(MODEL_PATH))
        print("[backend] Model loaded ✓")
    return _model


# ── helpers ───────────────────────────────────────────────────────────────────
def run_detect(pil_image: Image.Image) -> dict:
    """Run YOLO inference on a PIL image, return structured result."""
    model = get_model()
    results = model.predict(source=pil_image, verbose=False, conf=0.25)[0]

    detections = []
    class_counts  = {}
    weighted_score = 0.0
    has_emergency  = False

    for box in results.boxes:
        cls_id  = int(box.cls[0])
        cls_name = CLASS_NAMES[cls_id] if cls_id < len(CLASS_NAMES) else f"class_{cls_id}"
        conf    = float(box.conf[0])
        xyxy    = box.xyxy[0].tolist()   # [x1, y1, x2, y2]
        weight  = CLASS_WEIGHTS.get(cls_name, 1.0)

        detections.append({
            "class": cls_name,
            "class_id": cls_id,
            "confidence": round(conf, 3),
            "weight": weight,
            "bbox": [round(v, 1) for v in xyxy],    # x1,y1,x2,y2
        })
        class_counts[cls_name] = class_counts.get(cls_name, 0) + 1
        weighted_score += weight
        if cls_name == "emergency_vehicle":
            has_emergency = True

    vehicle_count = len(detections)

    return {
        "detections": detections,
        "class_counts": class_counts,
        "vehicle_count": vehicle_count,
        "weighted_score": round(weighted_score, 2),
        "has_emergency": has_emergency,
        "image_size": list(pil_image.size),   # [W, H]
    }


def annotate_image(pil_image: Image.Image, detections: list) -> str:
    """Draw bounding boxes on image, return base64-encoded JPEG."""
    from PIL import ImageDraw, ImageFont
    import numpy as np

    img = pil_image.copy().convert("RGB")
    draw = ImageDraw.Draw(img)

    COLOR_MAP = {
        "car":               "#34D399",
        "biker":             "#60A5FA",
        "auto":              "#A78BFA",
        "truck":             "#FBBF24",
        "heavy_vehicle":     "#F87171",
        "emergency_vehicle": "#FF0000",
    }

    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        color = COLOR_MAP.get(det["class"], "#E7ECF2")
        lw    = max(2, int(min(img.width, img.height) / 200))
        draw.rectangle([x1, y1, x2, y2], outline=color, width=lw)

        label = f"{det['class']} {int(det['confidence']*100)}%"
        font_size = max(12, int(min(img.width, img.height) / 40))
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()

        bbox_text = draw.textbbox((x1, y1 - font_size - 4), label, font=font)
        draw.rectangle(bbox_text, fill=color)
        draw.text((x1, y1 - font_size - 4), label, fill="#0B0F14", font=font)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def pil_from_file_bytes(data: bytes, filename: str = "") -> Image.Image:
    """Open PIL image from raw bytes."""
    return Image.open(io.BytesIO(data)).convert("RGB")


# ── routes ────────────────────────────────────────────────────────────────────
@app.route("/api/status", methods=["GET"])
def status():
    model_loaded = _model is not None
    return jsonify({
        "status": "ok",
        "model_loaded": model_loaded,
        "model_path": str(MODEL_PATH),
        "classes": CLASS_NAMES,
        "class_weights": CLASS_WEIGHTS,
    })


@app.route("/api/preload", methods=["POST"])
def preload():
    """Force-load the model (call once on startup to warm up)."""
    try:
        get_model()
        return jsonify({"status": "ok", "message": "Model loaded successfully."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/detect/image", methods=["POST"])
def detect_image():
    """
    Detect vehicles in an uploaded image.
    Accepts: multipart/form-data with field 'file'
    Returns: JSON with detections + base64-annotated image
    """
    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    f = request.files["file"]
    try:
        img = pil_from_file_bytes(f.read(), f.filename)
    except Exception as e:
        return jsonify({"error": f"Could not decode image: {e}"}), 400

    try:
        result = run_detect(img)
        result["annotated_image"] = annotate_image(img, result["detections"])
        result["source_type"] = "image"
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/detect/video", methods=["POST"])
def detect_video():
    """
    Sample N frames from an uploaded video and return peak + per-frame results.
    Accepts: multipart/form-data with field 'file'
    Query param: frames (default 10)
    """
    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    f        = request.files["file"]
    n_frames = int(request.args.get("frames", 10))

    # Save to temp file (cv2 needs a real path)
    suffix = Path(f.filename).suffix or ".mp4"
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp_path = tmp.name
            f.save(tmp_path)
    except Exception as e:
        return jsonify({"error": f"Could not save video: {e}"}), 500

    try:
        import cv2
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return jsonify({"error": "Could not open video file. Ensure OpenCV supports this codec."}), 400

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames < 1:
            total_frames = n_frames  # fallback for streams
        fps     = cap.get(cv2.CAP_PROP_FPS) or 25
        step    = max(1, total_frames // n_frames)

        frame_results = []
        peak_result   = None

        for i in range(n_frames):
            frame_idx = min(i * step, total_frames - 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                continue
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img   = Image.fromarray(frame_rgb)
            res       = run_detect(pil_img)
            res["frame_index"] = frame_idx
            res["timestamp_s"] = round(frame_idx / fps, 2)

            # annotate only peak frame
            if peak_result is None or res["weighted_score"] > peak_result["weighted_score"]:
                peak_result = res
                peak_result["annotated_image"] = annotate_image(pil_img, res["detections"])

            frame_results.append({
                "frame_index":    res["frame_index"],
                "timestamp_s":    res["timestamp_s"],
                "vehicle_count":  res["vehicle_count"],
                "weighted_score": res["weighted_score"],
                "class_counts":   res["class_counts"],
                "has_emergency":  res["has_emergency"],
            })

        cap.release()

        return jsonify({
            "source_type":    "video",
            "frames_sampled": len(frame_results),
            "total_frames":   total_frames,
            "frame_results":  frame_results,
            "peak":           peak_result,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ── main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"[backend] Starting on http://localhost:{port}")
    print(f"[backend] Model path: {MODEL_PATH}")
    # Pre-load model on startup so first detection is fast
    try:
        get_model()
    except Exception as e:
        print(f"[backend] WARNING: Model preload failed: {e}")
    app.run(host="0.0.0.0", port=port, debug=False)
