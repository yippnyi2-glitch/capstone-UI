# Vector Match System — Implementation Plan v2

## Goal

얼굴 특징벡터 비교부 설계 확정본 (v3) 기준으로 구현한다.  
데모용 웹 UI를 함께 제공하여 벡터 매칭 과정을 시각적으로 확인할 수 있게 한다.

---

## 확정 사항

| 항목 | 결정 내용 |
|---|---|
| SQLite 동시 접근 | WAL 모드 — 추출부 쓰기 중에도 비교부 읽기 허용, 대기 없음 |
| 딥페이크 모듈 연계 | 환경변수 스위칭 방식으로 모킹 — 준비되면 환경변수만 변경 |
| matcher.py 분리 | find_best_match() 순수 검색 로직만 분리, 배치 흐름은 comparator.py |
| UI 데모 엔드포인트 | /compare/single 사용 (배치 흐름 건드리지 않음) ※ Claude 제안 |

---

## 파일 구조

```
Vector Match System/
├── src/
│   ├── main.py               # FastAPI 앱, 엔드포인트 정의, static 마운트
│   ├── db/
│   │   └── database.py       # SQLite 연결 (WAL 모드), match_results 테이블 생성
│   └── services/
│       ├── matcher.py        # find_best_match() — 순수 NumPy 검색 로직만
│       └── comparator.py     # 배치 흐름 전체 (Redis 조회, 루프, INSERT, 신호 전달)
├── static/
│   ├── index.html            # 데모 UI 구조
│   ├── style.css             # 다크모드, 유사도 시각화 애니메이션
│   └── app.js                # /compare/single 호출, 1:N 매칭 단계별 시각화
├── .env                      # 환경변수 (경로, 포트, MOCK_DEEPFAKE 플래그)
└── requirements.txt
```

---

## 구현 상세

### `src/db/database.py`

- 추출부의 기존 SQLite 파일을 그대로 연결 (복사 불필요)
- WAL 모드 활성화로 추출부 쓰기 중 비교부 읽기 허용
- `match_results` 테이블 없으면 자동 생성

```python
conn = sqlite3.connect(settings.SQLITE_PATH)
conn.execute("PRAGMA journal_mode=WAL")
```

```sql
CREATE TABLE IF NOT EXISTS match_results (
    id                   INTEGER  PRIMARY KEY AUTOINCREMENT,
    crawling_image_path  TEXT     NOT NULL,
    user_id              TEXT     NOT NULL,
    user_image_path      TEXT     NOT NULL,
    cosine_similarity    REAL     NOT NULL,
    created_at           TEXT     DEFAULT datetime('now')
);
```

---

### `src/services/matcher.py`

find_best_match() 만 존재. 검색 알고리즘 외 아무것도 없음.  
나중에 FAISS로 교체할 때 이 파일만 수정하면 됨.

```python
import numpy as np

def find_best_match(crawling_vec, user_vectors, user_ids, threshold=0.8):
    # L2 정규화 완료 전제 → dot product = 코사인 유사도
    similarities = np.dot(user_vectors, crawling_vec)  # shape: (N,)

    matched_indices = np.where(similarities >= threshold)[0]
    results = []
    for idx in matched_indices:
        results.append({
            "user_id": user_ids[idx],
            "cosine_similarity": float(similarities[idx])
        })
    return results  # 빈 리스트면 매칭 없음
```

---

### `src/services/comparator.py`

배치 흐름 전체 담당. find_best_match()가 어떻게 검색하는지 알 필요 없음.

주요 흐름:
1. Redis에서 `crawling:*:face:0` 키 전체 조회
2. SQLite `user_face_vectors`에서 사용자 벡터 전체 로드 (배치 시작 시 1회)
3. 크롤링 벡터마다 find_best_match() 호출
4. matches 있으면 match_results INSERT, 없으면 스킵
5. Redis 키 DEL
6. 전체 완료 후 딥페이크 판별부 신호 전달

딥페이크 모듈 신호 전달 (환경변수 스위칭):

```python
def notify_deepfake_module(results):
    if settings.MOCK_DEEPFAKE:
        logger.info(f"[MOCK] POST /deepfake/batch — {len(results)}건")
    else:
        requests.post(settings.DEEPFAKE_URL, json=results)
```

---

### `src/main.py`

| 엔드포인트 | 메서드 | 호출 주체 | 역할 |
|---|---|---|---|
| /compare/batch | POST | 벡터 추출부 | 배치 비교 실행 트리거 |
| /compare/single | POST | 데모 UI | 단일 이미지 즉시 비교 ※ Claude 제안 |
| /compare/status | GET | 개발자 디버깅 | 마지막 배치 결과 요약 ※ Claude 제안 |

POST /compare/batch 요청 본문:
```json
{ "threshold": 0.8 }
```

---

### `.env`

```
SQLITE_PATH=../extraction_system/database.db
REDIS_HOST=localhost
REDIS_PORT=6379
MOCK_DEEPFAKE=true
DEEPFAKE_URL=http://localhost:8002/deepfake/batch
```

`MOCK_DEEPFAKE=false` 로 바꾸면 실제 딥페이크 판별부로 POST 전송.

---

### `requirements.txt`

```
fastapi
uvicorn
redis
numpy
requests
python-dotenv
```

※ sqlite3는 Python 내장 모듈이므로 제외

---

### 데모 UI (`static/`)

- 추출부가 없어도 /compare/single로 단일 이미지 즉시 비교 가능
- 1:N 매칭 과정 단계별 시각화
- 유사도 >= 0.8: 초록색 강조 / 미만: 흐리게 표시
- 다크모드 기본

---

## 검증 계획

### 수동 검증

1. Redis 서버 로컬 실행
2. `.env`에서 경로 설정
3. FastAPI 서버 실행
   ```bash
   cd "Vector Match System"
   uvicorn src.main:app --reload
   ```
4. `http://localhost:8000/` 브라우저에서 확인
5. "Start Visual Match Demo" 클릭
6. 유사도 시각화 및 >= 0.8 매칭 확인
7. SQLite `match_results` 테이블에 매칭 건만 INSERT 됐는지 확인
8. 로그에서 `[MOCK] POST /deepfake/batch` 출력 확인

### 단위 테스트 ※ Claude 제안

- find_best_match() NumPy dot product 결과 검증
- threshold 경계값 (0.8 정확히) 처리 확인

---

## 내일 할 일

- `MOCK_DEEPFAKE=false` 전환
- `DEEPFAKE_URL` 딥페이크 판별부 실제 주소로 변경
- 딥페이크 판별부 연동 테스트

---

※ `※ Claude 제안` 표시 항목은 요구사항에 없으나 Claude가 추가한 항목입니다.
