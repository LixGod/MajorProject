from ultralytics import YOLO
import argparse
import os

def train_model(data_yaml, epochs=50, imgsz=640, batch=16, custom_model=None):
    """
    Trains a YOLOv8 model locally using the specified true dataset.
    """
    print(f"--- Starting local training on dataset: {data_yaml} ---")
    
    # 1. Initialize a blank pre-trained model. We use 'n' for nano (fastest). 
    # Use 'yolov8m.pt' for medium/higher accuracy.
    model_name = custom_model if custom_model else 'yolov8n.pt'
    model = YOLO(model_name)
    
    # 2. Train the model using the actual dataset configuration.
    # We explicitly target device=0 (MX450) for speed and yolov8m for accuracy.
    print(f"Parameters: Epochs={epochs}, ImgSz={imgsz}, Batch={batch}")
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=0, # Use NVIDIA MX450
        project='runs/mumbai_traffic',
        name='yolov8_mumbai_custom_hd',
        mosaic=1.0, # High augmentation for crowded streets
        mixup=0.2,
        patience=10 # Early stopping
    )
    
    print("Training finished!")
    val_metrics = model.val()
    print("Validation Map50-95:", val_metrics.box.map)
    
    print("Best trained weights automatically saved at: runs/mumbai_traffic/yolov8_mumbai_custom/weights/best.pt")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', type=str, default='../datasets/mumbai_traffic/master_mumbai_dataset.yaml', help='Path to the yaml dataset config.')
    parser.add_argument('--epochs', type=int, default=100, help='Number of epochs to run (High accuracy targeting).')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.data) and args.data == 'mumbai_dataset.yaml':
        print(f"Warning: {args.data} not found. Please ensure it exists.")
        
    print("IMPORTANT: Real training on ~42,000 IDD images requires a GPU. ")
    train_model(data_yaml=args.data, epochs=args.epochs)
