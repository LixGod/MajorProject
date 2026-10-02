import cv2
import os

path = "test_traffic.mp4"
exists = os.path.exists(path)
size = os.path.getsize(path) if exists else 0
cap = cv2.VideoCapture(path)
opened = cap.isOpened()
cap.release()

print(f"Path: {path}")
print(f"Exists: {exists}")
print(f"Size: {size} bytes")
print(f"Opened: {opened}")
