"""GET /api/analysis/results — 최근 분석 매칭 결과를 프론트 Match[] 형태로 반환.

orchestrator.py 의 run_pipeline_from_crawl 가 쓰는 unified_master.db 의 match_results
테이블을 **읽기만** 한다(비즈니스 로직/쓰기 없음). 테이블이 아직 없거나(분석 미실행 또는
수집 0건) 비어 있으면 빈 배열을 돌려준다.

match_results 컬럼: crawling_image_path TEXT, user_id TEXT, cosine_similarity REAL,
created_at TEXT (DEFAULT current_timestamp).
"""

import os
import re
import sqlite3
import logging
from urllib.parse import urlsplit

from fastapi import APIRouter

logger = logging.getLogger(__name__)

try:
    from shared.config import DB_PATH  # type: ignore  (repo 루트가 sys.path 에 있을 때)
except Exception:
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DB_PATH = os.getenv("DB_PATH", os.path.join(_ROOT, "data", "unified_master.db"))

router = APIRouter(tags=["analysis"])

_MAX_ROWS = 50


def _domain_of(path_or_url) -> str:
    if not path_or_url:
        return "수집 도메인 미상"
    s = str(path_or_url)
    host = urlsplit(s).netloc
    if host:
        return host
    base = os.path.basename(s.replace("\\", "/")) or s   # URL 이 아니면 파일명만 노출
    return (base[:60] if base else "수집 도메인 미상")


def _split_dt(created_at):
    """'YYYY-MM-DD HH:MM:SS' → ('YYYY.MM.DD', 'HH:MM'). 파싱 실패 시 best-effort."""
    s = str(created_at or "").strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})", s)
    if m:
        return f"{m.group(1)}.{m.group(2)}.{m.group(3)}", f"{m.group(4)}:{m.group(5)}"
    return s[:10].replace("-", "."), ""


def _similarity_pct(cos) -> int:
    try:
        return max(0, min(100, round(float(cos) * 100)))
    except Exception:
        return 0


@router.get("/api/analysis/results")
def get_analysis_results():
    """가장 최근 분석 실행의 매칭 결과(최대 50건)를 Match[] 형태로 반환.

    여러 번 실행하면 누적된 행이 섞일 수 있으나(데모 범위), 1회 실행 직후엔 그 실행 결과만 나온다.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT rowid, crawling_image_path, user_id, cosine_similarity, created_at "
                "FROM match_results ORDER BY rowid DESC LIMIT ?",
                (_MAX_ROWS,),
            ).fetchall()
        finally:
            conn.close()
    except sqlite3.OperationalError:
        return []          # 테이블 미생성(분석 미실행 또는 수집 0건)
    except Exception as e:
        logger.warning(f"[analysis_results] DB 조회 실패: {e}")
        return []

    out = []
    for r in rows:
        date, time = _split_dt(r["created_at"])
        out.append({
            "id": f"m{r['rowid']}",
            "domain": _domain_of(r["crawling_image_path"]),
            "date": date,
            "time": time,
            "similarity": _similarity_pct(r["cosine_similarity"]),
            "note": "벡터 유사 매칭",
        })
    return out
