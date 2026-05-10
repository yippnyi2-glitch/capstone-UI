import cv2
import numpy as np
import logging
import os

logger = logging.getLogger(__name__)

class Preprocessor:
    def __init__(self):
        """
        전처리 모듈 초기화
        """
        pass

    def process_image(self, image_path: str, image_type: str) -> dict:
        """
        단일 이미지 전처리를 수행합니다.
        
        :param image_path: 로드할 이미지 파일 시스템 경로
        :param image_type: 이미지 유형 ("user" 또는 "crawling")
        :return: 전처리된 결과 딕셔너리 (메타데이터 포함)
        """
        # 0. 경로 확인 및 분기
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found at path: {image_path}")
            
        if image_type not in ["user", "crawling"]:
            raise ValueError(f"Invalid image_type: {image_type}. Must be 'user' or 'crawling'.")

        # 1. 이미지 로드 (OpenCV는 BGR 포맷으로 읽음)
        # imread는 한글 경로나 특수문자 경로에서 문제가 발생할 수 있으므로 주의 필요 시 numpy + cv2.imdecode를 고려
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Failed to load image or image is corrupted: {image_path}")

        # 2. BGR 변환 (RGBA, 흑백 등 모델 입력 규격 일원화)
        # 통일된 배열을 반환하여 이후 추출부에서 크롭/리사이즈 등을 처리할 수 있게 함
        img_bgr = self._convert_to_bgr(img)

        return {
            "image_type": image_type,
            "original_path": image_path,
            "image_array": img_bgr,
            "status": "success"
        }

    def _convert_to_bgr(self, img: np.ndarray) -> np.ndarray:
        """OpenCV 이미지를 BGR로 균일하게 변환합니다."""
        if len(img.shape) == 2:  # Grayscale
            return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif len(img.shape) == 3:
            if img.shape[2] == 4:  # BGRA
                return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
            elif img.shape[2] == 3:  # BGR
                return img
            else:
                raise ValueError(f"Unknown channel size: {img.shape[2]}")
        else:
            raise ValueError("Unsupported image format")
