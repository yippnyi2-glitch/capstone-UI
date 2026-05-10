import cv2
import numpy as np
import logging
from insightface.app import FaceAnalysis

import sys
from pathlib import Path
ROOT_DIR = Path(__file__).parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from shared.config import MODEL_NAME as DEFAULT_MODEL, USE_GPU as DEFAULT_GPU

logger = logging.getLogger(__name__)

class FeatureExtractor:
    def __init__(self, model_name=DEFAULT_MODEL, use_gpu=DEFAULT_GPU):
        """
        InsightFace 기반 특징벡터 추출 모듈 초기화
        :param model_name: InsightFace 모델명 (기본: buffalo_l)
        :param use_gpu: GPU (CUDA) 사용 여부
        """
        self.providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if use_gpu else ['CPUExecutionProvider']
        self.app = FaceAnalysis(name=model_name, providers=self.providers)
        self.app.prepare(ctx_id=0, det_size=(640, 640))
        
    def extract(self, img: np.ndarray, image_path: str = "unknown", min_size: int = 60) -> dict:
        """
        단일 얼굴 이미지 배열에서 특징벡터를 추출합니다. (ArcFace 512d)
        내부적으로 InsightFace가 얼굴을 추출하고, 112x112로 모델 규격에 맞춰 자른 뒤 인식 모델을 호출합니다.
        
        :param img: 전처리된 이미지 배열 (BGR 3채널 numpy array)
        :param image_path: 로깅을 위한 원본 시스템 경로
        :param min_size: 원본 이미지에서의 bbox 가로/세로 최소 픽셀 수 (기본값 60)
        :return: (딕셔너리) bbox, 크기, 정규화된 512차원 배열과 추출 성공 여부
        """
        if img is None or not isinstance(img, np.ndarray):
            logger.error(f"Invalid image array provided for: {image_path}")
            return {"status": "error", "reason": "invalid_image_data"}
            
        # 얼굴 검출 및 특징 추출
        faces = self.app.get(img)
        
        if not faces:
            logger.info(f"[{image_path}] No face detected.")
            return {"status": "fail", "reason": "no_face_detected"}
            
        # 다중 얼굴의 경우 일단 가장 크게 잡히는 메인 얼굴을 대상으로 함 (단일 얼굴 가정)
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        
        bbox = face.bbox  # [x1, y1, x2, y2]
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]
        
        # 60x60 크기 검사 (미달 시 예외/폐기)
        if width < min_size or height < min_size:
            logger.info(f"[{image_path}] Face too small: {width:.1f}x{height:.1f} (min: {min_size})")
            return {
                "status": "fail", 
                "reason": "face_too_small", 
                "size": f"{int(width)}x{int(height)}"
            }
            
        # 512 차원 특징벡터 및 포즈(pitch, yaw, roll)
        vector = face.embedding
        pose = face.pose  # [pitch, yaw, roll]
        
        # L2 정규화 (코사인 유사도 비교를 위함)
        norm = np.linalg.norm(vector)
        normed_vector = vector / (norm if norm > 0 else 1.0)
        
        return {
            "status": "success",
            "bbox": [float(x) for x in bbox],
            "pose": [float(x) for x in pose],
            "vector": normed_vector,
            "vector_shape": normed_vector.shape,
            "size": f"{int(width)}x{int(height)}"
        }
