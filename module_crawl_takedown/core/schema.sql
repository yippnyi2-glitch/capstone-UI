PRAGMA foreign_keys = ON;

-- =========================
-- 1) SourceSite: 수집/삭제 정책 보관
-- =========================
CREATE TABLE IF NOT EXISTS SourceSite (
  site_id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT,
  base_url           TEXT NOT NULL,
  crawl_policy_json  TEXT,              -- {"img_selectors":[...], ...}
  takedown_policy_json TEXT             -- {"channel":"EMAIL"/"WEBFORM", "email_to":..., "form_url":...}
);

-- =========================
-- 2) CrawlJob: 크롤링 작업 단위(상태관리)
-- =========================
CREATE TABLE IF NOT EXISTS CrawlJob (
  crawl_job_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id        INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  seed_url       TEXT NOT NULL,
  seed_query     TEXT,
  cr_status      TEXT NOT NULL DEFAULT 'READY',   -- READY/RUNNING/DONE/FAIL
  started_at     TEXT,
  finished_at    TEXT,
  last_error     TEXT,
  created_at     TEXT DEFAULT (datetime('now')),

  FOREIGN KEY(site_id) REFERENCES SourceSite(site_id)
);

CREATE INDEX IF NOT EXISTS idx_crawljob_status ON CrawlJob(cr_status);
CREATE INDEX IF NOT EXISTS idx_crawljob_site   ON CrawlJob(site_id);

-- =========================
-- 3) ImageItem: 수집된 이미지(파일 + 원본 URL)
-- =========================
CREATE TABLE IF NOT EXISTS ImageItem (
  image_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       INTEGER NOT NULL,
  crawl_job_id  INTEGER NOT NULL,
  image_url     TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  image_hash    TEXT NOT NULL,  -- 파일 내용 SHA1
  created_at    TEXT DEFAULT (datetime('now')),

  FOREIGN KEY(site_id) REFERENCES SourceSite(site_id),
  FOREIGN KEY(crawl_job_id) REFERENCES CrawlJob(crawl_job_id)
);

-- 동일 이미지 중복 저장 방지(권장)
CREATE UNIQUE INDEX IF NOT EXISTS ux_imageitem_hash ON ImageItem(image_hash);
CREATE INDEX IF NOT EXISTS idx_imageitem_site ON ImageItem(site_id);

-- =========================
-- TakedownRequest: 삭제요청 단위
-- =========================
CREATE TABLE IF NOT EXISTS TakedownRequest (
    request_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL DEFAULT 1,
    site_id         INTEGER NOT NULL,
    target_url      TEXT NOT NULL,
    channel         TEXT NOT NULL,                 -- EMAIL / WEBFORM
    status          TEXT NOT NULL DEFAULT 'READY',  -- READY/SENT/PENDING/SUCCESS/FAIL
    reason          TEXT,                          -- 요청 사유(옵션)
    evidence_url    TEXT,                          -- 증빙 링크(옵션)
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,

    UNIQUE(site_id, target_url)
);

-- =========================
-- TakedownAttempt: 발송/조회 시도 로그
-- =========================
CREATE TABLE IF NOT EXISTS TakedownAttempt (
    attempt_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      INTEGER NOT NULL,
    action          TEXT NOT NULL,                 -- SEND / CHECK
    result          TEXT NOT NULL,                 -- OK / FAIL / INFO
    detail          TEXT,
    created_at      TEXT NOT NULL
);

-- =========================
-- Notification: 사용자 알림
-- =========================
CREATE TABLE IF NOT EXISTS Notification (
    noti_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    request_id      INTEGER NOT NULL,
    channel         TEXT NOT NULL,                 -- INAPP / EMAIL
    message         TEXT NOT NULL,
    sent_status     TEXT NOT NULL DEFAULT 'READY', -- READY/SENT/FAIL
    created_at      TEXT NOT NULL,
    sent_at         TEXT
);
-- ===============================================
CREATE TABLE IF NOT EXISTS TakedownCandidate (
    candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    site_id INTEGER NOT NULL,
    target_url TEXT NOT NULL,
    reason TEXT,
    evidence_url TEXT,
    ready INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    -- 후보 중복 방지
    UNIQUE(site_id, target_url)
);

-- =========================
-- 4) ExternalPost: 연습용 사이트 전용 저장소 (외부 사이트 시뮬레이션용)
-- =========================
CREATE TABLE IF NOT EXISTS ExternalPost (
  post_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       INTEGER NOT NULL,
  image_url     TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  image_hash    TEXT NOT NULL,
  tags          TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
