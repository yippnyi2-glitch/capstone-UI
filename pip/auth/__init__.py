# Phase 2 인증 패키지 (pip/auth/)
# - users_db.py : auth_users 테이블 (unified_master.db 같은 파일 재사용)
# - auth.py     : bcrypt 해싱 + JWT 발급/검증 + 간이 토큰 블랙리스트
# - routes.py   : POST /api/auth/{signup,login,logout}
#
# orchestrator.py 에서 `from auth.routes import router as auth_router` 로 등록.
# (python pip/orchestrator.py 실행 시 pip/ 가 sys.path[0] 에 들어가므로 `auth` 로 임포트됨)
