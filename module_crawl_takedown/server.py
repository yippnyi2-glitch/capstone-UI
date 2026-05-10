import os
import sys
import io
import asyncio
import logging
import json
import hashlib
import mimetypes
from datetime import datetime
from collections import deque
import uvicorn

from fastapi import FastAPI, APIRouter, Request, UploadFile, File, HTTPException, Body
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

# --- 1. 프로젝트 전역 경로 설정 (절대 경로 강제) ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_DIR = os.path.join(BASE_DIR, "website", "dashboard")
EXAMPLE_SITE_DIR = os.path.join(BASE_DIR, "website", "example_site")

# sys.path 추가 (core 모듈 등을 찾기 위함)
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from core.db import get_con
from core.config import UPLOAD_ROOT, IMAGE_ROOT, DB_PATH
from core.dtos import RunRequest

# 경로 유효성 검사 및 자동 생성
for d in [UPLOAD_ROOT, IMAGE_ROOT]:
    os.makedirs(d, exist_ok=True)

# --- 2. 로깅 설정 ---
LOG_BUFFER = deque(maxlen=200)

class DashboardLogHandler(logging.Handler):
    def emit(self, record):
        msg = self.format(record)
        LOG_BUFFER.append(f"[{record.levelname}] {msg}")

logger = logging.getLogger("server_logger")
logger.setLevel(logging.INFO)
handler = DashboardLogHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(handler)

# FastAPI 및 Uvicorn 로그도 캡처하고 싶다면 아래와 같이 리디렉션 (선택 사항)
# logging.getLogger("uvicorn").addHandler(handler)

# --- 3. FastAPI 앱 초기화 ---
app = FastAPI(title="Integrated Capstone Server")

# --- 4. 유틸리티 함수 ---
def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")

def _sha1_bytes(b: bytes) -> str:
    h = hashlib.sha1()
    h.update(b)
    return h.hexdigest()

# --- 5. API 설계: 대시보드 모니터링 ---
monitor_router = APIRouter(prefix="/api/monitor")

@monitor_router.get("/stats")
def get_stats():
    with get_con() as con:
        cur = con.cursor()
        img_count = cur.execute("SELECT COUNT(*) FROM ImageItem").fetchone()[0]
        job_counts = cur.execute("SELECT cr_status, COUNT(*) FROM CrawlJob GROUP BY cr_status").fetchall()
        jobs_dict = {row[0]: row[1] for row in job_counts}
        site_stats = cur.execute("""
            SELECT s.site_id, s.name, 
                   (SELECT COUNT(*) FROM ImageItem WHERE site_id = s.site_id) as img_count,
                   (SELECT cr_status FROM CrawlJob WHERE site_id = s.site_id ORDER BY crawl_job_id DESC LIMIT 1) as last_status
            FROM SourceSite s
        """).fetchall()
        origin_count = cur.execute("SELECT COUNT(*) FROM ExternalPost").fetchone()[0]
        
        sites_list = []
        for s in site_stats:
            sites_list.append({
                "site_id": s["site_id"],
                "name": s["name"],
                "images": s["img_count"],
                "status": s["last_status"] or "IDLE"
            })
    
    return {
        "total_images": img_count,
        "origin_images": origin_count,
        "job_stats": jobs_dict,
        "running_jobs": jobs_dict.get("RUNNING", 0),
        "sites": sites_list
    }

@monitor_router.get("/live-images")
async def get_live_images(limit: int = 15):
    with get_con() as con:
        cur = con.cursor()
        rows = cur.execute("""
            SELECT image_url, file_path, created_at 
            FROM ImageItem 
            ORDER BY image_id DESC 
            LIMIT ?
        """, (limit,)).fetchall()
    
    result = []
    for r in rows:
        filename = os.path.basename(r["file_path"])
        result.append({
            "url": f"/images/{filename}", 
            "origin_url": r["image_url"],
            "time": r["created_at"]
        })
    return result

