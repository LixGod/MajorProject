from ultralytics import YOLO
import os

model_path = "C:/Users/adnan/runs/detect/mumbai_hybrid_v1/weights/best.pt"
if os.path.exists(model_path):
    print(f"Loading model from {model_path}...")
    model = YOLO(model_path)
    print("Model loaded successfully!")
    print("Classes:", model.names)
else:
    print(f"Error: Model not found at {model_path}")
