"""auth_users 테이블 — 회원 계정(이메일 / 비밀번호 해시 / 프로필).

기존 비즈니스 DB(unified_master.db)와 **같은 파일**을 쓰되, 기존 `users` 테이블
(/api/register 가 `INSERT OR REPLACE` 하는 3컬럼짜리)은 전혀 건드리지 않고 별도
테이블 `auth_users` 에 저장한다. 이렇게 해야 얼굴 등록 흐름이 계정 행을 덮어쓰는
사고(password_hash → NULL)를 피할 수 있다.

email == user_id (Phase 1 과 일관).
"""

import os
import sqlite3
from typing import Optional

# 기존 설정에서 DB 파일 경로를 그대로 가져온다(같은 파일 재사용).
try:
    # repo 루트가 sys.path 에 있을 때 (orchestrator.py 가 BASE_DIR 를 추가함)
    from shared.config import DB_PATH  # type: ignore
except Exception:  # 단독 임포트 등 폴백
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DB_PATH = os.getenv("DB_PATH", os.path.join(_ROOT, "data", "unified_master.db"))


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """auth_users 테이블 보장. orchestrator.py 가 auth 라우터 등록 시 1회 호출한다."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_users (
                email         TEXT PRIMARY KEY,        -- user_id 역할
                password_hash TEXT,                    -- NULL 이면 로그인 불가 (routes 에서 처리)
                name          TEXT,
                birth         TEXT,
                gender        TEXT,
                created_at    TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()


def email_exists(email: str) -> bool:
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM auth_users WHERE email = ? LIMIT 1", (email,)
        ).fetchone()
        return row is not None


def get_user(email: str) -> Optional[dict]:
    """email 로 계정 조회. 없으면 None,
    있으면 {email, password_hash, name, birth, gender, created_at}."""
    with _connect() as conn:
        row = conn.execute(
            "SELECT email, password_hash, name, birth, gender, created_at "
            "FROM auth_users WHERE email = ?",
            (email,),
        ).fetchone()
        return dict(row) if row else None


def upsert_user(email: str, password_hash: str, name: str, birth: str, gender: str) -> dict:
    """계정 생성 또는 갱신.

    스펙의 "INSERT 또는 UPDATE (얼굴등록과 회원가입 둘 다 처리)" 의도를 반영해 upsert 로
    두되, signup 라우트가 사전에 email_exists 로 중복을 막으므로 실질적으로는 INSERT.
    """
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO auth_users (email, password_hash, name, birth, gender)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                password_hash = excluded.password_hash,
                name          = excluded.name,
                birth         = excluded.birth,
                gender        = excluded.gender
            """,
            (email, password_hash, name, birth, gender),
        )
        conn.commit()
    return get_user(email)