@monitor_router.get("/logs")
async def get_logs():
    return list(LOG_BUFFER)

@monitor_router.post("/run-now")
async def run_crawl_now(user_id: int = 1):
    def execution_thread():
        try:
            print(f"Starting crawl process for user {user_id}...")
            req = RunRequest(user_id=user_id, site_ids=None)
            from crawler_modules.collection_target_setup import collection_target_setup
            from crawler_modules.crawler_executor import crawler_executor
            from crawler_modules.image_storage import image_storage
            
            plan = collection_target_setup(req)
            task_list = crawler_executor(plan)
            stored_n = image_storage(task_list)
            print(f"Server-side execution done. Stored {stored_n} new items.")
        except Exception as e:
            print(f"Execution Error: {e}")

    asyncio.get_event_loop().run_in_executor(None, execution_thread)
    return {"ok": True}

# --- 6. API 설계: 백엔드 핵심 (기존 backend.py 통합) ---
api_router = APIRouter(prefix="/api")

@api_router.get("/items_count")
def get_items_count():
    with get_con() as con:
        cur = con.cursor()
        n = cur.execute("SELECT COUNT(*) FROM ExternalPost").fetchone()[0]
    return {"ExternalPost": n}

@api_router.post("/upload")
async def upload_image(file: UploadFile = File(...), user_id: int = 1, site_id: int = 0, tags: str = ""):
    data = await file.read()
    if not data: raise HTTPException(400, "empty file")
    img_hash = _sha1_bytes(data)
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/jpeg"
    ext = mimetypes.guess_extension(mime) or ".jpg"
    filename = f"{img_hash}{ext}"
    file_path = os.path.join(UPLOAD_ROOT, filename)
    
    if not os.path.exists(file_path):
        with open(file_path, "wb") as f:
            f.write(data)
            
    image_url = f"/uploads/{filename}"
    tag_list = [t.strip() for t in (tags or "").split(",") if t.strip()]
    tags_json = json.dumps(tag_list, ensure_ascii=False)

    with get_con() as con:
        try:
            con.cursor().execute("INSERT INTO ExternalPost (site_id, image_url, file_path, image_hash, tags) VALUES (?, ?, ?, ?, ?)", (site_id, image_url, file_path, img_hash, tags_json))
        except: pass
    return {"ok": True, "image_url": image_url, "tags": tag_list}

@api_router.post("/clear_uploaded")
def clear_uploaded():
    with get_con() as con:
        con.cursor().execute("DELETE FROM ImageItem")
    removed = 0
    if os.path.isdir(UPLOAD_ROOT):
        for name in os.listdir(UPLOAD_ROOT):
            path = os.path.join(UPLOAD_ROOT, name)
            if os.path.isfile(path):
                try: os.remove(path); removed += 1
                except: pass
    return {"ok": True, "deleted_files": removed}

