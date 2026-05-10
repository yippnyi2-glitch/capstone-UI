import redis
import numpy as np
import logging

logger = logging.getLogger(__name__)

class RedisManager:
    def __init__(self, host='localhost', port=6379, db=0):
        """
        크롤링된 특징벡터를 임시 저장하기 위한 Redis 연결 초기화
        :param host: Redis 서버 주소
        :param port: Redis 포트
        :param db: Redis DB 번호
        """
        self.r = redis.Redis(host=host, port=port, db=db, decode_responses=False)
        
    def save_crawled_vector(self, image_id: str, face_index: int, vector: np.ndarray) -> str:
        """
        크롤링 이미지 벡터를 Redis에 저장 (포맷: `crawling:{이미지ID}:face:{face_index}`)
        
        :param image_id: 이미지 고유 식별자 (예: 파일명 등)
        :param face_index: 이미지 내 얼굴 고유 인덱스 (기본: 0)
        :param vector: 512차원 numpy float32 배열
        :return: 저장된 키 이름
        """
        if vector.shape != (512,):
            raise ValueError(f"Vector shape must be (512,), got {vector.shape}")
            
        key = f"crawling:{image_id}:face:{face_index}"
        vector_bytes = vector.astype(np.float32).tobytes()
        
        # TTL을 사용하지 않고 추후 매칭 모듈에서 명시적으로 삭제되도록 설계 반영
        self.r.set(key, vector_bytes)
        logger.info(f"Saved crawled vector in Redis: {key}")
        
        return key

    def get_crawled_vector(self, key: str) -> np.ndarray:
        """
        Redis에서 크롤링된 벡터 조회 (바이트 역직렬화)
        """
        vector_bytes = self.r.get(key)
        if vector_bytes is None:
            return None
        return np.frombuffer(vector_bytes, dtype=np.float32)

    def delete_key(self, key: str):
        """
        비교 완료 후 매칭 모듈에서 명시적 삭제
        """
        self.r.delete(key)
        logger.info(f"Deleted Redis key: {key}")
