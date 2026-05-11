"""비밀번호 해싱(bcrypt) + JWT 발급/검증 + 간이 토큰 블랙리스트."""

import os
import time
import logging
from typing import Optional

import jwt  # PyJWT
import bcrypt

logger = logging.getLogger(__name__)

# --- 비밀번호 해싱 (bcrypt 직접 사용) ---
# bcrypt 는 입력 비밀번호를 72바이트까지만 사용한다. bcrypt 4.1+ 부터는 초과 시 예외를
# 던지므로 여기서 명시적으로 잘라준다(hash/verify 가 같은 방식으로 자르므로 일관됨).
_BCRYPT_MAX_BYTES = 72


def hash_password(plain: str) -> str:
    pw = (plain or "").encode("utf-8")[:_BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        pw = (plain or "").encode("utf-8")[:_BCRYPT_MAX_BYTES]
        return bcrypt.checkpw(pw, hashed.encode("utf-8"))
    except Exception:
        return False


# --- JWT ---
# 프로덕션에서는 반드시 환경변수(AUTH_SECRET_KEY)로 주입할 것. 아래는 개발용 기본값.
SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "dev-only-insecure-secret-change-me")
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7  # 7일


def create_token(email: str, name: str = "") -> str:
    now = int(time.time())
    payload = {
        "sub": email,        # user_id 역할
        "name": name,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    # PyJWT 2.x 는 str, (구) 1.x 는 bytes 를 반환 — 방어적으로 처리
    return token.decode("utf-8") if isinstance(token, bytes) else token


def decode_token(token: str) -> Optional[dict]:
    """유효하면 payload(dict), 만료/위조/블랙리스트면 None."""
    if not token or is_blacklisted(token):
        return None
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


# --- 간이 토큰 블랙리스트 (로그아웃) ---
# 인메모리 set — 서버 재시작 시 초기화됨("간단 구현"). 실서비스는 Redis 등 영속 저장소로 교체.
_blacklist: set[str] = set()


def blacklist_token(token: Optional[str]) -> None:
    if token:
        _blacklist.add(token)


def is_blacklisted(token: str) -> bool:
    return token in _blacklist
