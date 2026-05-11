"""POST/GET /api/deletion-requests — 사용자별 삭제 요청 기록·조회 (JWT 인증).

unified_master.db **같은 파일**에 새 테이블 deletion_requests 를 둔다(기존 users / match_results /
auth_users 와 무관). 실제 호스팅 사업자 발송은 module_crawl_takedown 의 별도 워크플로이며 여기선
요청을 기록하고 현황을 돌려주기만 한다(상태 추적은 최소 — 신규 요청은 모두 '응답 대기').

에러 응답은 프론트 ApiError 계약에 맞춰 { message, code, fieldErrors? } JSON 으로 반환한다.
"""

import os
import re
import json
import sqlite3
import logging
from datetime import datetime
from typing import Optional, List
from urllib.parse import urlsplit

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth.auth import decode_token   # JWT 디코더 재사용 (auth/ 는 수정 안 함)

logger = logging.getLogger(__name__)

try:
    from shared.config import DB_PATH  # type: ignore  (repo 루트가 sys.path 에 있을 때)
except Exception:
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DB_PATH = os.getenv("DB_PATH", os.path.join(_ROOT, "data", "unified_master.db"))

router = APIRouter(tags=["deletion-requests"])

_LEGAL_BASIS = "정보통신망법 §44-2"
_STATUS_LABEL = {"wait": "응답 대기", "review": "검토 대기", "done": "삭제 완료"}
_STATUS_PROGRESS = {"wait": [1, 0, 0], "review": [1, 1, 1], "done": [1, 1, 1]}
_MAX_LIST = 200


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS deletion_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_id TEXT,
                user_id TEXT,
                match_ids TEXT,                       -- JSON 배열 문자열
                consent_delivery INTEGER DEFAULT 0,
                consent_statistics INTEGER DEFAULT 0,
                memo TEXT,
                legal_basis TEXT,
                sent_at TEXT,
                status TEXT DEFAULT 'wait',           -- wait | review | done
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()


# 모듈 import 시 1회 — orchestrator 는 라우터만 등록하면 됨
init_db()


