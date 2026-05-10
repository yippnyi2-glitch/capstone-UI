import json, time, requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

from .core.dtos import CrawlJobPlan, DownloadTask, DownloadTaskList
from .core.db import get_con
from .core.config import USER_AGENT, DEFAULT_MAX_PAGES, DEFAULT_DELAY_SEC

def crawler_executor(plan: CrawlJobPlan,
                    max_pages: int = DEFAULT_MAX_PAGES,
                    delay_sec: float = DEFAULT_DELAY_SEC) -> DownloadTaskList:
    tasks = []
    with get_con() as con:
        cur = con.cursor()
        for job_id in plan.crawl_job_ids:
            job = cur.execute(
                "SELECT crawl_job_id, site_id, seed_url, cr_status FROM CrawlJob WHERE crawl_job_id=?",
                (job_id,),
            ).fetchone()
            if not job or job["cr_status"] != "READY":
                continue
            cur.execute("UPDATE CrawlJob SET cr_status='RUNNING' WHERE crawl_job_id=?", (job_id,))
            site = cur.execute(
                "SELECT base_url, crawl_policy_json FROM SourceSite WHERE site_id=?",
                (job["site_id"],),
            ).fetchone()
            base_url = site["base_url"]
            policy = json.loads(site["crawl_policy_json"] or "{}")
            mode = (policy.get("mode") or "HTML").upper()
            if mode == "LOCALSTORAGE_GALLERY":
                urls = _extract_image_urls_from_api(base_url)
            else:
                urls = _extract_image_urls(job["seed_url"], base_url, policy, max_pages, delay_sec)
            for u in urls:
                tasks.append(DownloadTask(crawl_job_id=job_id, site_id=job["site_id"], image_url=u))
            cur.execute("UPDATE CrawlJob SET cr_status='DONE' WHERE crawl_job_id=?", (job_id,))
    return DownloadTaskList(tasks=tasks)

def _extract_image_urls(seed_url, base_url, policy, max_pages, delay_sec):
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    img_selectors = policy.get("img_selectors", ["img"])
    img_attrs = policy.get("img_attr_candidates", ["data-src", "src"])
    deny_substrings = policy.get("deny_substrings", [])
    allow_exts = policy.get("allow_exts", [".jpg", ".jpeg", ".png", ".webp", ".gif"])
    out, visited = [], set()
    url = seed_url
    for _ in range(max_pages):
        if not url or url in visited: break
        visited.add(url)
        try:
            r = session.get(url, timeout=10)
            soup = BeautifulSoup(r.text, "html.parser")
            for sel in img_selectors:
                for tag in soup.select(sel):
                    v = None
                    for attr in img_attrs:
                        cand = tag.get(attr)
                        if cand: v = cand; break
                    if not v: continue
                    abs_u = urljoin(base_url, v)
                    if any(ds in abs_u for ds in deny_substrings): continue
                    if allow_exts:
                        path = urlparse(abs_u).path.lower()
                        if not any(path.endswith(ext) for ext in allow_exts): continue
                    out.append(abs_u)
        except: break
        time.sleep(delay_sec)
    return list(set(out))

def _extract_image_urls_from_api(base_url: str) -> list[str]:
    import requests
    from urllib.parse import urljoin, urlsplit
    sp = urlsplit(base_url)
    base_root = f"{sp.scheme}://{sp.netloc}"
    r = requests.get(urljoin(base_root.rstrip("/") + "/", "api/latest_items"), timeout=10)
    items = r.json()
    out = []
    
    # Get existing URLs from DB to avoid duplicates
    existing_urls = set()
    with get_con() as con:
        cur = con.cursor()
        cur.execute("SELECT image_url FROM crawled_images")
        existing_urls = {row["image_url"] for row in cur.fetchall()}

    for it in items:
        u = (it.get("image_url") or "").strip()
        if not u: continue
        
        abs_u = urljoin(base_root.rstrip("/") + "/", u.lstrip("/"))
        
        # 1. Skip if already crawled
        if abs_u in existing_urls:
            continue
            
        # 2. Tag Filter: Only include images with 'person' or '인물' tags
        tags = it.get("tags") or []
        target_tags = ["인물", "사람", "person", "face"] # Only explicit person tags
        if not any(t.lower() in target_tags for t in tags):
            continue
            
        out.append(abs_u)
    return out
