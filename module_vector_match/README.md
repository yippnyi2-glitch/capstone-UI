# 얼굴 특징벡터 비교부 설계 확정 사항
설계 검토 회의 결과 최종 정리 (v3)  
※ 추출부 설계(v4) 연계 기준 작성

---

## 0. 전체 확정 사항 요약

| 항목 | 확정 내용 |
|---|---|
| 호출 방식 | 배치(Batch) — 벡터 추출부 완료 후 POST /compare/batch 수신 |
| 트리거 주체 | 벡터 추출부 (크롤링 모듈 아님) |
| 비교 알고리즘 | 코사인 유사도 (NumPy dot product, L2 정규화 전제) |
| 비교 임계값 | 0.8 이상 → 매칭 대상 (실험 후 조정) |
| 복수 매칭 처리 | 0.8 이상 전원 결과 구조체 생성 (1명으로 좁히지 않음) |
| 비교 입력 소스 | Redis (크롤링 벡터) ↔ SQLite (사용자 벡터) |
| 결과 저장소 | SQLite match_results 테이블 (신규 생성, 매칭 있는 건만 INSERT) |
| 다음 모듈 연계 | 저장 완료 후 POST /deepfake/batch 신호 전달 |
| API 프레임워크 | FastAPI (추출부와 동일 패턴) |
| 로그 방식 | Python logging, JSON 포맷, RotatingFileHandler |
| 검색 로직 캡슐화 | find_best_match() 함수로 분리 — 추후 FAISS 교체 대비 |

---

## 1. 전체 파이프라인 연계

비교부는 추출부로부터 신호를 받아 실행되고, 완료 후 딥페이크 판별부에 신호를 전달한다.  
각 모듈은 POST 요청으로 순차적으로 연결되며, 신호를 던진 쪽은 응답을 기다리지 않는다.

```
크롤링 모듈
    → 벡터 추출부  (크롤링 이미지 특징벡터 추출 완료)
        → POST /compare/batch
            → 비교부  (코사인 유사도 계산 → match_results INSERT)
                → POST /deepfake/batch
                    → 딥페이크 판별부  (match_results SELECT → 판별 시작)
```

---

## 2. 처리 흐름 (Matching Pipeline)

### 2-1. 전체 흐름

| 단계 | 내용 | 비고 |
|---|---|---|
| ① 트리거 수신 | POST /compare/batch 요청 수신 | 벡터 추출부 → 비교부 |
| ② 데이터 로드 | Redis 크롤링 벡터 목록 + SQLite 사용자 벡터 전체 로드 | 배치 시작 시 1회 |
| ③ 1:N 유사도 계산 | 크롤링 벡터 1개 × 전체 사용자 벡터 | find_best_match() 호출 |
| ④ 임계값 필터링 | 유사도 ≥ 0.8 전원 추출 | 미만 즉시 폐기 |
| ⑤ 결과 구조체 생성 | crawling_image_path + user_id + user_image_path + 유사도 | 복수 매칭 전원 포함 |
| ⑥ SQLite INSERT | matches 있을 때만 match_results 테이블에 저장 | 매칭 없으면 스킵 |
| ⑦ Redis 키 삭제 | 비교 완료 크롤링 벡터 명시적 삭제 | TTL 미사용 정책 준수 |
| ⑧ 루프 반복 | 다음 크롤링 벡터로 ③~⑦ 반복 | |
| ⑨ 완료 신호 전달 | POST /deepfake/batch 호출 (응답 대기 없음) | 비교부 → 딥페이크 판별부 |

### 2-2. 코사인 유사도 계산 (find_best_match)

L2 정규화된 벡터(추출부 보장)를 사용하므로 코사인 유사도 = 단순 내적(dot product)과 동일하다.

```python
def find_best_match(crawling_vec, user_vectors, user_ids, threshold=0.8):
    # L2 정규화 완료 전제 → dot product = 코사인 유사도
    similarities = np.dot(user_vectors, crawling_vec)  # shape: (N,)

    # 0.8 이상 전원 추출 (1명으로 좁히지 않음)
    matched_indices = np.where(similarities >= threshold)[0]
    results = []
    for idx in matched_indices:
        results.append({
            "user_id": user_ids[idx],
            "cosine_similarity": float(similarities[idx])
        })
    return results  # 빈 리스트면 매칭 없음
```

### 2-3. 검색 로직 캡슐화 목적

- find_best_match() 내부만 교체하면 NumPy → FAISS로 전환 가능
- batch_compare()는 find_best_match()가 어떻게 검색하는지 알 필요 없음
- API, Redis 삭제, 로그, SQLite INSERT 등 나머지 코드는 전혀 변경 불필요

---

## 3. 데이터 소스 연계

### 3-1. Redis — 크롤링 벡터

| 항목 | 내용 |
|---|---|
| 키 패턴 | crawling:{이미지ID}:face:0  (추출부 규칙 준수) |
| 값 형식 | numpy float32 bytes (512차원, L2 정규화 완료) |
| 전체 조회 | KEYS crawling:*:face:0 |
| 삭제 시점 | 해당 크롤링 이미지 비교 완료 즉시 DEL |

### 3-2. SQLite — 사용자 벡터 (기존 테이블)

