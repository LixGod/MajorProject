import os
import shutil
import random
import yaml

def subsample_dataset(source_dir, target_dir, max_images=1200):
    images_train = os.path.join(source_dir, "images/train")
    labels_train = os.path.join(source_dir, "labels/train")
    
    target_img_dir = os.path.join(target_dir, "images/train")
    target_lbl_dir = os.path.join(target_dir, "labels/train")
    os.makedirs(target_img_dir, exist_ok=True)
    os.makedirs(target_lbl_dir, exist_ok=True)
    
    # 1. Get all images
    all_images = [f for f in os.listdir(images_train) if f.endswith('.jpg')]
    
    # 2. Prioritize Mumbai Booster images
    mumbai_images = [f for f in all_images if "mumbai_boost" in f]
    other_images = [f for f in all_images if "mumbai_boost" not in f]
    
    # 3. Select subset
    num_others = max_images - len(mumbai_images)
    if num_others > 0:
        selected_others = random.sample(other_images, min(len(other_images), num_others))
    else:
        selected_others = []
        
    final_selection = mumbai_images + selected_others
    random.shuffle(final_selection)
    
    # 4. Copy to target
    for img_name in final_selection:
        lbl_name = img_name.replace('.jpg', '.txt')
        shutil.copy(os.path.join(images_train, img_name), os.path.join(target_img_dir, img_name))
        
        src_lbl = os.path.join(labels_train, lbl_name)
        if os.path.exists(src_lbl):
            shutil.copy(src_lbl, os.path.join(target_lbl_dir, lbl_name))
            
    # 5. Copy validation set (keep it small too)
    images_val = os.path.join(source_dir, "images/val")
    labels_val = os.path.join(source_dir, "labels/val")
    os.makedirs(os.path.join(target_dir, "images/val"), exist_ok=True)
    os.makedirs(os.path.join(target_dir, "labels/val"), exist_ok=True)
    
    val_images = os.listdir(images_val)[:200]
    for img_name in val_images:
        lbl_name = img_name.replace('.jpg', '.txt')
        shutil.copy(os.path.join(images_val, img_name), os.path.join(target_dir, f"images/val/{img_name}"))
        if os.path.exists(os.path.join(labels_val, lbl_name)):
            shutil.copy(os.path.join(labels_val, lbl_name), os.path.join(target_dir, f"labels/val/{lbl_name}"))
            
    print(f"Sub-sampled dataset created at {target_dir} with {len(final_selection)} training images.")

if __name__ == "__main__":
    subsample_dataset("../datasets/mumbai_traffic", "../datasets/mumbai_traffic_fast")
