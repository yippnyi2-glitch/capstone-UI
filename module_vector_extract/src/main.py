from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List
import numpy as np
import logging
import uuid
import os
import cv2
import base64
import tempfile
import io
from PIL import Image, ImageOps

from src.preprocessing import Preprocessor
from src.feature_extraction import FeatureExtractor
from src.database import DatabaseManager
from src.redis_client import RedisManager

# 디렉토리 초기화 (로거 설정 전)
os.makedirs("logs", exist_ok=True)
os.makedirs("data", exist_ok=True)
os.makedirs("static", exist_ok=True)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/face_extraction.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# FastAPI 앱 및 모듈 초기화
app = FastAPI(title="Face Feature Extraction API", version="1.0.0")

preprocessor = Preprocessor()
extractor = FeatureExtractor(use_gpu=False)
db_manager = DatabaseManager("data/faces.db")

# Redis 초기화 (연결 실패 허용)
redis_manager = None
try:
    redis_manager = RedisManager()
    logger.info("Redis connected successfully")
except Exception as e:
    logger.warning(f"Redis connection failed: {e}. Crawling mode storage will be unavailable.")


# ──────────────────────────────────────────────
# 기존 API (변경 없음)
# ──────────────────────────────────────────────

class ExtractRequest(BaseModel):
    image_path: str
    image_type: str
    user_id: Optional[str] = None

@app.post("/extract")
async def extract_feature(req: ExtractRequest):
    """
    얼굴 이미지로부터 특징 벡터를 추출하고, 타입에 따라 저장 및 매칭을 수행합니다.
    (기존 API — 변경 없음)
    """
    if not os.path.exists(req.image_path):
        raise HTTPException(status_code=400, detail="Image file not found")
        
    try:
        prep_result = preprocessor.process_image(req.image_path, req.image_type)
        if prep_result["status"] != "success":
            raise HTTPException(status_code=400, detail="Preprocessing failed")
            
        img_array = prep_result["image_array"]
        ext_result = extractor.extract(img_array, image_path=req.image_path, min_size=60)
        
        if ext_result["status"] == "fail":
            if req.image_type == "crawling":
                return {"crawling_image_path": req.image_path, "matched": False}
            raise HTTPException(status_code=400, detail=ext_result.get("reason", "Face extraction failed"))
            
        vector = ext_result["vector"]
        
        if req.image_type == "user":
            if not req.user_id:
                raise HTTPException(status_code=400, detail="user_id is required for user images")
                
            photo_type = "side" if "side" in req.image_path.lower() else "front"
            
            db_res = db_manager.add_user_photo(req.user_id, req.image_path, photo_type, vector)
            return {
                "message": "User face registered successfully",
                "user_id": req.user_id,
                "image_count": db_res["image_count"],
                "status": "success"
            }
            
        elif req.image_type == "crawling":
            if not redis_manager:
                raise HTTPException(status_code=503, detail="Redis not available")
            image_id = str(uuid.uuid4())[:8]
            redis_key = redis_manager.save_crawled_vector(image_id, 0, vector)
            
            threshold = 0.8
            if req.user_id:
                user_vector = db_manager.get_user_vector(req.user_id)
                if user_vector is not None:
                    similarity = float(np.dot(vector, user_vector))
                    if similarity >= threshold:
                        redis_manager.delete_key(redis_key)
                        return {
                            "crawling_image_path": req.image_path,
                            "matched_user_id": req.user_id,
                            "user_image_path": "",
                            "cosine_similarity": round(similarity, 4),
                            "matched": True
                        }
            
            redis_manager.delete_key(redis_key)
            return {
                "crawling_image_path": req.image_path,
                "matched": False
            }
            
        else:
            raise HTTPException(status_code=400, detail="Invalid image_type")
            
    except Exception as e:
        logger.error(f"Error processing extraction: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal Server Error")


# ──────────────────────────────────────────────
# 파이프라인 시각화 헬퍼 함수
# ──────────────────────────────────────────────

def _numpy_to_base64(img: np.ndarray) -> str:
    """numpy 배열(BGR)을 base64 PNG 문자열로 변환"""
    _, buffer = cv2.imencode('.png', img)
    return base64.b64encode(buffer).decode('utf-8')


