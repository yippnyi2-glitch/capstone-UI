import sqlite3
import numpy as np
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self, db_path: str = "faces.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """SQLite 데이터베이스 스키마 초기화"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 사용자 관리 테이블 (1명당 1개 로우)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    created_at TEXT DEFAULT (datetime('now', 'localtime'))
                )
            ''')

            # 사용자 사진 테이블 (1명당 여러 사진 저장, 1:N)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_photos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    photo_type TEXT NOT NULL,
                    created_at TEXT DEFAULT (datetime('now', 'localtime')),
                    FOREIGN KEY(user_id) REFERENCES users(user_id)
                )
            ''')
            
            # user_face_vectors 테이블
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_face_vectors (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    vector BLOB NOT NULL,
                    image_count INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now', 'localtime')),
                    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
                    FOREIGN KEY(user_id) REFERENCES users(user_id)
                )
            ''')
            conn.commit()

    def add_user_photo(self, user_id: str, file_path: str, photo_type: str, new_vector: np.ndarray) -> dict:
        """
        사용자 사진 기록을 추가하고, 기존 벡터와 가중 평균하여 벡터 저장소를 갱신합니다.
        
        :param user_id: 식별자
        :param file_path: 사진 경로
        :param photo_type: 'front' 또는 'side'
        :param new_vector: 512d 특징벡터 (L2 정규화됨을 가정)
        :return: 갱신 결과 및 상태 딕셔너리
        """
        if new_vector.shape != (512,):
            raise ValueError(f"Vector shape must be (512,), got {new_vector.shape}")
            
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 1-0. 사용자 고유 등록 (SELECT 후 INSERT로 중복과 시퀀스 증가 방지)
            cursor.execute('''
                SELECT 1 FROM users WHERE user_id = ?
            ''', (user_id,))
            if not cursor.fetchone():
                cursor.execute('''
                    INSERT INTO users (user_id)
                    VALUES (?)
                ''', (user_id,))
            
            # 1. 사진 메타 정보 추가 (1:N, 추적용)
            cursor.execute('''
                INSERT INTO user_photos (user_id, file_path, photo_type)
                VALUES (?, ?, ?)
            ''', (user_id, file_path, photo_type))
            
            # 2. 기존 사용자 벡터 확인
            cursor.execute('''
                SELECT vector, image_count FROM user_face_vectors 
                WHERE user_id = ?
            ''', (user_id,))
            row = cursor.fetchone()
            
            if row is None:
                # 최초 등록 (image_count = 1 부터 시작)
                # 설계 내용 "최초 3장: 단순 평균 ... 가중평균" 은 점진적 등록 시 수식에 의해 자동 만족됨
                # 1장일 땐 그 자체가 평균이 됨.
                vector_bytes = new_vector.astype(np.float32).tobytes()
                cursor.execute('''
                    INSERT INTO user_face_vectors (user_id, vector, image_count)
                    VALUES (?, ?, ?)
                ''', (user_id, vector_bytes, 1))
                new_image_count = 1
                
            else:
                existing_vector_bytes, image_count = row
                existing_vector = np.frombuffer(existing_vector_bytes, dtype=np.float32)
                
                # 가중 평균 로직 설계 준수: image_count 상한 10장
                if image_count < 10:
                    n = image_count
                    # 수식: 기존벡터 * (n / (n+1)) + 새벡터 * (1 / (n+1))
                    updated_vector = existing_vector * (n / (n + 1)) + new_vector * (1 / (n + 1))
                    
                    # 다시 L2 정규화 적용 (평균 냈으므로 L2 norm이 1이 아닐 수 있음)
                    norm = np.linalg.norm(updated_vector)
                    if norm > 0:
                        updated_vector = updated_vector / norm
                        
                    new_image_count = n + 1
                    vector_bytes = updated_vector.astype(np.float32).tobytes()
                    
                    cursor.execute('''
                        UPDATE user_face_vectors
                        SET vector = ?, image_count = ?, updated_at = datetime('now', 'localtime')
                        WHERE user_id = ?
                    ''', (vector_bytes, new_image_count, user_id))
                else:
                    # 10장 초과 시 벡터 업데이트 중단, 카운트 유지
                    new_image_count = image_count
                    logger.info(f"User {user_id} reached maximum image count (10). Vector not updated.")
            
            conn.commit()
            
            return {
                "status": "success",
                "user_id": user_id,
                "image_count": new_image_count
            }

    def get_user_vector(self, user_id: str) -> Optional[np.ndarray]:
        """사용자의 특징 벡터 조회"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT vector FROM user_face_vectors WHERE user_id = ?', (user_id,))
            row = cursor.fetchone()
            if row:
                return np.frombuffer(row[0], dtype=np.float32)
            return None
