crawler_app 실행 안내 (로컬 환경 배포용)
================================================

1. 준비물(사전 요구사항)
- Windows 10/11 권장
- Python 3.10 ~ 3.12 권장 (3.13/3.14도 가능하나 일부 패키지 호환 이슈가 날 수 있음)
- Git(선택): 저장소로 받는 경우
- (필수) Playwright 브라우저 설치 필요: Chromium

※ 주의
- 로컬스토리지(LocalStorage)는 '각 PC의 각 브라우저'에 저장되므로 공유되지 않습니다.
- 시스템의 공용 데이터는 DB(SQLite) + uploads(이미지 파일)로 관리합니다.

3. 설치(가상환경 권장)
(1) PowerShell에서 crawler_app 폴더로 이동
  cd 경로\crawler_app

(2) 가상환경 생성/활성화
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1

(3) 패키지 설치
  pip install -U pip
  pip install fastapi uvicorn requests beautifulsoup4 playwright python-multipart

(4) Playwright 브라우저 설치(필수)
  python -m playwright install chromium

※ requirements.txt가 있다면 아래로 대체 가능
  pip install -r requirements.txt

------------------------------------------------
4. DB 준비
- 프로젝트에서 사용하는 SQLite DB 파일은 db.py / config.py에서 경로가 정해집니다.
- 최초 실행 시 테이블이 자동 생성되지 않는 구조라면, 팀에서 제공한 .db 파일을 동일 경로에 넣어야 합니다.

(확인 방법)
- backend 실행 후 /api/items_count 호출 시 JSON이 정상 응답이면 DB 연결이 정상입니다.

------------------------------------------------
5. 실행 방법(중요)
A) FastAPI 서버 실행 (웹사이트/업로드/API)
- crawler_app 폴더에서 아래 실행:
  uvicorn server:app --reload --port 8888

- 대시보드 통합 서버 실행 (추천):
  python server.py

- 브라우저 접속:
  - 메인(연습용) 사이트: http://localhost:8888/example/index.html
  - 크롤러 대시보드: http://localhost:8888/dashboard/dashboard.html

B) 크롤러(main.py) 실행 (DB에서 최신 업로드 목록을 읽어 작업 생성)
- 서버가 켜진 상태에서 개별 실행 시:
  python main.py

- db 초기화 명령어:
  python -c "from db import get_con; con=get_con(); cur=con.cursor(); [cur.execute(f'DELETE FROM {t}') for t in ['ImageItem', 'ExternalPost', 'CrawlJob', 'TakedownCandidate', 'TakedownRequest', 'Notification', 'TakedownAttempt']]; con.commit(); con.close(); print('All testing data has been cleared.')"

------------------------------------------------
6. 자주 발생하는 문제/해결
(1) ModuleNotFoundError: No module named 'crawler_app'
- crawler_app 폴더 안에서 실행할 때는:
  uvicorn server:app --reload --port 8000
- 상위 폴더에서 패키지 경로로 실행하려면:
  cd ..
  uvicorn capstone.server:app --reload --port 8888

(2) favicon.ico 404
- 기능에 영향 없음(브라우저 탭 아이콘 요청).
- 원하면 backend.py에 /favicon.ico 라우트를 추가하거나 favicon 파일을 website에 넣으면 됩니다.

(3) sqlite3.IntegrityError: UNIQUE constraint failed: ImageItem.image_hash
- 중복 저장 시 발생.
- image_storage.py에서 INSERT OR IGNORE를 사용하거나 IntegrityError를 잡아 스킵하도록 수정해야 합니다.

(4) Playwright ERR_CONNECTION_REFUSED
- 크롤러가 접근하려는 서버 포트가 켜져있는지 확인.
- 현재 권장 포트: 8888 (uvicorn 실행 옵션과 동일해야 함)

끝.
