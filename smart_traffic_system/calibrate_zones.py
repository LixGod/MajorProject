import cv2
import json
import numpy as np
import argparse
import os

class ZoneCalibrator:
    def __init__(self, video_path, camera_id="default_camera"):
        self.video_path = video_path
        self.camera_id = camera_id
        self.zones = [
            "Z1", 
            "Z2", 
            "Z3", 
            "Z4"
        ]
        self.current_zone_idx = 0
        self.points = []
        self.all_zones_config = {}
        
        # Load first frame
        cap = cv2.VideoCapture(video_path)
        ret, self.frame = cap.read()
        cap.release()
        
        if not ret:
             print(f"Error: Could not read video file {video_path}")
             exit(1)
             
        self.display_frame = self.frame.copy()

    def mouse_callback(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            self.points.append([x, y])
            # Draw point
            cv2.circle(self.display_frame, (x, y), 5, (0, 255, 0), -1)
            cv2.imshow("Zone Calibrator", self.display_frame)
            
            if len(self.points) == 4:
                # Store zone
                zone_name = self.zones[self.current_zone_idx]
                self.all_zones_config[zone_name] = list(self.points)
                
                # Draw polygon
                pts = np.array(self.points, np.int32)
                cv2.polylines(self.display_frame, [pts], True, (255, 0, 0), 2)
                cv2.putText(self.display_frame, zone_name, (self.points[0][0], self.points[0][1] - 10), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                
                print(f"Saved {zone_name}")
                self.points = []
                self.current_zone_idx += 1
                
                if self.current_zone_idx < len(self.zones):
                    print(f"Next: Define points for {self.zones[self.current_zone_idx]}")
                else:
                    print("All zones defined! Press 'S' to save and exit.")

    def run(self):
        cv2.namedWindow("Zone Calibrator")
        cv2.setMouseCallback("Zone Calibrator", self.mouse_callback)
        
        print(f"Calibration for: {self.video_path}")
        print(f"Current: Define 4 points (clockwise) for {self.zones[self.current_zone_idx]}")
        
        while True:
            cv2.imshow("Zone Calibrator", self.display_frame)
            key = cv2.waitKey(1) & 0xFF
            
            if key == ord('s') and self.current_zone_idx == len(self.zones):
                self.save_config()
                break
            elif key == 27: # ESC
                print("Calibration cancelled.")
                break
        
        cv2.destroyAllWindows()

    def save_config(self):
        out_dir = "configs"
        if not os.path.exists(out_dir):
            os.makedirs(out_dir)
            
        out_path = os.path.join(out_dir, f"{self.camera_id}.json")
        with open(out_path, 'w') as f:
            json.dump(self.all_zones_config, f, indent=4)
        print(f"Configuration for '{self.camera_id}' saved successfully to {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Interactive Zone Calibration Tool")
    parser.add_argument("--video", type=str, default="test_traffic.mp4", help="Path to video file")
    parser.add_argument("--camera_id", type=str, default="default_camera", help="Unique ID for this camera/junction")
    args = parser.parse_args()
    
    if not os.path.exists(args.video):
        print(f"Error: Video file {args.video} not found.")
    else:
        calibrator = ZoneCalibrator(args.video, args.camera_id)
        calibrator.run()
