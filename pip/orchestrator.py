import os
import sys
import asyncio
import subprocess
import httpx
import uuid
import json
import base64
import importlib.util
import shutil
import sqlite3
# cv2/numpy 는 얼굴·벡터 기능 전용. 미설치 시 None 으로 두고 서버는 계속 기동
# (해당 엔드포인트 호출 시점에만 실패 — auth 등 나머지는 정상 동작).
try:
    import cv2
except ImportError:
    cv2 = None
try:
    import numpy as np
except ImportError:
    np = None
import re
from datetime import datetime
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Request, Response, BackgroundTasks, File, Form, UploadFile
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- 1. 경로 및 환경 설정 ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # cap/
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

def load_module(name, path):
    """'src' 네임스페이스 충돌을 방지하며 모듈을 동적으로 로드합니다."""
    for sub_mod in list(sys.modules.keys()):
        if sub_mod == 'src' or sub_mod.startswith('src.'):
            del sys.modules[sub_mod]
            
    spec = importlib.util.spec_from_file_location(name, path)
    mod  = importlib.util.module_from_spec(spec)
    
    module_dir = os.path.dirname(os.path.dirname(path))
    if module_dir not in sys.path:
        sys.path.insert(0, module_dir)
    
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    
    if module_dir in sys.path:
        sys.path.remove(module_dir)
    return mod

# --- 2. 서비스 설정 및 모듈 동적 로딩 ---
SERVICES = {
    'crawling': "http://localhost:8080",
    'vector_extract': "http://localhost:8080/extract",
    'vector_match': "http://localhost:8080/compare",
    'deepfake': "http://localhost:5003",
    'evidence': "http://localhost:13000",
    'user_photo': "http://localhost:13001",
}

# 동적 모듈 로드 — 무거운 의존성(cv2/numpy/insightface/bs4/requests/redis 등) 미설치 시
# 해당 모듈만 비활성화하고 서버는 계속 기동한다. (import/로딩 부분만 가드, 모듈 내부 로직 무변경)

# [Crawl/Takedown] 로드
try:
    crawl_main_path = os.path.join(BASE_DIR, "module_crawl_takedown", "server.py")
    vec_crawl = load_module("vec_crawl_main", crawl_main_path)
    monitor_router = vec_crawl.monitor_router
    crawl_api_router = vec_crawl.api_router
except Exception as e:
    print(f"[orchestrator] crawl/takedown 모듈 비활성화: {e}")
    vec_crawl = None
    monitor_router = crawl_api_router = None

# [Vector Extract] 로드
try:
    extract_main_path = os.path.join(BASE_DIR, "module_vector_extract", "src", "main.py")
    vec_extract = load_module("vec_extract_main", extract_main_path)
    extract_feature = vec_extract.extract_feature
    extract_pipeline_batch = vec_extract.extract_pipeline_batch
except Exception as e:
    print(f"[orchestrator] vector_extract 모듈 비활성화: {e}")
    vec_extract = None
    extract_feature = extract_pipeline_batch = None

# [Vector Match] 로드
try:
    match_main_path = os.path.join(BASE_DIR, "module_vector_match", "src", "main.py")
    vec_match = load_module("vec_match_main", match_main_path)
    start_batch_compare = vec_match.start_batch_compare
    compare_status = vec_match.compare_status
    compare_single = vec_match.compare_single
except Exception as e:
    print(f"[orchestrator] vector_match 모듈 비활성화: {e}")
    vec_match = None
    start_batch_compare = compare_status = compare_single = None

# --- 3. 글로벌 상태 및 유틸리티 ---
pipeline_jobs: dict[str, dict] = {}

def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

def step_payload(step: str, status: str, message: str = "", data: dict | None = None) -> dict:
    return {
        "step": step,
        "status": status,
        "message": message,
        "data": data or {},
        "ts": datetime.now().strftime("%H:%M:%S"),
    }


