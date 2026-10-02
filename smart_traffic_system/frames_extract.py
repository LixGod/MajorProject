import cv2
import os

# 📁 Folder containing your videos
VIDEO_FOLDER = "C:/Users/adnan/Desktop/Mumbai/videos"

# 📁 Output folder
OUTPUT_FOLDER = "C:/Users/adnan/Desktop/Mumbai/frames"

FRAME_SKIP = 10                   # save every 5th frame (adjust 3–10)
IMG_SIZE = (1024,1024)            # YOLO-friendly size (or 1024, 1024 for better accuracy)

ALLOWED_EXTENSIONS = ('.mp4', '.webm', '.avi')

# =========================
# CREATE OUTPUT DIRECTORY
# =========================
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# =========================
# GET VIDEO FILES
# =========================
video_files = [
    f for f in os.listdir(VIDEO_FOLDER)
    if f.lower().endswith(ALLOWED_EXTENSIONS)
]

frame_id = 0

# =========================
# PROCESS EACH VIDEO
# =========================
for video in video_files:
    video_path = os.path.join(VIDEO_FOLDER, video)
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(f"❌ Cannot open: {video}")
        continue

    print(f"🎥 Processing: {video}")

    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Skip frames to reduce redundancy
        if frame_count % FRAME_SKIP == 0:

            # Resize frame for YOLO training
            frame = cv2.resize(frame, IMG_SIZE)

            # Save frame
            frame_name = f"{os.path.splitext(video)[0]}_{frame_id}.jpg"
            frame_path = os.path.join(OUTPUT_FOLDER, frame_name)

            cv2.imwrite(frame_path, frame)
            frame_id += 1

        frame_count += 1

    cap.release()

print(f"\n✅ DONE! Total frames saved: {frame_id}")
print(f"📁 Saved in: {OUTPUT_FOLDER}")