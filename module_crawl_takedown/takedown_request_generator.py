import sqlite3, json, time
from .core.db import get_con

def create_takedown_requests(user_id: int, targets: list[dict]):
    """
    targets: [{"site_id": 1, "target_url": "...", "reason": "..."}, ...]
    """
    count = 0
    with get_con() as con:
        cur = con.cursor()
        for t in targets:
            cur.execute("""
                INSERT INTO TakedownRequest (user_id, image_id, target_url, reason, status)
                VALUES (?, ?, ?, ?, 'READY')
            """, (user_id, t["image_id"], str(t["target_url"]), t["reason"]))
            count += 1
    con.close()
    return count
