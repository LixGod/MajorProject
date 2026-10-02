import cv2
from ultralytics import YOLO

cap = cv2.VideoCapture('test_traffic.mp4')
model = YOLO("yolov8n.pt")

for i in range(1, 60):
    ret, frame = cap.read()
    if not ret: break
    if i % 10 == 0:
        results = model(frame, verbose=False)
        print(f"Frame {i}: detected {len(results[0])} objects")
