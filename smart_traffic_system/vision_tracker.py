import cv2
import numpy as np
from ultralytics import YOLO
import supervision as sv
import json
import os
import torch
from ultralytics.nn.tasks import DetectionModel

# Stability: Full Offline Mode & Single-Threaded Execution
os.environ["YOLO_VERBOSE"] = "False"
os.environ["YOLO_CHECK_UPDATE"] = "False"
torch.set_num_threads(1)

# Fix for PyTorch 2.6+ unpickling security check
torch.serialization.add_safe_globals([DetectionModel])

class TrafficVision:
    def __init__(self, 
                 primary_path="C:/Users/adnan/runs/detect/mumbai_hybrid_v1/weights/best.pt", 
                 secondary_path="C:/Users/adnan/runs/detect/mumbai_traffic_custom6/weights/best.pt",
                 confidence=0.10):
        # Loading the Mumbai-specific custom YOLOv8 models
        print(f"AI: [ENSEMBLE MODE] Loading Models...", flush=True)
        print(f"   -> Primary: {primary_path}")
        print(f"   -> Secondary: {secondary_path}")
        
        self.primary_model = YOLO(primary_path, task='detect')
        self.secondary_model = YOLO(secondary_path, task='detect')
        
        print(f"AI: Models loaded successfully.", flush=True)
        self.confidence = confidence
        
        # Primary Model Mapping (Hybrid)
        # 0: car, 1: taxi, 2: best_bus, 3: bus, 4: motorcycle, 5: truck, 6: rickshaw
        self.primary_vehicle_ids = [0, 1, 2, 3, 4, 5, 6]
        
        # Secondary Model Mapping (Previous)
        # 0: car, 1: kaali_peeli, 2: autorickshaw, 3: motorcycle, 4: best_bus, 5: ambulance, 6: fire_truck
        self.secondary_vehicle_ids = [0, 1, 2, 3, 4, 5, 6]
        
        self.tracker = sv.ByteTrack()
        self.box_annotator = sv.BoxAnnotator(thickness=2)
        self.label_annotator = sv.LabelAnnotator(text_scale=0.5, text_thickness=1)
        
        # Dynamically set zones based on frame resolution
        self.zones = {}
        self.zone_annotators = {}

    def setup_zones(self, frame_width, frame_height, camera_id="default_camera"):
        """
        Setup polygons representing the 4 zones.
        Loads from configs/{camera_id}.json if it exists, else uses default 2x2 grid.
        """
        config_path = os.path.join("configs", f"{camera_id}.json")
        if os.path.exists(config_path):
            print(f"Loading custom zone configuration for '{camera_id}' from {config_path}...")
            with open(config_path, 'r') as f:
                config = json.load(f)
            polygons = {name: np.array(pts, np.int32) for name, pts in config.items()}
        else:
            print(f"Warning: No configuration found for '{camera_id}'. Using default 2x2 grid calibration.")
            polygons = {
                "Z1": np.array([
                    [0, int(frame_height*0.7)],
                    [int(frame_width*0.5), int(frame_height*0.7)],
                    [int(frame_width*0.5), frame_height],
                    [0, frame_height]
                ]),
                "Z2": np.array([
                    [int(frame_width*0.5), int(frame_height*0.7)],
                    [frame_width, int(frame_height*0.7)],
                    [frame_width, frame_height],
                    [int(frame_width*0.5), frame_height]
                ]),
                "Z3": np.array([
                    [int(frame_width*0.1), int(frame_height*0.3)],
                    [int(frame_width*0.5), int(frame_height*0.3)],
                    [int(frame_width*0.5), int(frame_height*0.7)],
                    [int(frame_width*0.1), int(frame_height*0.7)]
                ]),
                "Z4": np.array([
                    [int(frame_width*0.5), int(frame_height*0.3)],
                    [int(frame_width*0.9), int(frame_height*0.3)],
                    [int(frame_width*0.9), int(frame_height*0.7)],
                    [int(frame_width*0.5), int(frame_height*0.7)]
                ])
            }

        for zone_name, polygon in polygons.items():
            zone = sv.PolygonZone(polygon=polygon, frame_resolution_wh=(frame_width, frame_height))
            annotator = sv.PolygonZoneAnnotator(zone=zone, color=sv.Color.white(), thickness=2, text_thickness=1, text_scale=0.5)
            self.zones[zone_name] = zone
            self.zone_annotators[zone_name] = annotator


    def process_frame(self, frame):
        """
        Process a single video frame. Returns annotated frame and zone statistics.
        """
        if not self.zones:
            h, w = frame.shape[:2]
            self.setup_zones(w, h)

        # --- 1. Primary Model Inference (Hybrid) ---
        res_p = self.primary_model.predict(
            source=frame, verbose=False, conf=self.confidence,
            device='cpu', workers=0, task='detect'
        )[0]
        det_p = sv.Detections.from_ultralytics(res_p)
        
        # --- 2. Secondary Model Inference (Previous) ---
        res_s = self.secondary_model.predict(
            source=frame, verbose=False, conf=self.confidence,
            device='cpu', workers=0, task='detect'
        )[0]
        det_s = sv.Detections.from_ultralytics(res_s)

        # --- 3. Unified Class Mapping ---
        # Both models now share the same IDs: 
        # 0: car, 1: taxi, 2: best_bus, 3: bus, 4: motorcycle, 5: truck, 6: rickshaw
        
        # We will use a shared "Canonical" ID for the UI:
        # 0: Car, 1: Taxi, 2: Bus, 3: Motorcycle, 4: Truck, 5: Rickshaw
        
        def map_ids(ids):
            mapped = []
            for cid in ids:
                if cid in (0, 1): mapped.append(0) # Car/Taxi
                elif cid in (2, 3): mapped.append(2) # Bus
                elif cid == 4: mapped.append(3) # Moto
                elif cid == 5: mapped.append(4) # Truck
                elif cid == 6: mapped.append(5) # Rickshaw
                else: mapped.append(cid)
            return np.array(mapped)

        det_p.class_id = map_ids(det_p.class_id)
        det_s.class_id = map_ids(det_s.class_id)

        # --- 4. Merge and NMS ---
        detections = sv.Detections.merge([det_p, det_s])
        
        # Apply NMS to remove overlapping boxes between the two models
        detections = detections.with_nms(threshold=0.5)

        # Filter out Motorcycles (Canonical ID 3) and any other unwanted classes
        mask = np.isin(detections.class_id, [0, 1, 2, 4, 5, 6])
        detections = detections[mask]

        # Map back to names for labeling
        canonical_names = {
            0: "LMV", 1: "LMV", 2: "HMV", 4: "HMV", 5: "Auto Rickshaw", 6: "Emergency"
        }

        # Track detections
        detections = self.tracker.update_with_detections(detections)

        zone_counts = {}
        emergency_presence = {}

        for zone_name, zone in self.zones.items():
            is_inside = zone.trigger(detections=detections)
            zone_detections = detections[is_inside]
            
            # Count only mapped vehicle types (excluding Emergency)
            vehicle_mask = np.isin(zone_detections.class_id, [0, 1, 2, 4, 5])
            valid_vehicles = zone_detections[vehicle_mask]
            
            zone_counts[zone_name] = len(valid_vehicles)
            has_emergency = np.any(zone_detections.class_id == 6)
            emergency_presence[zone_name] = has_emergency

        # Annotate frame
        annotated_frame = self.box_annotator.annotate(scene=frame.copy(), detections=detections)

        category_counts = {
            "LMV": 0,
            "HMV": 0,
            "Auto Rickshaw": 0
        }

        # Build labels using canonical names
        labels = []
        for class_id in detections.class_id:
            cid = int(class_id)
            class_name = canonical_names.get(cid, str(cid))
            labels.append(class_name)
            
            if cid in (0, 1): category_counts["LMV"] += 1
            elif cid == 5: category_counts["Auto Rickshaw"] += 1
            elif cid in (2, 4): category_counts["HMV"] += 1

        annotated_frame = self.label_annotator.annotate(
            scene=annotated_frame, detections=detections, labels=labels
        )

        for lane_name, annotator in self.zone_annotators.items():
            if emergency_presence.get(lane_name, False):
                annotator.color = sv.Color.red()
            else:
                annotator.color = sv.Color.white()
            annotated_frame = annotator.annotate(scene=annotated_frame)

        return annotated_frame, zone_counts, emergency_presence, category_counts