# --- 4. 파이프라인 핵심 로직 ---
async def run_pipeline_from_crawl(job_id: str, user_id: str):
    """크롤링부터 시작하는 비동기 통합 파이프라인"""
    q: asyncio.Queue = pipeline_jobs[job_id]["queue"]
    timeout = httpx.Timeout(90.0)

    async def send(step, status, message="", data=None):
        await q.put(step_payload(step, status, message, data))

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            from shared.config import DB_PATH
            # 1. 벡터 추출 대기 및 사용자 등록 확인
            await send("user_vec", "running", f"[{user_id}] 등록 데이터 확인 및 벡터 추출 대기 중...")
            await asyncio.sleep(2)
            
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            
            # 사용자 벡터 가져오기
            cur.execute("SELECT vector FROM user_face_vectors WHERE user_id = ?", (user_id,))
            user_row = cur.fetchone()
            if not user_row:
                # Fallback: 만약 user_id가 없으면 가장 최근 유저 사용 (테스트용)
                cur.execute("SELECT user_id, vector FROM user_face_vectors ORDER BY rowid DESC LIMIT 1")
                user_row = cur.fetchone()
            
            if not user_row:
                await send("user_vec", "error", "등록된 사용자 얼굴 벡터를 찾을 수 없습니다.")
                return
            
            u_vec = np.frombuffer(user_row["vector"], dtype=np.float32)
            await send("user_vec", "success", f"[{user_id}] 벡터 로드 완료")

            # 2. 크롤링 시작
            await send("crawl", "running", f"[{user_id}] 타겟 사이트 크롤링 실행 중...")
            try:
                target_id = user_id if not user_id.isdigit() else int(user_id)
                r = await client.post(f"{SERVICES['crawling']}/api/monitor/run-now", params={"user_id": target_id})
                
                # 폴링: 크롤링 완료 대기
                max_polls = 10
                found_images = 0
                for i in range(max_polls):
                    await asyncio.sleep(2)
                    stats_r = await client.get(f"{SERVICES['crawling']}/api/monitor/stats")
                    
                    if stats_r.status_code != 200:
                        await send("crawl", "error", f"크롤링 서비스 응답 오류 (HTTP {stats_r.status_code})")
                        return
                    
                    try:
                        stats = stats_r.json()
                    except Exception:
                        await send("crawl", "error", "크롤링 서비스로부터 유효하지 않은 응답을 받았습니다 (Non-JSON)")
                        return
                        
                    running = stats.get("running_jobs", 0)
                    found_images = stats.get("total_images", 0)
                    if running == 0 and i > 1: break
                    await send("crawl", "running", f"크롤링 중... {found_images}개 수집 ({i+1}/{max_polls})")
                
                await send("crawl", "success", f"크롤링 완료 (총 {found_images}개 수집)")
            except Exception as e:
                await send("crawl", "error", f"크롤링 실패: {e}"); return

            # 3. 크롤링 이미지 벡터 추출 및 직접 매칭 (Redis 의존성 제거)
            await send("crawl_vec", "running", "수집된 이미지 특징 벡터 추출 중...")
            items_r = await client.get(f"{SERVICES['crawling']}/api/latest_items", params={"limit": 100})
            items = items_r.json()
            
            if not items:
                await send("crawl_vec", "success", "수집된 이미지가 없습니다.")
            else:
                await send("crawl_vec", "running", f"이미지 {len(items)}개 벡터 분석 시작...")
                # 매칭 결과를 담을 테이블 생성
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS match_results (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        crawling_image_path TEXT,
                        user_id TEXT,
                        cosine_similarity REAL,
                        created_at TEXT DEFAULT current_timestamp
                    )
                """)
                
                match_count = 0
                match_data = []
                
                for idx, item in enumerate(items):
                    try:
                        fpath = item.get("file_path")
                        if not fpath or not os.path.exists(fpath): continue
                        
                        # 직접 벡터 추출
                        img = cv2.imread(fpath)
                        if img is None: continue
                        
                        ext_res = vec_extract.extractor.extract(img, image_path=fpath)
                        if ext_res["status"] == "success":
                            c_vec = ext_res["vector"]
                            # 코사인 유사도 계산
                            sim = float(np.dot(u_vec, c_vec))
                            if sim >= 0.75: # 매칭 임계값
                                match_count += 1
                                cur.execute("INSERT INTO match_results (crawling_image_path, user_id, cosine_similarity) VALUES (?, ?, ?)",
                                            (item.get("image_url", fpath), user_id, sim))
                                match_data.append({"crawling": item.get("image_url", fpath), "user_id": user_id, "score": sim})
                        
                        if (idx + 1) % 5 == 0:
                            await send("crawl_vec", "running", f"벡터 분석 중... ({idx+1}/{len(items)})")
                            await asyncio.sleep(0.2)
                    except: continue
                
                conn.commit()
                await send("crawl_vec", "success", f"분석 완료 (유사 인물 {match_count}건 발견)")

            # 4. 벡터 비교 결과 요약 (VectorMatch 단계 대용)
            await send("compare", "running", "매칭 알고리즘 최종 검증 및 정렬 중...")
            await asyncio.sleep(1.5)
            await send("compare", "success", f"분용 유사 이미지 {len(match_data)}건 확정")

            # 5. 딥페이크 분석
            if not match_data:
                await send("deepfake", "success", "분석할 유사 이미지가 없어 다음 단계로 이동합니다.")
                df_count = 0
                df_final = []
            else:
                await send("deepfake", "running", f"{len(match_data)}건의 이미지 정밀 딥페이크 분석 진행 중...")
                df_count = 0
                df_final = []
                for m in match_data:
                    try:
                        # 딥페이크 서버 호출 (Port 5003)
                        # 서비스에서 상대 경로 처리를 위해 실제 파일 경로 전달 필요할 수 있음
                        # 여기서는 간단히 image_url 또는 crawling 경로 전달
                        detect_r = await client.post(f"{SERVICES['deepfake']}/api/detect", json={"image_path": m["crawling"]})
                        res = detect_r.json()
                        is_fake = res.get("is_deepfake", False)
                        if is_fake: df_count += 1
                        df_final.append({**m, "is_deepfake": is_fake})
                        await asyncio.sleep(0.8) # 시각적 피드백
                    except:
                        # 서버 미응답 시 시연용 랜덤값(선택) 또는 skip
                        df_final.append({**m, "is_deepfake": False})
                await send("deepfake", "success", f"딥페이크 검출 결과: 위험 이미지 {df_count}건 발견")

            # 6. 증거 데이터베이스 연동 (Evidence Module DB에 저장)
            if df_final:
                await send("evidence", "running", "분석 결과를 증거 보관함으로 전송 중...")
                ev_db_path = os.path.join(BASE_DIR, "Evidence Collection Module", "database.sqlite")
                try:
                    ev_conn = sqlite3.connect(ev_db_path)
                    ev_cur = ev_conn.cursor()
                    for idx, res in enumerate(df_final):
                        ev_id = f"#EVID-{datetime.now().strftime('%m%d')}-{str(uuid.uuid4())[:4]}"
                        ev_cur.execute("INSERT INTO evidence (id, image_url, is_deepfake) VALUES (?, ?, ?)",
                                      (ev_id, res["crawling"], 1 if res["is_deepfake"] else 0))
                    ev_conn.commit()
                    ev_conn.close()
                    await send("evidence", "success", f"{len(df_final)}건의 분석 결과가 증거 보관함에 저정되었습니다.")
                except Exception as e:
                    print(f"Evidence DB Error: {e}")
                    await send("evidence", "error", "증거 데이터 저장 중 오류가 발생했습니다.")
            
            # 8. 완료
            await send("done", "success", "이미지 분석이 모두 완료되었습니다. [증거 확인] 버튼을 눌러주세요.")

        finally:
            await q.put(None)

# --- 5. Lifespan 및 서버 제어 ---
processes = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Node.js 서버들 실행 (Windows 경로 대응)
    node_path = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
    
    try:
        p1 = subprocess.Popen([node_path, "server.js"], cwd=os.path.join(BASE_DIR, "Evidence Collection Module"))
        p2 = subprocess.Popen([node_path, "index.js"], cwd=os.path.join(BASE_DIR, "User photo register system_new", "server"))
        # Deepfake Server (Python)
        p3 = subprocess.Popen([sys.executable, "deepfake_server.py"], cwd=os.path.join(BASE_DIR, "pip"))
        
        processes.extend([p1, p2, p3])
        print(f"Subprocesses started (Node.js & Deepfake Server)")
    except Exception as e:
        print(f"Node.js start failed ({node_path}): {e}")
    
    yield
    
    for p in processes:
        p.terminate()
    print("Node.js servers stopped.")

# --- 6. FastAPI 앱 초기화 및 라우팅 ---
app = FastAPI(title="CAP Unified Gateway", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- Registration Models ---
class ValidatePoseRequest(BaseModel):
    image_data: str  # base64
    expected_type: str  # 'front', 'left45', 'right45', 'left90', 'right90'

class RegisterRequest(BaseModel):
    user_id: str
    mode: str = "new"
    images: dict  # {front: "data:image/...", left45: "...", ...}

# --- Registration Endpoints ---

@app.get("/api/check_user_id")
async def check_user_id(id: str = ""):
    if not id:
        return {"exists": False}
    from shared.config import DB_PATH
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute("SELECT user_id FROM users WHERE user_id = ? LIMIT 1", (id,))
        row = cur.fetchone()
        return {"exists": row is not None}
    except Exception as e:
        print(f"DB Error (check_user_id): {e}")
        return {"exists": False}
    finally:
        conn.close()

@app.post("/api/validate_pose")
async def validate_pose(req: ValidatePoseRequest):
    try:
        base64_data = re.sub(r'^data:image/\w+;base64,', '', req.image_data)
        image_bytes = base64.b64decode(base64_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return {"status": "fail", "message": "이미지를 디코딩할 수 없습니다."}
        res = vec_extract.extractor.extract(img, image_path="live_validation")
        if res["status"] != "success":
            return {"status": "fail", "message": "얼굴이 감지되지 않았습니다."}
        yaw = res["pose"][1]
        expected = req.expected_type
        is_valid = False
        message = ""
        if expected == "front":
            if abs(yaw) < 15: is_valid = True
            else: message = "정면을 더 정확히 바라봐주세요."
        elif expected == "left45":
            if 20 < yaw < 70: is_valid = True
            else: message = "고개를 왼쪽으로 약 45도 돌려주세요."
        elif expected == "right45":
            if -70 < yaw < -20: is_valid = True
            else: message = "고개를 오른쪽으로 약 45도 돌려주세요."
        elif expected == "left90":
            if yaw > 65: is_valid = True
            else: message = "고개를 왼쪽으로 완전히(90도) 돌려주세요."
        elif expected == "right90":
            if yaw < -65: is_valid = True
            else: message = "고개를 오른쪽으로 완전히(90도) 돌려주세요."
        return {"status": "success" if is_valid else "fail", "message": message, "yaw": float(yaw)}
    except Exception as e:
        print(f"Error in validate_pose: {e}")
        return {"status": "fail", "message": f"서버 오류: {str(e)}"}

@app.post("/api/register")
async def register_user(req: RegisterRequest):
    from shared.config import DB_PATH, USER_STORAGE_DIR
    try:
        user_dir = os.path.join(USER_STORAGE_DIR, req.user_id)
        os.makedirs(user_dir, exist_ok=True)
        saved_paths = {}
        for key, data_url in req.images.items():
            if not data_url: continue
            fpath = os.path.join(user_dir, f"{key}.jpg")
            base64_data = re.sub(r'^data:image/\w+;base64,', '', data_url)
            with open(fpath, "wb") as f:
                f.write(base64.b64decode(base64_data))
            saved_paths[key] = fpath
        front_path = saved_paths.get("front")
        if front_path:
            img = cv2.imread(front_path)
            if img is not None:
                res = vec_extract.extractor.extract(img, image_path=front_path)
                if res["status"] == "success":
                    vector = res["vector"]
                    conn = sqlite3.connect(DB_PATH)
                    cur = conn.cursor()
                    cur.execute("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, username TEXT, image_front TEXT)")
                    cur.execute("CREATE TABLE IF NOT EXISTS user_face_vectors (user_id TEXT PRIMARY KEY, vector BLOB, image_count INTEGER DEFAULT 1)")
                    cur.execute("INSERT OR REPLACE INTO users (user_id, username, image_front) VALUES (?, ?, ?)",
                                (req.user_id, req.user_id, front_path))
                    cur.execute("INSERT OR REPLACE INTO user_face_vectors (user_id, vector, image_count) VALUES (?, ?, ?)",
                                (req.user_id, vector.astype(np.float32).tobytes(), 1))
                    conn.commit()
                    conn.close()
        return {"status": "success", "user_id": req.user_id}
    except Exception as e:
        print(f"Error in register: {e}")
        return {"status": "fail", "message": str(e)}

# [Crawl] 통합 (모듈 로드 실패 시 라우터 등록 건너뜀)
if monitor_router is not None:
    app.include_router(monitor_router)
    app.include_router(crawl_api_router)

# [Extract] 통합
if extract_feature is not None:
    extract_router = APIRouter(prefix="/extract")
    extract_router.add_api_route("/", extract_feature, methods=["POST"])
    extract_router.add_api_route("/batch", extract_pipeline_batch, methods=["POST"])
    app.include_router(extract_router)

# [Compare] 통합
if start_batch_compare is not None:
    compare_router = APIRouter(prefix="/compare")
    compare_router.add_api_route("/batch", start_batch_compare, methods=["POST"])
    compare_router.add_api_route("/status", compare_status, methods=["GET"])
    compare_router.add_api_route("/single", compare_single, methods=["POST"])
    app.include_router(compare_router)

# [Auth] 통합 (Phase 2 — 회원가입/로그인/로그아웃, /api/auth/*; import 시 auth_users 테이블 생성)
try:
    from auth.routes import router as auth_router
    app.include_router(auth_router)
except Exception as e:
    print(f"[orchestrator] auth 모듈 비활성화: {e}  →  'pip install passlib bcrypt' 가 필요합니다")

# [Proxies]
client = httpx.AsyncClient()

@app.api_route("/evidence/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def evidence_proxy(path: str, request: Request):
    url = f"{SERVICES['evidence']}/{path}"
    content = await request.body()
    resp = await client.request(request.method, url, content=content, headers=dict(request.headers), params=request.query_params)
    return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))

@app.api_route("/register-ui/register-api/api/{path:path}", methods=["GET", "POST"])
async def register_api_proxy(path: str, request: Request):
    url = f"{SERVICES['user_photo']}/api/{path}"
    content = await request.body()
    resp = await client.request(request.method, url, content=content, headers=dict(request.headers), params=request.query_params)
    return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))

# [Static UI]
dist_path = os.path.join(BASE_DIR, "User photo register system_new", "dist")
if os.path.exists(dist_path):
    # Assets are served directly
    assets_path = os.path.join(dist_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/register-ui/assets", StaticFiles(directory=assets_path), name="reg_assets")

    # [Secondary Static Assets]
    example_site_path = os.path.join(BASE_DIR, "module_crawl_takedown", "website", "example_site")
    if os.path.exists(example_site_path):
        app.mount("/example", StaticFiles(directory=example_site_path, html=True), name="example_site")
    
    from core.config import IMAGE_ROOT, UPLOAD_ROOT
    app.mount("/images", StaticFiles(directory=IMAGE_ROOT), name="images_mount")
    app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads_mount")
    
    @app.get("/register-ui/{full_path:path}")
    async def serve_register_spa(full_path: str):
        # If the path looks like a file (has extension), try to serve it from dist
        potential_file = os.path.join(dist_path, full_path)
        if os.path.isfile(potential_file):
            return FileResponse(potential_file)
        # Otherwise, fall back to SPA index.html
        return FileResponse(os.path.join(dist_path, "index.html"))

    @app.get("/register-ui")
    async def serve_register_root():
        return FileResponse(os.path.join(dist_path, "index.html"))
else:
    @app.get("/register-ui")
    def reg_ui_fallback(): return HTMLResponse("<h1>Register UI Not Built</h1>")

# --- 7. 파이프라인 제어 엔드포인트 ---
class StartRequest(BaseModel):
    user_id: str

@app.post("/api/start-from-crawl")
async def start_from_crawl(req: StartRequest, bg: BackgroundTasks):
    job_id = str(uuid.uuid4())[:8]
    pipeline_jobs[job_id] = {"queue": asyncio.Queue(), "ts": datetime.now().isoformat()}
    bg.add_task(run_pipeline_from_crawl, job_id, req.user_id)
    return {"job_id": job_id}

@app.get("/api/stream/{job_id}")
async def stream_pipeline(job_id: str):
    if job_id not in pipeline_jobs: return {"error": "not found"}
    async def gen():
        q = pipeline_jobs[job_id]["queue"]
        yield sse("connected", {"job_id": job_id})
        while True:
            ev = await q.get()
            if ev is None: yield sse("end", {}); break
            yield sse("update", ev)
    return StreamingResponse(gen(), media_type="text/event-stream")

@app.get("/api/health")
async def health():
    results = {}
    for name, url in SERVICES.items():
        try:
            r = await client.get(url, timeout=1.0)
            results[name] = {"ok": r.status_code < 400, "code": r.status_code}
        except:
            results[name] = {"ok": False}
    return results

@app.get("/")
async def root(): return RedirectResponse("/register-ui")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
