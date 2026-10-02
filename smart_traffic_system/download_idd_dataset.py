import os
import argparse

def setup_kaggle_json(api_key_json_path):
    """
    Sets up the Kaggle API credentials locally so the script can download 
    the Indian Driving Dataset (IDD) YOLO version automatically.
    """
    import shutil
    kaggle_dir = os.path.expanduser('~/.kaggle')
    if not os.path.exists(kaggle_dir):
        os.makedirs(kaggle_dir)
        
    dest_path = os.path.join(kaggle_dir, 'kaggle.json')
    shutil.copy(api_key_json_path, dest_path)
    
    # Secure permissions
    if os.name == 'posix':
        os.chmod(dest_path, 0o600)
    print(f"Kaggle API key configured at {dest_path}")

def download_dataset():
    """
    Downloads the Indian Driving Dataset structured for YOLO.
    Requires the Kaggle pip package: pip install kaggle
    """
    print("Beginning download of Indian Driving Dataset (IDD-D) ~4GB...")
    os.system("kaggle datasets download -d kushank/indian-driving-dataset-ydd --unzip -p ../datasets/mumbai_traffic")
    print("Download complete and extracted to ../datasets/mumbai_traffic")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Download the Real Indian Driving Dataset for YOLO.")
    parser.add_argument('--kaggle_json', type=str, help='Path to your kaggle.json file.', required=False)
    
    args = parser.parse_args()
    
    if args.kaggle_json:
        setup_kaggle_json(args.kaggle_json)
    
    print("IMPORTANT: This script requires a kaggle.json file to authenticate with Kaggle.")
    print("If you haven't provided one via --kaggle_json, it will try to use the default ~/.kaggle/kaggle.json")
    print("Attempting to download...")
    
    try:
        import kaggle
        download_dataset()
    except Exception as e:
        print(f"Error: {e}")
        print("Please ensure you have run 'pip install kaggle' and configured your kaggle.json.")