def _fix_exif_orientation(img_bytes: bytes) -> np.ndarray:
    """
    EXIF 방향 메타데이터를 적용하여 이미지를 올바른 방향으로 변환합니다.
    스마트폰 사진은 EXIF에 회전 정보를 저장하는데, cv2.imdecode는 이를 무시하므로
    Pillow로 먼저 EXIF 회전을 적용한 뒤 numpy 배열로 변환합니다.
    """
    try:
        pil_img = Image.open(io.BytesIO(img_bytes))
        # EXIF 방향 정보 적용 (회전/반전)
        pil_img = ImageOps.exif_transpose(pil_img)
        
        # numpy 배열로 변환
        img_array = np.array(pil_img)
        
        # PIL은 RGB, OpenCV는 BGR → 변환
        if len(img_array.shape) == 3:
            if img_array.shape[2] == 3:  # RGB → BGR
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            elif img_array.shape[2] == 4:  # RGBA → BGRA
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGRA)
        
        return img_array
    except Exception as e:
        logger.warning(f"EXIF orientation fix failed, falling back to cv2.imdecode: {e}")
        # 폴백: 기존 cv2.imdecode 방식
        nparr = np.frombuffer(img_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)


def _run_pipeline_single(img_bytes: bytes, filename: str, image_type: str) -> dict:
    """
    단일 이미지에 대해 파이프라인 3단계를 실행하고 각 단계별 결과를 반환합니다.
    """
    result = {
        "filename": filename,
        "steps": [],
        "final_status": "pending"
    }
    
    # ── STEP 1: 전처리 (RGB 변환) ──
    step1 = {"step": 1, "name": "전처리 (RGB 변환)", "status": "processing"}
    
    try:
        # bytes → numpy array (EXIF 방향 보정 포함)
        raw_img = _fix_exif_orientation(img_bytes)
        
        if raw_img is None:
            step1["status"] = "fail"
            step1["reason"] = "이미지 디코딩 실패"
            result["steps"].append(step1)
            result["final_status"] = "fail"
            return result
        
        # 원본 정보
        original_shape = raw_img.shape
        if len(original_shape) == 2:
            original_channels = 1
            channel_type = "Grayscale"
        elif original_shape[2] == 4:
            original_channels = 4
            channel_type = "RGBA/BGRA"
        else:
            original_channels = 3
            channel_type = "RGB/BGR"
        
        # BGR 변환
        img_bgr = preprocessor._convert_to_bgr(raw_img)
        
        step1["status"] = "success"
        step1["details"] = {
            "original_size": f"{original_shape[1]}×{original_shape[0]}",
            "original_channels": original_channels,
            "channel_type": channel_type,
            "converted_to": "BGR (3채널)",
            "converted_size": f"{img_bgr.shape[1]}×{img_bgr.shape[0]}",
            "original_preview": _numpy_to_base64(raw_img if len(raw_img.shape) == 3 else cv2.cvtColor(raw_img, cv2.COLOR_GRAY2BGR)),
            "converted_preview": _numpy_to_base64(img_bgr)
        }
        
    except Exception as e:
        step1["status"] = "error"
        step1["reason"] = str(e)
        result["steps"].append(step1)
        result["final_status"] = "error"
        return result
    
    result["steps"].append(step1)
    
    # ── STEP 2: 얼굴 영역 추출 ──
    step2 = {"step": 2, "name": "얼굴 영역 추출", "status": "processing"}
    
    try:
        faces = extractor.app.get(img_bgr)
        
        if not faces:
            step2["status"] = "fail"
            step2["reason"] = "얼굴이 검출되지 않음"
            step2["details"] = {"face_count": 0}
            result["steps"].append(step2)
            result["final_status"] = "fail"
            return result
        
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        bbox = face.bbox
        x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
        width = x2 - x1
        height = y2 - y1
        
        # bbox 크기 검사
        min_size = 60
        size_check_passed = width >= min_size and height >= min_size
        
        # bbox가 그려진 이미지 생성 (시각화용)
        bbox_vis = img_bgr.copy()
        color = (0, 255, 0) if size_check_passed else (0, 0, 255)
        cv2.rectangle(bbox_vis, (x1, y1), (x2, y2), color, 2)
        cv2.putText(bbox_vis, f"{width}x{height}px", (x1, max(y1 - 10, 0)), 
                     cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        step2["details"] = {
            "face_count": len(faces),
            "bbox": [x1, y1, x2, y2],
            "face_size": f"{width}×{height}",
            "min_size": f"{min_size}×{min_size}",
            "size_check": "통과" if size_check_passed else "미달 (폐기 대상)",
            "bbox_preview": _numpy_to_base64(bbox_vis)
        }
        
        if not size_check_passed:
            step2["status"] = "fail"
            step2["reason"] = f"얼굴 크기 미달: {width}×{height}px (최소 {min_size}×{min_size}px)"
            result["steps"].append(step2)
            result["final_status"] = "fail"
            return result
        
        # 정사각형 확장 크롭
        # bbox의 가로/세로 중 긴 쪽을 기준으로 정사각형으로 확장
        h, w = img_bgr.shape[:2]
        side = max(width, height)
        
        # bbox 중심점 계산
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2
        
        # 정사각형 영역 좌표 (중심 기준 확장)
        sq_x1 = int(center_x - side / 2)
        sq_y1 = int(center_y - side / 2)
        sq_x2 = sq_x1 + side
        sq_y2 = sq_y1 + side
        
        # 정사각형 크롭 (경계 밖은 검정 픽셀로 채움)
        cropped = np.zeros((side, side, 3), dtype=np.uint8)  # 검정 배경
        
        # 원본 이미지에서 유효한 범위 계산
        src_x1 = max(0, sq_x1)
        src_y1 = max(0, sq_y1)
        src_x2 = min(w, sq_x2)
        src_y2 = min(h, sq_y2)
        
        # 크롭 캔버스에서 대응되는 위치
        dst_x1 = src_x1 - sq_x1
        dst_y1 = src_y1 - sq_y1
        dst_x2 = dst_x1 + (src_x2 - src_x1)
        dst_y2 = dst_y1 + (src_y2 - src_y1)
        
        cropped[dst_y1:dst_y2, dst_x1:dst_x2] = img_bgr[src_y1:src_y2, src_x1:src_x2]
        
        # 112×112 리사이즈
        resized = cv2.resize(cropped, (112, 112), interpolation=cv2.INTER_LINEAR)
        
        # 픽셀 정규화 (시각화를 위해 정규화 전후 값 정보만 제공)
        normalized = resized.astype(np.float32) / 255.0 * 2 - 1
        
        # 정사각형 확장 영역도 시각화 (원본 이미지에 표시)
        bbox_vis2 = bbox_vis.copy()
        cv2.rectangle(bbox_vis2, (sq_x1, sq_y1), (sq_x2, sq_y2), (255, 255, 0), 2)
        cv2.putText(bbox_vis2, f"square {side}x{side}", (sq_x1, max(sq_y1 - 10, 0)), 
                     cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        
        step2["status"] = "success"
        step2["details"].update({
            "square_expansion": f"{width}×{height} → {side}×{side}",
            "square_bbox": [sq_x1, sq_y1, sq_x2, sq_y2],
            "padding_used": sq_x1 < 0 or sq_y1 < 0 or sq_x2 > w or sq_y2 > h,
            "bbox_preview": _numpy_to_base64(bbox_vis2),
            "cropped_preview": _numpy_to_base64(cropped),
            "resized_preview": _numpy_to_base64(resized),
            "pixel_range_before": f"0 ~ 255 (uint8)",
            "pixel_range_after": f"-1.0 ~ 1.0 (float32)",
            "output_shape": "112×112×3"
        })
        
    except Exception as e:
        step2["status"] = "error"
        step2["reason"] = str(e)
        result["steps"].append(step2)
        result["final_status"] = "error"
        return result
    
    result["steps"].append(step2)
    
    # ── STEP 3: 벡터 추출 ──
    step3 = {"step": 3, "name": "벡터 추출 (ArcFace 512D)", "status": "processing"}
    
    try:
        # face 객체에서 직접 embedding 가져오기 (이미 검출됨)
        raw_vector = face.embedding
        raw_norm = float(np.linalg.norm(raw_vector))
        
        # L2 정규화
        normed_vector = raw_vector / (raw_norm if raw_norm > 0 else 1.0)
        normed_norm = float(np.linalg.norm(normed_vector))
        
        step3["status"] = "success"
        step3["details"] = {
            "vector_dim": 512,
            "raw_l2_norm": round(raw_norm, 6),
            "normalized_l2_norm": round(normed_norm, 6),
            "vector_sample": [round(float(v), 6) for v in normed_vector[:20]],
            "vector_min": round(float(np.min(normed_vector)), 6),
            "vector_max": round(float(np.max(normed_vector)), 6),
            "vector_mean": round(float(np.mean(normed_vector)), 6),
        }
        
        # 벡터를 result에도 저장 (batch 처리 시 평균용)
        result["vector"] = normed_vector
        
    except Exception as e:
        step3["status"] = "error"
        step3["reason"] = str(e)
        result["steps"].append(step3)
        result["final_status"] = "error"
        return result
    
    result["steps"].append(step3)
    result["final_status"] = "success"
    
    return result


# ──────────────────────────────────────────────
# 파이프라인 시각화 API 엔드포인트
# ──────────────────────────────────────────────

@app.post("/extract-pipeline")
async def extract_pipeline(
    file: UploadFile = File(...),
    image_type: str = Form(default="crawling")
):
    """
    단일 이미지에 대해 파이프라인 각 단계를 실행하고 단계별 결과를 반환합니다.
    (크롤링 이미지 1장 또는 단일 테스트용)
    """
    try:
        img_bytes = await file.read()
        pipeline_result = _run_pipeline_single(img_bytes, file.filename, image_type)
        
        # Step 3까지 성공한 경우 저장 처리
        if pipeline_result["final_status"] == "success":
            vector = pipeline_result.pop("vector", None)
            
            if image_type == "crawling" and vector is not None:
                if redis_manager:
                    image_id = str(uuid.uuid4())[:8]
                    redis_key = redis_manager.save_crawled_vector(image_id, 0, vector)
                    pipeline_result["storage"] = {
                        "type": "Redis",
                        "key": redis_key,
                        "status": "저장 완료"
                    }
                    # 시각화 목적이므로 바로 삭제
                    redis_manager.delete_key(redis_key)
                    pipeline_result["storage"]["note"] = "시각화 후 삭제됨"
                else:
                    pipeline_result["storage"] = {
                        "type": "Redis",
                        "status": "Redis 미연결 — 저장 건너뜀"
                    }
            else:
                # vector 제거 (JSON 직렬화 불가)
                pass
        else:
            pipeline_result.pop("vector", None)
                
        return pipeline_result
        
    except Exception as e:
        logger.error(f"Pipeline error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract-pipeline-batch")
async def extract_pipeline_batch(
    files: List[UploadFile] = File(...),
    user_id: str = Form(...),
    image_type: str = Form(default="user")
):
    """
    사용자 이미지 5장을 일괄 처리하고, 각 이미지별 단계 결과 + 평균 벡터 결과를 반환합니다.
    """
    if len(files) != 5:
        raise HTTPException(status_code=400, detail=f"사용자 이미지는 정확히 5장이 필요합니다. (현재: {len(files)}장)")
    
    try:
        all_results = []
        successful_vectors = []
        
        for i, file in enumerate(files):
            img_bytes = await file.read()
            pipeline_result = _run_pipeline_single(img_bytes, file.filename, image_type)
            
            if pipeline_result["final_status"] == "success" and "vector" in pipeline_result:
                successful_vectors.append(pipeline_result.pop("vector"))
            else:
                pipeline_result.pop("vector", None)
            
            pipeline_result["index"] = i + 1
            all_results.append(pipeline_result)
        
        # 평균 벡터 계산
        batch_summary = {
            "총_이미지": 5,
            "성공": len(successful_vectors),
            "실패": 5 - len(successful_vectors)
        }
        
        if len(successful_vectors) > 0:
            # 단순 평균
            avg_vector = np.mean(successful_vectors, axis=0).astype(np.float32)
            # 다시 L2 정규화
            norm = np.linalg.norm(avg_vector)
            if norm > 0:
                avg_vector = avg_vector / norm
            
            batch_summary["average_vector"] = {
                "dim": 512,
                "l2_norm": round(float(np.linalg.norm(avg_vector)), 6),
                "sample": [round(float(v), 6) for v in avg_vector[:20]],
                "min": round(float(np.min(avg_vector)), 6),
                "max": round(float(np.max(avg_vector)), 6),
                "mean": round(float(np.mean(avg_vector)), 6)
            }
            
            # SQLite에 저장
            try:
                # 임시 파일 경로로 DB에 기록
                for i, file_obj in enumerate(files):
                    photo_type = "front" if i == 0 else "side"
                    db_manager.add_user_photo(user_id, f"pipeline_test/{file_obj.filename}", photo_type, avg_vector)
                
                batch_summary["storage"] = {
                    "type": "SQLite",
                    "user_id": user_id,
                    "status": "대표 벡터 저장 완료"
                }
            except Exception as db_err:
                batch_summary["storage"] = {
                    "type": "SQLite",
                    "status": f"저장 실패: {str(db_err)}"
                }
        
        return {
            "user_id": user_id,
            "image_results": all_results,
            "batch_summary": batch_summary
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch pipeline error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# 정적 파일 및 루트 경로
# ──────────────────────────────────────────────

# 정적 파일 서빙 (CSS, JS 등)
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/", response_class=HTMLResponse)
async def root():
    """루트 경로에서 index.html 반환"""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type="text/html")
    return HTMLResponse("<h1>Face Feature Extraction Pipeline</h1><p>static/index.html not found</p>")