| 항목 | 내용 |
|---|---|
| 테이블 | user_face_vectors  (추출부 설계 v4 기존 테이블) |
| 조회 컬럼 | user_id, vector (BLOB), image_count |
| 역직렬화 | np.frombuffer(blob, dtype=np.float32).reshape(512) |
| 캐싱 | 배치 시작 시 전체 로드 후 메모리 보유 (소규모 최적화) |

### 3-3. SQLite — 비교 결과 (신규 테이블)

비교부가 새로 만드는 테이블. 기존 users, user_face_vectors 테이블과 무관하다.

```sql
CREATE TABLE match_results (
    id                   INTEGER  PRIMARY KEY AUTOINCREMENT,
    crawling_image_path  TEXT     NOT NULL,
    user_id              TEXT     NOT NULL,
    user_image_path      TEXT     NOT NULL,
    cosine_similarity    REAL     NOT NULL,
    created_at           TEXT     DEFAULT datetime('now')
);
```

딥페이크 판별부는 POST /deepfake/batch 신호를 받은 뒤 이 테이블을 SELECT해서 처리를 시작한다.

---

## 4. 결과 구조체

### 4-1. 단일 크롤링 이미지 결과 (매칭 있음)

0.8 이상인 사용자가 존재할 때만 구조체를 생성한다. 매칭 없는 크롤링 이미지는 구조체 자체를 만들지 않는다.

```json
{
  "crawling_image_path": "/crawling/img_001.jpg",
  "matches": [
    {
      "user_id":           "abc",
      "user_image_path":   "/images/abc_front.jpg",
      "cosine_similarity": 0.91
    },
    {
      "user_id":           "xyz",
      "user_image_path":   "/images/xyz_front.jpg",
      "cosine_similarity": 0.83
    }
  ]
}
```

### 4-2. 배치 전체 응답

results 리스트에는 매칭이 있는 크롤링 이미지만 포함된다. 매칭 없는 이미지는 리스트에 담지 않는다.

```json
{
  "total_crawled": 10,
  "total_matched": 3,
  "results": [
    {
      "crawling_image_path": "/crawling/img_001.jpg",
      "matches": [
        { "user_id": "abc", "user_image_path": "/images/abc_front.jpg", "cosine_similarity": 0.91 },
        { "user_id": "xyz", "user_image_path": "/images/xyz_front.jpg", "cosine_similarity": 0.83 }
      ]
    },
    ...
    // 매칭 없는 이미지는 여기 포함되지 않음
  ]
}
```

---

## 5. API 설계 (FastAPI)

| 엔드포인트 | 메서드 | 호출 주체 | 역할 |
|---|---|---|---|
| /compare/batch | POST | 벡터 추출부 | 배치 비교 실행 트리거 |
| /compare/single | POST | 개발자 (디버깅) | 단일 이미지 즉시 비교 ※ Claude 제안 |
| /compare/status | GET | 개발자 (디버깅) | 마지막 배치 결과 요약 ※ Claude 제안 |

### 5-1. POST /compare/batch 요청 본문

```json
{
  "threshold": 0.8
}
```

※ threshold 생략 시 기본값 0.8 적용

---

## 6. 오류 처리 및 로그

### 6-1. 폐기 및 예외 처리

| 조건 | 처리 | 로그 레벨 |
|---|---|---|
| 유사도 0.8 미만 (전원) | 구조체 생성 없음, Redis 키만 삭제 | INFO |
| Redis 키 역직렬화 실패 | 해당 키 스킵, 오류 기록 후 계속 | ERROR |
| SQLite 벡터 로드 실패 | 배치 중단, 오류 반환 | ERROR |
| match_results INSERT 실패 | 해당 건 오류 기록 후 계속 | ERROR |
| POST /deepfake/batch 실패 | 재시도 없음, 오류 기록 | ERROR |
| Redis 키 삭제 실패 | 오류 기록 후 계속 (재시도 없음) | WARN |

### 6-2. 로그 설계

| 로그 파일 | 레벨 | 내용 |
|---|---|---|
| logs/face_matching.log | INFO | 정상 비교 처리 — 매칭 결과, 유사도, Redis 삭제, DB INSERT |
| logs/face_matching_error.log | ERROR / WARN | 역직렬화 실패, DB 오류, 신호 전달 실패 |

로그 포맷 예시 (JSON 한 줄):

```json
{"timestamp":"2024-01-01T12:00:01","crawling_id":"img_001","matched_count":2,"level":"INFO"}
{"timestamp":"2024-01-01T12:00:02","crawling_id":"img_002","reason":"no_match","best_score":0.61,"level":"INFO"}
```

---

## 7. 미결 사항 (구현 시 확정)

| 항목 | 내용 |
|---|---|
| 임계값 최종값 | 0.8로 시작, 실제 크롤링 데이터로 실험 후 조정 |
| POST /deepfake/batch URL | 딥페이크 판별부 서버 주소 및 포트 확정 필요 |
| Redis 서버 주소/포트 | 구현 시 확정 |
| 로그 파라미터 | RotatingFileHandler 최대 파일 크기 및 백업 개수 |
| /compare/single 유지 여부 | 디버깅 완료 후 프로덕션 빌드에서 제거 검토 |
| match_results 보존 정책 | 딥페이크 판별부 처리 완료 후 삭제 여부 결정 |

---

※ 본 문서는 추출부 설계(v4) 연계 기준으로 작성된 비교부 설계 확정본 (v3)입니다.  
※ `※ Claude 제안` 표시 항목은 요구사항에 없으나 Claude가 추측하여 추가한 항목입니다.
