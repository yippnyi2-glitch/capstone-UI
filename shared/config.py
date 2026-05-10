import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from root
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

# Database Configuration
DB_PATH = os.getenv("DB_PATH", str(ROOT_DIR / "data" / "unified_master.db"))

# Storage Configuration
USER_STORAGE_DIR = os.getenv("USER_STORAGE_DIR", str(ROOT_DIR / "data" / "storage" / "users"))
CRAWLED_STORAGE_DIR = os.getenv("CRAWLED_STORAGE_DIR", str(ROOT_DIR / "data" / "storage" / "crawled"))
MOCK_SITE_STORAGE_DIR = os.getenv("MOCK_SITE_STORAGE_DIR", str(ROOT_DIR / "data" / "mock_site_storage"))

# Ensure directories exist
os.makedirs(USER_STORAGE_DIR, exist_ok=True)
os.makedirs(CRAWLED_STORAGE_DIR, exist_ok=True)
os.makedirs(MOCK_SITE_STORAGE_DIR, exist_ok=True)

# Deepfake Model Paths (Updated to app/detection)
DEEPFAKE_MODEL_PATH = os.getenv("DEEPFAKE_MODEL_PATH", str(ROOT_DIR / "app" / "detection" / "best_model.pth"))
FACE_DETECTOR_PATH = os.getenv("FACE_DETECTOR_PATH", str(ROOT_DIR / "app" / "detection" / "blaze_face_short_range.tflite"))

# Vector Extraction Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "buffalo_l")
USE_GPU = os.getenv("USE_GPU", "false").lower() == "true"

print(f"Config loaded. DB_PATH: {DB_PATH}")
