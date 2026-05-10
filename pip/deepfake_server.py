"""
deepfake_server.py  ─  deepfake_detector.py 를 HTTP API로 감싸는 최소 서버
===========================================================================
deepfake_detector.py 가 이미 Flask/FastAPI 서버라면 이 파일은 무시하세요.
없다면 이 파일을  cap/ 루트에 놓고 실행하세요:
    pip install fastapi uvicorn
    python deepfake_server.py
"""
import base64
import io
import sys
import os

# cap/ 루트를 경로에 추가해서 deepfake_detector 임포트
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── deepfake_detector.py 임포트 시도 ──────────────────────────────────────
try:
    import deepfake_detector as dd      # cap/deepfake_detector.py
    HAS_DETECTOR = True
except ImportError:
    HAS_DETECTOR = False
    print("[WARN] deepfake_detector.py 를 임포트할 수 없습니다. 더미 응답을 반환합니다.")

app = FastAPI(title="Deepfake Detector Wrapper")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class DetectRequest(BaseModel):
    image_url: str | None = None
    image_base64: str | None = None


@app.post("/api/detect")
async def detect(req: DetectRequest):
    """
    deepfake_detector.py 의 실제 함수를 호출합니다.
    함수명/시그니처가 다르면 아래 call 부분을 수정하세요.
    """
    if not HAS_DETECTOR:
        # 더미 응답
        import random
        return {"is_deepfake": random.random() > 0.7, "confidence": round(random.random(), 3)}

    # ── 이미지 로딩 ─────────────────────────────────────────────
    import aiohttp, numpy as np
    from PIL import Image

    if req.image_url:
        async with aiohttp.ClientSession() as s:
            async with s.get(req.image_url) as r:
                raw = await r.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    elif req.image_base64:
        raw = base64.b64decode(req.image_base64)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    else:
        return {"error": "image_url 또는 image_base64 필요"}

    img_array = np.array(img)

    # ── detector 호출 ─────────────────────────────────────────────
    # deepfake_detector.py 의 실제 함수명으로 교체하세요
    try:
        result = dd.detect(img_array)          # 가장 일반적인 형태
        # result 가 (bool, float) 튜플이거나 dict 일 수 있음
        if isinstance(result, dict):
            return result
        elif isinstance(result, (list, tuple)) and len(result) >= 2:
            return {"is_deepfake": bool(result[0]), "confidence": float(result[1])}
        else:
            return {"is_deepfake": bool(result), "confidence": 1.0}
    except Exception as e:
        return {"is_deepfake": False, "confidence": 0.0, "error": str(e)}


@app.get("/health")
async def health():
    return {"ok": True, "detector_loaded": HAS_DETECTOR}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5003, reload=False)
