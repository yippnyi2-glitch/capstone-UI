# -*- coding: utf-8 -*-
"""
딥페이크 탐지부 — 핵심 추론 코드
Swin Transformer Base + MediaPipe 얼굴 감지
"""

import numpy as np
import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import timm
import cv2
import os


# ============================================================
# 설정
# ============================================================
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
MIN_RESOLUTION = 64
THRESHOLD = 0.5
MODEL_PATH = 'best_model.pth'                # 학습된 가중치 경로
FACE_DETECTOR_PATH = 'detector.tflite'        # MediaPipe 얼굴 감지 모델 경로

# 전처리 transform (ImageNet 기준 정규화)
TRANSFORM = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ============================================================
# 1. 얼굴 감지 + 크롭
# ============================================================
def detect_and_crop_face(img_rgb, margin=0.2):
    """
    MediaPipe로 얼굴 감지 후 마진을 포함하여 크롭.
    감지 실패 시 None 반환.
    """
    h, w = img_rgb.shape[:2]

    base_options = python.BaseOptions(model_asset_path=FACE_DETECTOR_PATH)
    options = vision.FaceDetectorOptions(
        base_options=base_options,
        min_detection_confidence=0.5
    )
    detector = vision.FaceDetector.create_from_options(options)

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
    results = detector.detect(mp_image)

    if not results.detections:
        return None

    bbox = results.detections[0].bounding_box
    x = max(0, int(bbox.origin_x - margin * bbox.width))
    y = max(0, int(bbox.origin_y - margin * bbox.height))
    bw = min(int((1 + 2 * margin) * bbox.width), w - x)
    bh = min(int((1 + 2 * margin) * bbox.height), h - y)

    return img_rgb[y:y + bh, x:x + bw]


# ============================================================
# 2. 얼굴 정렬 (Face Alignment)
# ============================================================
def align_face(img_rgb):
    """
    MediaPipe Face Mesh로 양쪽 눈 좌표를 검출한 뒤,
    눈 사이 기울기를 기준으로 얼굴을 수평으로 회전 정렬.
    정렬 실패 시 원본 그대로 반환.

    랜드마크 인덱스:
        왼쪽 눈 중심 = 468, 오른쪽 눈 중심 = 473
    """
    mp_face_mesh = mp.solutions.face_mesh

    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,          # 눈 홍채 랜드마크 활성화
        min_detection_confidence=0.5
    ) as face_mesh:

        results = face_mesh.process(img_rgb)

        if not results.multi_face_landmarks:
            return img_rgb  # 랜드마크 감지 실패 → 원본 반환

        landmarks = results.multi_face_landmarks[0].landmark
        h, w = img_rgb.shape[:2]

        # 양쪽 눈 중심 좌표 (픽셀 단위)
        left_eye = np.array([landmarks[468].x * w, landmarks[468].y * h])
        right_eye = np.array([landmarks[473].x * w, landmarks[473].y * h])

        # 눈 사이 기울기 각도 계산
        delta = right_eye - left_eye
        angle = np.degrees(np.arctan2(delta[1], delta[0]))

        # 두 눈 중점을 기준으로 회전
        center = tuple(((left_eye + right_eye) / 2).astype(int))
        rotation_matrix = cv2.getRotationMatrix2D(center, angle, scale=1.0)
        aligned = cv2.warpAffine(img_rgb, rotation_matrix, (w, h),
                                 flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REPLICATE)

        return aligned


# ============================================================
# 3. 전처리 (이미지 → 텐서)
# ============================================================
def preprocess(img_rgb):
    """
    RGB 이미지를 받아서:
    1) 해상도 검사
    2) 얼굴 정렬 (눈 기준 수평 보정)
    3) 얼굴 감지 + 크롭 (실패 시 원본 사용)
    4) 224x224 리사이즈 + 정규화
    반환: [1, 3, 224, 224] 텐서
    """
    h, w = img_rgb.shape[:2]
    if h < MIN_RESOLUTION or w < MIN_RESOLUTION:
        raise ValueError(f"이미지 해상도가 너무 낮습니다: {w}x{h} (최소 {MIN_RESOLUTION}x{MIN_RESOLUTION})")

    # 얼굴 정렬 → 감지 + 크롭
    img_aligned = align_face(img_rgb)
    face = detect_and_crop_face(img_aligned)
    if face is None:
        face = img_aligned  # 얼굴 감지 실패 시 정렬된 원본 사용

    face_resized = cv2.resize(face, (224, 224))
    tensor = TRANSFORM(Image.fromarray(face_resized))
    return tensor.unsqueeze(0)  # 배치 차원 추가


