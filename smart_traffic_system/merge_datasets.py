import os
import shutil
import argparse
import yaml

# A unified master mapping
MASTER_CLASSES = {
    'car': 0,
    'motorcycle': 1, 
    'bike': 1,
    'two-wheeler': 1,
    'auto-rickshaw': 2,
    'rickshaw': 2,
    'bus': 3,
    'truck': 4,
    'heavy motor vehicle': 4,
    'ambulance': 5,
    'fire_truck': 6,
    'pedestrian': 7,
    'rider': 8
}

def auto_label_mumbai_frames(image_dir, label_dir, model_path="C:/Users/adnan/runs/detect/runs/mumbai_traffic/yolov8_mumbai_custom6/weights/best.pt"):
    """
    Uses the baseline model to generate YOLO labels for the raw Mumbai frames.
    """
    from ultralytics import YOLO
    import numpy as np
    model = YOLO(model_path)
    ensure_dir(label_dir)
    
    images = [f for f in os.listdir(image_dir) if f.endswith('.jpg')]
    for img_name in images:
        results = model(os.path.join(image_dir, img_name), conf=0.15)[0] # Lower conf for auto-labeling
        label_path = os.path.join(label_dir, img_name.replace('.jpg', '.txt'))
        with open(label_path, 'w') as f:
            for box in results.boxes:
                cls = int(box.cls[0])
                coords = box.xywhn[0].cpu().numpy()
                f.write(f"{cls} {coords[0]} {coords[1]} {coords[2]} {coords[3]}\n")
    print(f"Auto-labeled {len(images)} Mumbai frames.")

def merge_mumbai_booster(target_img_dir, target_lbl_dir, booster_img_dir, booster_lbl_dir, multiplier=20):
    """
    Oversamples the newly labeled Mumbai frames to increase their weight during training.
    """
    if not os.path.exists(booster_img_dir): return
    
    images = [f for f in os.listdir(booster_img_dir) if f.endswith('.jpg')]
    for img in images:
        for i in range(multiplier):
            new_name = f"mumbai_boost_{i}_{img}"
            shutil.copy(os.path.join(booster_img_dir, img), os.path.join(target_img_dir, new_name))
            src_lbl = os.path.join(booster_lbl_dir, img.replace('.jpg', '.txt'))
            if os.path.exists(src_lbl):
                shutil.copy(src_lbl, os.path.join(target_lbl_dir, new_name.replace('.jpg', '.txt')))
    
    print(f"Booster complete: {len(images) * multiplier} augmented Mumbai samples added to training set.")

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def normalize_yolo_labels(source_image_dir, source_label_dir, target_image_dir, target_label_dir, source_class_map):
    """
    Copies images and translates YOLO .txt labels to the MASTER_CLASSES IDs.
    """
    for img_name in os.listdir(source_image_dir):
        if not img_name.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
            
        base_name = os.path.splitext(img_name)[0]
        lbl_name = base_name + '.txt'
        src_lbl_path = os.path.join(source_label_dir, lbl_name)
        
        # Copy image
        shutil.copy(os.path.join(source_image_dir, img_name), os.path.join(target_image_dir, img_name))
        
        # Translate label if it exists
        if os.path.exists(src_lbl_path):
            with open(src_lbl_path, 'r') as f:
                lines = f.readlines()
            
            new_lines = []
            for line in lines:
                parts = line.strip().split()
                if not parts:
                    continue
                old_id = int(parts[0])
                # Find the string name for this old_id from the source's yaml/mapping
                for name, id_val in source_class_map.items():
                    if id_val == old_id:
                        class_name = name
                        break
                else:
                    continue # unknown class
                
                # If we care about this class in our master map
                if class_name.lower() in MASTER_CLASSES:
                    new_id = MASTER_CLASSES[class_name.lower()]
                    parts[0] = str(new_id)
                    new_lines.append(" ".join(parts) + "\n")
            
            with open(os.path.join(target_label_dir, lbl_name), 'w') as f:
                f.writelines(new_lines)