# --- helpers ---
def _bearer(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def _user_id_from(authorization: Optional[str]) -> Optional[str]:
    payload = decode_token(_bearer(authorization) or "")
    if not payload:
        return None
    return payload.get("sub") or None


def _err(status: int, message: str, code: str, field_errors: Optional[dict] = None) -> JSONResponse:
    body = {"message": message, "code": code}
    if field_errors:
        body["fieldErrors"] = field_errors
    return JSONResponse(status_code=status, content=body)


def _domain_of(path_or_url) -> str:
    if not path_or_url:
        return "수집 도메인 미상"
    s = str(path_or_url)
    host = urlsplit(s).netloc
    if host:
        return host
    base = os.path.basename(s.replace("\\", "/")) or s
    return base[:60] if base else "수집 도메인 미상"


def _domain_for_request(match_ids: List[str]) -> str:
    """첫 matchId('mN')를 match_results.rowid=N 으로 역추적해 도메인 표시. 실패/복수면 건수 표시."""
    if not match_ids:
        return "대상 미지정"
    if len(match_ids) > 1:
        return f"{len(match_ids)}개 대상 일괄 요청"
    m = re.match(r"^m(\d+)$", str(match_ids[0]))
    if not m:
        return "수집 도메인 미상"
    try:
        with _connect() as conn:
            row = conn.execute(
                "SELECT crawling_image_path FROM match_results WHERE rowid = ?", (int(m.group(1)),)
            ).fetchone()
        return _domain_of(row["crawling_image_path"]) if row else "수집 도메인 미상"
    except Exception:
        return "수집 도메인 미상"


def _fmt_receipt_id(dt: datetime) -> str:
    return dt.strftime("RCP-%Y-%m-%d-%H%M")


def _fmt_sent_at(dt: datetime) -> str:
    return dt.strftime("%Y.%m.%d %H:%M:%S")


# --- request bodies ---
class ConsentBody(BaseModel):
    delivery: bool = False
    statistics: bool = False


class DeletionRequestBody(BaseModel):
    matchIds: List[str] = Field(default_factory=list)
    consents: ConsentBody = Field(default_factory=ConsentBody)
    memo: str = ""


# --- endpoints ---
@router.post("/api/deletion-requests")
def create_deletion_request(body: DeletionRequestBody, authorization: Optional[str] = Header(default=None)):
    user_id = _user_id_from(authorization)
    if not user_id:
        return _err(401, "로그인이 필요합니다", "UNAUTHENTICATED")

    match_ids = [str(x).strip() for x in (body.matchIds or []) if str(x).strip()]
    field_errors = {}
    if not match_ids:
        field_errors["matchIds"] = "삭제할 항목을 1건 이상 선택해주세요"
    if not body.consents.delivery:
        field_errors["delivery"] = "삭제 요청 발송 동의가 필요합니다"
    if field_errors:
        return _err(400, "입력값을 확인해주세요", "VALIDATION", field_errors)

    now = datetime.now()
    receipt_id = _fmt_receipt_id(now)
    sent_at = _fmt_sent_at(now)
    memo = (body.memo or "")[:500]
    try:
        with _connect() as conn:
            conn.execute(
                "INSERT INTO deletion_requests "
                "(receipt_id, user_id, match_ids, consent_delivery, consent_statistics, memo, legal_basis, sent_at, status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'wait')",
                (receipt_id, user_id, json.dumps(match_ids), int(body.consents.delivery),
                 int(body.consents.statistics), memo, _LEGAL_BASIS, sent_at),
            )
            conn.commit()
    except Exception as e:
        logger.warning(f"[deletion_requests] INSERT 실패: {e}")
        return _err(500, "삭제 요청 저장 중 오류가 발생했습니다", "DB_ERROR")

    return {
        "receiptId": receipt_id,
        "count": len(match_ids),
        "legalBasis": _LEGAL_BASIS,
        "sentAt": sent_at,
        "trackable": True,
    }


@router.get("/api/deletion-requests")
def list_deletion_requests(status: str = "all", authorization: Optional[str] = Header(default=None)):
    user_id = _user_id_from(authorization)
    if not user_id:
        return _err(401, "로그인이 필요합니다", "UNAUTHENTICATED")

    try:
        with _connect() as conn:
            rows = conn.execute(
                "SELECT id, receipt_id, match_ids, sent_at, status FROM deletion_requests "
                "WHERE user_id = ? ORDER BY id DESC LIMIT ?",
                (user_id, _MAX_LIST),
            ).fetchall()
    except sqlite3.OperationalError:
        rows = []          # 테이블 미생성(삭제 요청 이력 없음)
    except Exception as e:
        logger.warning(f"[deletion_requests] 조회 실패: {e}")
        rows = []

    items_all = []
    for r in rows:
        try:
            match_ids = json.loads(r["match_ids"] or "[]")
            match_ids = [str(x) for x in match_ids] if isinstance(match_ids, list) else []
        except Exception:
            match_ids = []
        kind = r["status"] if r["status"] in _STATUS_LABEL else "wait"
        items_all.append({
            "id": f"#{r['id']}",
            "domain": _domain_for_request(match_ids),
            "when": f"발송 · {r['sent_at']}".strip() if r["sent_at"] else "발송",
            "status": _STATUS_LABEL[kind],
            "statusKind": kind,
            "progress": list(_STATUS_PROGRESS[kind]),
        })

    stats = {
        "total": len(items_all),
        "wait": sum(1 for it in items_all if it["statusKind"] == "wait"),
        "review": sum(1 for it in items_all if it["statusKind"] == "review"),
        "done": sum(1 for it in items_all if it["statusKind"] == "done"),
    }
    f = (status or "all").lower()
    items = items_all if f == "all" else [it for it in items_all if it["statusKind"] == f]
    return {"stats": stats, "items": items}
