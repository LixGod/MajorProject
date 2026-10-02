import os
import torch
from ultralytics import YOLO
from ultralytics.nn.tasks import DetectionModel

# Fix for PyTorch 2.6+ unpickling security check
torch.serialization.add_safe_globals([DetectionModel])

def test_model_load():
    model_path = "C:/Users/adnan/runs/detect/mumbai_hybrid_v1/weights/best.pt"
    
    if not os.path.exists(model_path):
        print(f"ERROR: Model file not found at {model_path}")
        return False
        
    print(f"Attempting to load model from {model_path}...")
    try:
        model = YOLO(model_path)
        print("SUCCESS: Model loaded successfully.")
        
        # Test basic properties
        print(f"Model Names: {model.names}")
        
    except Exception as e:
        print(f"FAILED: Could not load model. Error: {e}")
        return False
    
    return True

if __name__ == "__main__":
    test_model_load()