# ============================================================
# 4. 모델 구성 (Swin Transformer Base)
# ============================================================
def build_model(num_classes=2, dropout_p=0.5):
    """
    Swin Transformer Base 로드 후 분류 head 교체.
    출력: [batch, 2] (real, fake)
    """
    model = timm.create_model('swin_base_patch4_window7_224', pretrained=False)
    model.head.fc = nn.Sequential(
        nn.Dropout(p=dropout_p),
        nn.Linear(model.head.fc.in_features, num_classes)
    )
    return model.to(DEVICE)


def load_model(model_path=MODEL_PATH):
    """학습된 가중치를 로드한 모델 반환."""
    model = build_model()
    model.load_state_dict(torch.load(model_path, map_location=DEVICE))
    model.eval()
    return model


# ============================================================
# 5. 추론 + 판정
# ============================================================
def predict(model, input_tensor):
    """
    모델 추론 후 판정 결과 반환.

    반환값 dict:
        is_fake   : bool   — True면 딥페이크
        confidence: float  — 판정 신뢰도 (0~1)
        prob_real : float  — P(real)
        prob_fake : float  — P(fake)
    """
    softmax = nn.Softmax(dim=1)

    with torch.no_grad():
        input_tensor = input_tensor.to(DEVICE)
        outputs = model(input_tensor)
        probs = softmax(outputs).squeeze(0).cpu().numpy()

    prob_real, prob_fake = probs[0], probs[1]
    is_fake = prob_fake > THRESHOLD

    return {
        'is_fake': bool(is_fake),
        'confidence': float(max(prob_real, prob_fake)),
        'prob_real': float(prob_real),
        'prob_fake': float(prob_fake),
    }


# ============================================================
# 6. 통합 파이프라인 (이미지 경로 → 결과)
# ============================================================
def detect_deepfake(image_path, model=None):
    """
    이미지 경로 하나를 받아 딥페이크 여부를 판정하는 통합 함수.

    Args:
        image_path: 이미지 파일 경로
        model: 로드된 모델 (None이면 자동 로드)

    Returns:
        dict: is_fake, confidence, prob_real, prob_fake
    """
    if model is None:
        model = load_model()

    # 이미지 읽기 (BGR → RGB)
    img_bgr = cv2.imread(image_path)
    if img_bgr is None:
        raise FileNotFoundError(f"이미지를 읽을 수 없습니다: {image_path}")
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    # 전처리 → 추론 → 판정
    input_tensor = preprocess(img_rgb)
    result = predict(model, input_tensor)

    return result


# ============================================================
# 실행 예시
# ============================================================
if __name__ == '__main__':
    import sys

    # 사용법: python deepfake_detector.py <이미지 경로>
    if len(sys.argv) < 2:
        print("사용법: python deepfake_detector.py <이미지 경로>")
        sys.exit(1)

    image_path = sys.argv[1]

    print(f"디바이스: {DEVICE}")
    print(f"이미지: {image_path}")
    print("모델 로딩 중...")

    model = load_model()
    result = detect_deepfake(image_path, model)

    print(f"\n{'=' * 40}")
    print(f"  판정 결과: {'딥페이크' if result['is_fake'] else '정상'}")
    print(f"  P(real) : {result['prob_real']:.4f}")
    print(f"  P(fake) : {result['prob_fake']:.4f}")
    print(f"  신뢰도  : {result['confidence']:.4f}")
    print(f"{'=' * 40}")
