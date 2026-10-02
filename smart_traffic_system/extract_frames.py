import cv2
import os

def extract_frames(video_path, output_dir, interval=5):
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found.")
        return
    
    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    count = 0
    saved_count = 0
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        if count % interval == 0:
            out_path = os.path.join(output_dir, f"frame_{count:04d}.jpg")
            cv2.imwrite(out_path, frame)
            saved_count += 1
            
        count += 1
        
    cap.release()
    print(f"Extraction complete! Saved {saved_count} frames to {output_dir}")

if __name__ == "__main__":
    extract_frames("test_traffic.mp4", "../datasets/mumbai_traffic/raw_mumbai")