@api_router.get("/latest_items")
def latest_items(limit: int = 20, tag: str = ""):
    with get_con() as con:
        cur = con.cursor()
        if tag:
            like = f'%"{tag}"%'
            rows = cur.execute("SELECT image_url, file_path, image_hash, tags FROM ExternalPost WHERE tags LIKE ? ORDER BY rowid DESC LIMIT ?", (like, limit)).fetchall()
        else:
            rows = cur.execute("SELECT image_url, file_path, image_hash, tags FROM ExternalPost ORDER BY rowid DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        try:
            t = json.loads(r["tags"]) if r["tags"] else []
            out.append({"image_url": r["image_url"], "file_path": r["file_path"], "image_hash": r["image_hash"], "tags": t})
        except:
            out.append({"image_url": r[0], "file_path": r[1], "image_hash": r[2], "tags": []})
    return out

@api_router.post("/update_tags")
async def update_tags(body: dict = Body(...)):
    image_hash = body.get("image_hash")
    tags = body.get("tags", [])
    if not image_hash: raise HTTPException(400, "image_hash required")
    tags_json = json.dumps(tags, ensure_ascii=False)
    with get_con() as con:
        con.cursor().execute("UPDATE ImageItem SET tags = ? WHERE image_hash = ?", (tags_json, image_hash))
    return {"ok": True, "tags": tags}

@api_router.post("/takedown/candidate/add")
def takedown_candidate_add(
    user_id: int = 1, 
    site_id: int = 1, 
    target_url: str = "", 
    reason: str = "Non-consensual deepfake content", 
    evidence_url: str = "", 
    ready: int = 1,
    applicant_name: str = "",
    applicant_email: str = "",
    right_type: str = "",
    consent_truth: int = 0,
    consent_privacy: int = 0
):
    target_url = (target_url or "").strip()
    if not target_url: raise HTTPException(400, "target_url is empty")
    with get_con() as con:
        try:
            con.cursor().execute("""
                INSERT INTO TakedownCandidate 
                (user_id, site_id, target_url, reason, evidence_url, ready, created_at, 
                 applicant_name, applicant_email, right_type, consent_truth, consent_privacy) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (int(user_id), int(site_id), target_url, reason, evidence_url, int(ready), _now(),
                  applicant_name, applicant_email, right_type, int(consent_truth), int(consent_privacy)))
        except Exception as e:
            print(f"Error adding candidate: {e}")
            pass
    return {"ok": True}

@api_router.get("/takedown/candidates")
def takedown_candidates(limit: int = 50, ready: int | None = None):
    with get_con() as con:
        cur = con.cursor()
        if ready is None:
            rows = cur.execute("SELECT * FROM TakedownCandidate ORDER BY candidate_id DESC LIMIT ?", (limit,)).fetchall()
        else:
            rows = cur.execute("SELECT * FROM TakedownCandidate WHERE ready=? ORDER BY candidate_id DESC LIMIT ?", (int(ready), limit)).fetchall()
    return [dict(r) if hasattr(r, "keys") else list(r) for r in rows]

@api_router.post("/takedown/create_from_tag")
def takedown_create_from_tag(tag: str, user_id: int = 1, site_id: int | None = None, limit: int = 50):
    tag = (tag or "").strip()
    inserted = 0
    with get_con() as con:
        cur = con.cursor()
        sql = "SELECT site_id, image_url, tags FROM ImageItem ORDER BY rowid DESC LIMIT ?"
        rows = cur.execute(sql, (limit,)).fetchall() if site_id is None else cur.execute("SELECT site_id, image_url, tags FROM ImageItem WHERE site_id=? ORDER BY rowid DESC LIMIT ?", (site_id, limit)).fetchall()
        for r in rows:
            try: t_list = json.loads(r["tags"] or "[]")
            except: t_list = []
            if tag and tag not in t_list: continue
            url = (r["image_url"] or "").strip()
            if not url: continue
            try:
                cur.execute("INSERT INTO TakedownCandidate (user_id, site_id, target_url, reason, evidence_url, ready, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)", (int(user_id), int(r["site_id"]), url, "Non-consensual deepfake content", "", _now()))
                inserted += 1
            except: pass
    return {"ok": True, "inserted_candidates": inserted}

@api_router.post("/takedown/create_from_candidate")
def takedown_create_from_candidate(limit: int = 50):
    with get_con() as con:
        cur = con.cursor()
        rows = cur.execute("SELECT * FROM TakedownCandidate WHERE ready=1 ORDER BY candidate_id ASC LIMIT ?", (limit,)).fetchall()
    if not rows: return {"ok": True, "created": 0}
    norm = []
    for r in rows:
        if hasattr(r, "keys"):
            norm.append(dict(r))
        else:
            # candidate_id, user_id, site_id, target_url, reason, evidence_url, ready, created_at, 
            # applicant_name, applicant_email, right_type, consent_truth, consent_privacy
            norm.append({
                "candidate_id": r[0], "user_id": r[1], "site_id": r[2], "target_url": r[3],
                "reason": r[4], "evidence_url": r[5],
                "applicant_name": r[8], "applicant_email": r[9], "right_type": r[10],
                "consent_truth": r[11], "consent_privacy": r[12]
            })
    
    if not rows: return {"ok": True, "created": 0}
    
    by_user = {}
    picked_ids = []
    for r in norm:
        picked_ids.append(r["candidate_id"])
        by_user.setdefault(r["user_id"], []).append({
            "site_id": r["site_id"], 
            "target_url": r["target_url"],
            "reason": r.get("reason"),
            "applicant_name": r.get("applicant_name"),
            "applicant_email": r.get("applicant_email"),
            "right_type": r.get("right_type"),
            "consent_truth": r.get("consent_truth"),
            "consent_privacy": r.get("consent_privacy")
        })
    created_total = 0
    from takedown_modules.takedown_request_generator import create_takedown_requests
    for uid, targets in by_user.items():
        created_total += create_takedown_requests(user_id=int(uid), targets=targets)
    with get_con() as con:
        placeholders = ",".join(["?"] * len(picked_ids))
        con.cursor().execute(f"UPDATE TakedownCandidate SET ready=0 WHERE candidate_id IN ({placeholders})", tuple(picked_ids))
    return {"ok": True, "created": created_total}

@api_router.post("/takedown/mark_sent")
def takedown_mark_sent(request_id: int):
    with get_con() as con:
        con.cursor().execute("UPDATE TakedownRequest SET status='SENT', updated_at=? WHERE request_id=?", (_now(), request_id))
    return {"ok": True}

@api_router.post("/takedown/run_tracker")
def takedown_run_tracker(limit: int = 50):
    from takedown_modules.takedown_status_tracker import run_status_check, run_automated_submissions
    from takedown_modules.takedown_notifier import create_notifications_for_final_status
    
    # 1. READY 상태의 자동 제출 수행 (신규)
    submitted = run_automated_submissions(limit=limit)
    
    # 2. 기존 상태 확인 및 알림 생성
    updated = run_status_check(limit=limit)
    made = create_notifications_for_final_status(limit=limit)
    
    return {
        "ok": True, 
        "automated_submissions": submitted,
        "updated_status": updated, 
        "created_notifications": made
    }

@api_router.get("/notifications")
def get_notifications(limit: int = 50):
    with get_con() as con:
        cur = con.cursor()
        rows = cur.execute("SELECT * FROM Notification ORDER BY noti_id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) if hasattr(r, "keys") else list(r) for r in rows]

# --- 7. 정적 서빙 및 라우팅 설정 (최종 통합) ---

# 루트('/') -> 대시보드로 이동
@app.get("/")
async def go_home():
    return RedirectResponse(url="/dashboard/dashboard.html")

# 1. 대시보드 (StaticFiles로 자동 해결 - 슬래시 문제 및 상대경로 해결)
app.mount("/dashboard", StaticFiles(directory=DASHBOARD_DIR, html=True), name="dashboard")

# 2. 연습용 사이트 (StaticFiles로 자동 해결)
app.mount("/example", StaticFiles(directory=EXAMPLE_SITE_DIR, html=True), name="example")

# 3. 기타 공용 리소스
app.mount("/images", StaticFiles(directory=IMAGE_ROOT), name="images_mount")
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads_mount")

# 모든 라우터 등록
app.include_router(monitor_router)
app.include_router(api_router)
if __name__ == "__main__":
    print("="*50)
    print("   Capstone Integrated Server Started!")
    print(f"   - 대시보드: http://localhost:8888/dashboard/dashboard.html")
    print(f"   - 연습 사이트: http://localhost:8888/example/index.html")
    print(f"   - DB 경로: {DB_PATH}")
    print("   (기존 5550 또는 8000 포트 서버와 중복 실행하지 마세요.)")
    print("="*50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8888)
