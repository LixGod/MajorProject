import cv2
import numpy as np
from ultralytics import YOLO
import supervision as sv
import torch
from ultralytics.nn.tasks import DetectionModel

# Fix for PyTorch 2.6+ unpickling security check
torch.serialization.add_safe_globals([DetectionModel])

def debug_inference():
    model_path = "C:/Users/adnan/runs/detect/train2/weights/best.pt"
    video_path = "test_traffic.mp4"
    
    model = YOLO(model_path)
    cap = cv2.VideoCapture(video_path)
    
    ret, frame = cap.read()
    if not ret:
        print("Failed to read video")
        return

    # Try raw inference
    results = model.predict(source=frame, conf=0.20, device='cpu')[0]
    detections = sv.Detections.from_ultralytics(results)
    
    print(f"Total Raw Detections: {len(detections)}")
    for i in range(len(detections)):
        class_id = detections.class_id[i]
        conf = detections.confidence[i]
        name = model.names[class_id]
        print(f"Detection {i}: {name} (conf: {conf:.2f})")

    # Annotate and save for inspection
    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()
    
    labels = [f"{model.names[cid]} {conf:.2f}" for cid, conf in zip(detections.class_id, detections.confidence)]
    
    annotated_frame = box_annotator.annotate(scene=frame.copy(), detections=detections)
    annotated_frame = label_annotator.annotate(scene=annotated_frame, detections=detections, labels=labels)
    
    cv2.imwrite("debug_detection.jpg", annotated_frame)
    print("Saved debug_detection.jpg")

    cap.release()

if __name__ == "__main__":
    debug_inference()
