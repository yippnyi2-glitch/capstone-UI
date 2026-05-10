import sqlite3
import os
import sys
from pathlib import Path
ROOT_DIR = Path(__file__).parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))
from shared.config import DB_PATH
# ensure db path is absolute
DB_PATH = os.path.abspath(DB_PATH)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    conn = get_db_connection()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS match_results (
                id                   INTEGER  PRIMARY KEY AUTOINCREMENT,
                crawling_image_path  TEXT     NOT NULL,
                user_id              TEXT     NOT NULL,
                user_image_path      TEXT     NOT NULL,
                cosine_similarity    REAL     NOT NULL,
                created_at           TEXT     DEFAULT current_timestamp
            );
        ''')
        # Also ensure user_face_vectors exists for mocking/testing if it doesn't
        conn.execute('''
            CREATE TABLE IF NOT EXISTS user_face_vectors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                vector BLOB NOT NULL,
                image_count INTEGER DEFAULT 1
            );
        ''')
        conn.commit()
    finally:
        conn.close()

# Initialize tables on import
init_db()
