import os
import sys
from pathlib import Path

# Add project root to sys.path
ROOT_DIR = Path(__file__).parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from shared.config import DB_PATH, CRAWLED_STORAGE_DIR as IMAGE_ROOT

# BASE_DIR for any local relative needs
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_ROOT = os.path.join(BASE_DIR, "uploads")

DEFAULT_MAX_PAGES = 3
DEFAULT_DELAY_SEC = 0.2
USER_AGENT = "Mozilla/5.0 (compatible; KWU-Capstone-Crawler/1.0)"

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "heosejoan@gmail.com"
SMTP_PASS = "kksw sbtv qpms lang"
