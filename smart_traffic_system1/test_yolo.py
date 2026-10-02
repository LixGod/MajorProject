import cv2
from ultralytics import YOLO

cap = cv2.VideoCapture('test_traffic.mp4')
ret, frame = cap.read()
print(f"Read frame: {ret}")

model = YOLO("C:/Users/adnan/runs/detect/runs/mumbai_traffic/yolov8_mumbai_fast_stable/weights/best.pt")
print("Model loaded")

results = model(frame)
print(f"Detected {len(results[0])} objects")