def create_yaml(output_dir):
    # Invert the dictionary for the YAML names array
    names_dict = {v: k for k, v in MASTER_CLASSES.items()}
    yaml_data = {
        'path': os.path.abspath(output_dir),
        'train': 'images/train',
        'val': 'images/val',
        'names': names_dict
    }
    yaml_path = os.path.join(output_dir, 'master_mumbai_dataset.yaml')
    with open(yaml_path, 'w') as f:
        yaml.dump(yaml_data, f, default_flow_style=False)
    print(f"Generated unified dataset config at: {yaml_path}")

def main():
    parser = argparse.ArgumentParser("Merge Multiple Traffic Datasets into a Unified YOLO format.")
    parser.add_argument('--iruvd', type=str, help="Path to extracted IRUVD dataset", required=True)
    parser.add_argument('--traffic_violation', type=str, help="Path to Traffic Violation dataset", required=True)
    parser.add_argument('--output', type=str, default='../datasets/mumbai_traffic', help="Where to output unified dataset")
    
    args = parser.parse_args()
    
    output_img_train = os.path.join(args.output, 'images/train')
    output_lbl_train = os.path.join(args.output, 'labels/train')
    output_img_val = os.path.join(args.output, 'images/val')
    output_lbl_val = os.path.join(args.output, 'labels/val')
    
    ensure_dir(output_img_train)
    ensure_dir(output_lbl_train)
    ensure_dir(output_img_val)
    ensure_dir(output_lbl_val)
    
    iruvd_map = {
        'trak': 0, 'cyclist': 1, 'bike': 2, 'tempo': 3, 'car': 4, 'zeep': 5, 'toto': 6,
        'e-rickshaw': 7, 'auto-rickshaw': 8, 'bus': 9, 'van': 10, 'cycle-rickshaw': 11,
        'person': 12, 'taxi': 13
    }
    
    # Map for Traffic Violation (only relevant traffic object classes)
    traffic_map = {
        'person': 0, 'car': 1, 'truck': 2, 'bus': 3, 'motorcycle': 4
    }
    
    print(f"Aggregating {args.iruvd}...")
    # Try multiple subfolder patterns
    if os.path.exists(os.path.join(args.iruvd, 'train/images')):
        normalize_yolo_labels(os.path.join(args.iruvd, 'train/images'), os.path.join(args.iruvd, 'train/labels'), output_img_train, output_lbl_train, iruvd_map)
        normalize_yolo_labels(os.path.join(args.iruvd, 'valid/images'), os.path.join(args.iruvd, 'valid/labels'), output_img_val, output_lbl_val, iruvd_map)
    elif os.path.exists(os.path.join(args.iruvd, 'images/train')):
        normalize_yolo_labels(os.path.join(args.iruvd, 'images/train'), os.path.join(args.iruvd, 'labels/train'), output_img_train, output_lbl_train, iruvd_map)
        normalize_yolo_labels(os.path.join(args.iruvd, 'images/val'), os.path.join(args.iruvd, 'labels/val'), output_img_val, output_lbl_val, iruvd_map)
    
    # Only aggregate violation if path exists and is valid
    if os.path.exists(os.path.join(args.traffic_violation, 'images/train')):
        print(f"Aggregating {args.traffic_violation}...")
        normalize_yolo_labels(os.path.join(args.traffic_violation, 'images/train'), os.path.join(args.traffic_violation, 'labels/train'), output_img_train, output_lbl_train, traffic_map)
        normalize_yolo_labels(os.path.join(args.traffic_violation, 'images/val'), os.path.join(args.traffic_violation, 'labels/val'), output_img_val, output_lbl_val, traffic_map)
    
    create_yaml(args.output)
    
    # NEW: Mumbai Booster Integration
    mumbai_raw_dir = os.path.join(args.output, 'raw_mumbai')
    mumbai_lbl_dir = os.path.join(args.output, 'raw_mumbai_labels')
    if os.path.exists(mumbai_raw_dir):
        print("Starting Mumbai Booster (Automatic Labeling + Oversampling)...")
        auto_label_mumbai_frames(mumbai_raw_dir, mumbai_lbl_dir)
        merge_mumbai_booster(output_img_train, output_lbl_train, mumbai_raw_dir, mumbai_lbl_dir)
        
    print("Consolidation Scripts Setup! Check the newly generated YAML.")

if __name__ == "__main__":
    main()
