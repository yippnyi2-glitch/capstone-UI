# CAP System — 통합 파이프라인 설정 가이드

## 파일 구조

```
cap_integration/
├── orchestrator.py      ← 중앙 오케스트레이터 (이 서버만 추가됨)
├── index.html           ← 통합 UI (orchestrator가 자동으로 서빙)
├── deepfake_server.py   ← deepfake_detector.py가 HTTP 서버가 없을 때만 사용
├── requirements.txt
└── README.md
```

> **각 모듈 내부 코드는 수정하지 않습니다.**
> 오케스트레이터는 화살표(모듈 간 연결)만 담당합니다.

---

## 1단계 — 각 모듈 서버 포트 확인

| 모듈 폴더 | 서버 파일 | 기본 포트 | orchestrator.py 의 변수 |
|---|---|---|---|
| `User photo register system_new` | `server/` (Express) | 3001 | `SERVICES["user_photo"]["url"]` |
| `vector_extract_core_py_files` | `src/` 또는 `scripts/` | 5001 | `SERVICES["vector_extract"]["url"]` |
| `crwaling,takedown` | `server.py` | 5000 | `SERVICES["crawling"]["url"]` |
| `VectorMatch_Share` | `src/` | 5002 | `SERVICES["vector_match"]["url"]` |
| `deepfake_detector.py` | (래핑 필요 → `deepfake_server.py`) | 5003 | `SERVICES["deepfake"]["url"]` |
| `Evidence Collection Module` | `server.js` | 3002 | `SERVICES["evidence"]["url"]` |

**실제 포트가 다르면** `orchestrator.py` 상단 `SERVICES` 딕셔너리의 `"url"` 값만 바꾸면 됩니다.

---

## 2단계 — 각 모듈에 `/health` 엔드포인트 추가 (선택)

헤더의 상태 표시를 위해 각 모듈 서버에 아래를 추가하면 좋습니다:

```python
# Flask
@app.route('/health')
def health():
    return {'ok': True}

# FastAPI
@app.get('/health')
def health():
    return {'ok': True}
```

```js
// Express
app.get('/health', (req, res) => res.json({ ok: true }));
```

---

## 3단계 — API 계약 (각 모듈이 응답해야 할 형식)

### User Photo Register  `POST /api/register`
```json
// Request: multipart/form-data
// - file: image
// - user_id: string

// Response:
{ "user_id": "test_user", "saved_path": "/uploads/test_user.jpg" }
```

### Vector Extract  `POST /api/extract`
```json
// Request:
{ "image_base64": "...", "user_id": "optional" }
// 또는
{ "image_url": "https://...", "source_url": "https://원본페이지" }

// Response:
{ "face_detected": true, "vector": [0.12, -0.34, ...] }
```

### Crawling  `POST /api/crawl/start`
```json
// Request:
{ "user_id": "test_user" }
// Response:
{ "job_id": "abc123" }
```

`GET /api/crawl/status?job_id=abc123`
```json
{
  "status": "completed",
  "images": [
    { "url": "https://cdn.../img.jpg", "source_url": "https://사이트/페이지", "site": "example.com" }
  ]
}
```

### Vector Match  `POST /api/compare`
```json
// Request:
{
  "user_vector": [...],
  "candidates": [
    { "vector": [...], "image_url": "...", "source_url": "...", "site": "..." }
  ],
  "threshold": 0.6
}
// Response:
{ "matches": [ { "image_url": "...", "source_url": "...", "site": "...", "similarity": 0.92 } ] }
```

### Deepfake Detect  `POST /api/detect`
```json
// Request:
{ "image_url": "https://cdn.../img.jpg" }
// Response:
{ "is_deepfake": true, "confidence": 0.87 }
```

### Evidence Collect  `POST /api/evidence/collect`
```json
// Request:
{ "user_id": "test_user", "matches": [...deepfake_results], "timestamp": "2024-01-01T..." }
// Response:
{ "evidence_id": "ev_abc123" }
```

### Takedown Request  `POST /api/takedown/request`
```json
// Request:
{ "evidence_id": "ev_abc123", "user_id": "test_user", "urls": ["https://..."] }
// Response:
{ "request_id": "req_xyz789" }
```

`GET /api/takedown/status?request_id=req_xyz789`
```json
{
  "status": "completed",
  "results": [
    { "url": "https://...", "success": true, "message": "삭제 완료" }
  ]
}
```

---

## 4단계 — 실행 순서

```bash
# 1) 각 모듈 서버 실행 (기존 방식 그대로)
cd "crwaling,takedown" && python server.py &
cd "Evidence Collection Module" && node server.js &
cd "User photo register system_new" && npm run dev &
cd vector_extract_core_py_files && python src/server.py &
cd VectorMatch_Share && python src/server.py &

# 2) deepfake_detector.py 에 HTTP 서버가 없을 경우만:
python cap_integration/deepfake_server.py &

# 3) 통합 오케스트레이터 실행
cd cap_integration
pip install -r requirements.txt
python orchestrator.py

# 4) 브라우저에서 확인
open http://localhost:8080
```

---

## 5단계 — 동작 흐름

```
브라우저 → orchestrator(8080)
  ├─ POST /api/start          → 파이프라인 잡 생성
  └─ GET  /api/stream/{job_id} (SSE)
       ├─ user_photo(3001):  /api/register
       ├─ vector_extract(5001): /api/extract  ← 사용자 사진
       ├─ crawling(5000):    /api/crawl/start + /status
       ├─ vector_extract(5001): /api/extract  ← 크롤 이미지들
       ├─ vector_match(5002): /api/compare
       ├─ deepfake(5003):    /api/detect  × N
       ├─ evidence(3002):    /api/evidence/collect
       └─ crawling(5000):    /api/takedown/request + /status
```

---

## 자주 발생하는 문제

| 증상 | 해결 |
|---|---|
| 헤더 칩이 모두 빨간색 | 각 모듈 서버가 실행 중인지 확인 |
| "face_detected: false" | 정면 얼굴 사진 사용, 해상도 확인 |
| 크롤링 단계에서 멈춤 | crawling/server.py 로그 확인, 타임아웃 60초 |
| CORS 오류 | 각 모듈 서버에 CORS 허용 추가 |
| 딥페이크 서버 임포트 실패 | deepfake_detector.py 의 실제 함수명 확인 후 deepfake_server.py 수정 |
