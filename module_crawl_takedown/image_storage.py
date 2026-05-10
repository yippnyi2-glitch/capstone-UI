import os, hashlib, requests, base64, re
from .core.dtos import DownloadTaskList
from .core.db import get_con
from .core.config import IMAGE_ROOT, USER_AGENT

def image_storage(task_list: DownloadTaskList) -> int:
    os.makedirs(IMAGE_ROOT, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    stored_count = 0
    with get_con() as con:
        cur = con.cursor()
        for t in task_list.tasks:
            url_hash = hashlib.sha1(t.image_url.encode("utf-8")).hexdigest()
            file_path = os.path.join(IMAGE_ROOT, f"{t.site_id}_{url_hash}.jpg")
            if not os.path.exists(file_path):
                try:
                    resp = session.get(t.image_url, timeout=15)
                    with open(file_path, "wb") as f: f.write(resp.content)
                except: continue
            cur.execute(
                "INSERT OR IGNORE INTO crawled_images (site_id, image_url, local_path) VALUES (?, ?, ?)",
                (t.site_id, t.image_url, file_path),
            )
            if cur.rowcount == 1: stored_count += 1
    return stored_count
