import os
import requests
import json
import redis
import numpy as np
from src.db.database import get_db_connection
from src.services.matcher import find_best_match
import logging

logger = logging.getLogger("comparator")
logger.setLevel(logging.INFO)
# Basic console handler
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
logger.addHandler(ch)

redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "localhost"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=False # Keep bytes for numpy
)

def batch_compare(threshold=0.8):
    """
    Execute batch matching for all crawling vectors in Redis.
    """
    logger.info(f"Starting batch_compare with threshold {threshold}")
    
    # 1. Load User Vectors
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id, vector FROM user_face_vectors")
    rows = cursor.fetchall()
    
    if not rows:
        logger.warning("No user vectors found in database. Aborting batch compare.")
        conn.close()
        return {"total_crawled": 0, "total_matched": 0, "results": []}

    user_ids = []
    user_vectors = []
    for row in rows:
        user_ids.append(row[0])
        # DB blob back to numpy (assuming float32)
        vec = np.frombuffer(row[1], dtype=np.float32)
        if vec.shape[0] != 512:
            try:
                vec = vec.reshape(512)
            except Exception as e:
                logger.error(f"Failed to reshape vector for user {row[0]}")
                continue
        user_vectors.append(vec)

    user_vectors = np.array(user_vectors)
    
    # 2. Find all crawling vectors in Redis
    crawling_keys = redis_client.keys("crawling:*:face:0")
    if not crawling_keys:
        logger.info("No crawling vectors in Redis.")
        conn.close()
        return {"total_crawled": 0, "total_matched": 0, "results": []}

    results = []
    total_matched = 0

    # 3. Process each crawling vector
    for key in crawling_keys:
        crawling_id = key.decode("utf-8").split(":")[1]
        crawling_path = f"/crawling/{crawling_id}.jpg" # Mocked path info
        
        vec_bytes = redis_client.get(key)
        if not vec_bytes:
            continue
        
        crawling_vec = np.frombuffer(vec_bytes, dtype=np.float32)
        
        try:
            matches = find_best_match(crawling_vec, user_vectors, user_ids, threshold)
        except Exception as e:
            logger.error(f"Error finding match for {crawling_id}: {e}")
            matches = []

        if matches:
            # Reconstruct with mocked user paths for the result
            for match in matches:
                match["user_image_path"] = f"/images/{match['user_id']}_front.jpg"
                cursor.execute(
                    "INSERT INTO match_results (crawling_image_path, user_id, user_image_path, cosine_similarity) VALUES (?, ?, ?, ?)",
                    (crawling_path, match["user_id"], match["user_image_path"], match["cosine_similarity"])
                )
            conn.commit()
            
            total_matched += 1
            results.append({
                "crawling_image_path": crawling_path,
                "matches": matches
            })
            
        # Delete from Redis after processing
        redis_client.delete(key)

    conn.close()

    # 4. Notify Deepfake module
    if results:
        notify_deepfake_module(results)
        
    logger.info(f"Batch compare complete: {len(crawling_keys)} crawled, {total_matched} matched.")
    return {"total_crawled": len(crawling_keys), "total_matched": total_matched, "results": results}


def notify_deepfake_module(results):
    mock = os.getenv("MOCK_DEEPFAKE", "true").lower() == "true"
    if mock:
        logger.info(f"[MOCK] POST /deepfake/batch HTTP call simulated with {len(results)} matches.")
    else:
        url = os.getenv("DEEPFAKE_URL", "http://localhost:8002/deepfake/batch")
        try:
            res = requests.post(url, json=results)
            logger.info(f"Notified deepfake module. Status: {res.status_code}")
        except Exception as e:
            logger.error(f"Failed to notify deepfake module: {e}")
