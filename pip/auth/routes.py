"""POST /api/auth/{signup,login,logout} — JWT 기반 회원가입 / 로그인 / 로그아웃.

에러 응답은 프론트 ApiError 계약에 맞춰 { message, code, fieldErrors? } 형태로 반환한다
(FastAPI 기본 HTTPException 의 { detail } 형태는 쓰지 않음).
"""

import re
import logging
from typing import Optional

from fastapi import APIRouter, Header, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth import users_db
from auth.auth import hash_password, verify_password, create_token, blacklist_token

logger = logging.getLogger(__name__)

# auth_users 테이블 보장 (모듈 import 시 1회). orchestrator 는 라우터만 등록하면 됨.
users_db.init_db()

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MIN_PASSWORD_LEN = 8


# --- 요청 바디 ---
class SignupBody(BaseModel):
    email: str
    password: str
    name: str = ""
    birth: str = ""
    gender: str = ""


class LoginBody(BaseModel):
    email: str
    password: str


class LogoutBody(BaseModel):
    token: Optional[str] = None


# --- 헬퍼 ---
def _err(status: int, message: str, code: str, field_errors: Optional[dict] = None) -> JSONResponse:
    body = {"message": message, "code": code}
    if field_errors:
        body["fieldErrors"] = field_errors
    return JSONResponse(status_code=status, content=body)


def _user_view(row: dict) -> dict:
    """auth_users 행 → 프론트 User 형태 { id, email, name, birth, gender, ref }."""
    email = row.get("email", "")
    created = (row.get("created_at") or "")[:10]  # 'YYYY-MM-DD'
    return {
        "id": email,           # user_id 역할 (email 과 동일)
        "email": email,
        "name": row.get("name") or "",
        "birth": row.get("birth") or "",
        "gender": row.get("gender") or "",
        "ref": ("REF-" + created) if created else "REF-",
    }


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


# --- 엔드포인트 ---
@router.post("/signup")
def signup(body: SignupBody):
    email = (body.email or "").strip()
    password = body.password or ""
    name = (body.name or "").strip()

    field_errors = {}
    if not _EMAIL_RE.match(email):
        field_errors["email"] = "이메일 형식이 올바르지 않습니다"
    if len(password) < _MIN_PASSWORD_LEN:
        field_errors["password"] = f"비밀번호는 최소 {_MIN_PASSWORD_LEN}자 이상이어야 합니다"
    if not name:
        field_errors["name"] = "이름을 입력해주세요"
    if field_errors:
        return _err(400, "입력값을 확인해주세요", "VALIDATION", field_errors)

    if users_db.email_exists(email):
        return _err(409, "이미 사용 중인 이메일입니다", "EMAIL_TAKEN",
                    {"email": "이미 사용 중인 이메일입니다"})

    row = users_db.upsert_user(
        email, hash_password(password), name, body.birth or "", body.gender or ""
    )
    user = _user_view(row)
    token = create_token(email, user["name"])
    return {"token": token, "user": user}


@router.post("/login")
def login(body: LoginBody):
    email = (body.email or "").strip()
    password = body.password or ""

    row = users_db.get_user(email)
    if not row:
        return _err(401, "이메일 또는 비밀번호가 올바르지 않습니다", "INVALID_CREDENTIALS")
    if not row.get("password_hash"):
        # 얼굴등록만 되어 있고 비밀번호가 설정되지 않은 계정
        return _err(401, "비밀번호가 설정되지 않은 계정입니다. 회원가입을 완료해주세요.", "NO_PASSWORD")
    if not verify_password(password, row["password_hash"]):
        return _err(401, "이메일 또는 비밀번호가 올바르지 않습니다", "INVALID_CREDENTIALS")

    user = _user_view(row)
    token = create_token(email, user["name"])
    return {"token": token, "user": user}


@router.post("/logout")
def logout(
    authorization: Optional[str] = Header(default=None),
    body: Optional[LogoutBody] = Body(default=None),
):
    token = (body.token if body else None) or _bearer(authorization)
    blacklist_token(token)   # token 이 None 이면 내부에서 무시됨
    return {"success": True}
