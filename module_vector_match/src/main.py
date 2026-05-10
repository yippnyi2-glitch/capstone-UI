from fastapi import FastAPI


from pydantic import BaseModel


from fastapi.staticfiles import StaticFiles


from fastapi.middleware.cors import CORSMiddleware


import os





from src.services.comparator import batch_compare


from src.db.database import get_db_connection





app = FastAPI(title="Vector Match API")





app.add_middleware(


    CORSMiddleware,


    allow_origins=["*"],


    allow_methods=["*"],


    allow_headers=["*"],


)





class BatchRequest(BaseModel):


    threshold: float = 0.8





@app.post("/compare/batch")


def start_batch_compare(req: BatchRequest):


    res = batch_compare(threshold=req.threshold)


    return res





@app.get("/compare/status")


def compare_status():


    """For UI/debugging: shows recent match results in DB"""


    conn = get_db_connection()


    cursor = conn.cursor()


    cursor.execute("SELECT crawling_image_path, user_id, cosine_similarity FROM match_results ORDER BY created_at DESC LIMIT 10")


    rows = cursor.fetchall()


    conn.close()


    


    return {"recent_matches": [{"crawling": r[0], "user_id": r[1], "score": r[2]} for r in rows]}





@app.post("/compare/single")


def compare_single(req: dict):


    """


    For UI Demo ONLY. Re-evaluates a dummy vector against existing users.


    """


    import numpy as np


    from src.services.matcher import find_best_match


    


    threshold = req.get("threshold", 0.7) # Using a bit lower for UI demo to see lines


    


    conn = get_db_connection()


    cursor = conn.cursor()


    cursor.execute("SELECT user_id, vector FROM user_face_vectors")


    rows = cursor.fetchall()


    conn.close()





    if not rows:


        return {"result": [], "error": "No user vectors in DB"}


        


    user_ids = []


    user_vectors = []


    


    for row in rows:


        user_ids.append(row[0])


        vec = np.frombuffer(row[1], dtype=np.float32)


        if vec.shape[0] == 512:


            user_vectors.append(vec)


            


    if not user_vectors:


        # DB           ??        ??                     ?? ?             UI???                           ?5            ???????                ??    ?     ??        


        for i in range(1, 6):


            user_ids.append(f"demo_user_{i}")


            # ?        ???L2 ?    ?    ??                ?


            dv = np.random.rand(512) - 0.5


            dv = dv / np.linalg.norm(dv)


            user_vectors.append(dv.astype(np.float32))


        


    user_vectors = np.array(user_vectors)


    


    # Mock crawling vector (random L2 normalized)


    c_vec = np.random.rand(512) - 0.5


    c_vec = c_vec / np.linalg.norm(c_vec)


    


    # Let's force a slightly closer match to the first user for UI visual


    c_vec = c_vec * 0.5 + user_vectors[0] * 0.5 


    c_vec = c_vec / np.linalg.norm(c_vec)





    # Cast to float32


    c_vec = c_vec.astype(np.float32)





    matches = find_best_match(c_vec, user_vectors, user_ids, threshold)


    


    # Return all calculated similarities for the UI to animate!


    similarities = np.dot(user_vectors, c_vec)


    all_results = []


    for i, user_id in enumerate(user_ids):


        all_results.append({


            "user_id": user_id,


            "cosine_similarity": float(similarities[i]),


            "is_match": float(similarities[i]) >= threshold


        })


        


    return {"dummy_crawling_id": "crawling_img_demo", "comparisons": all_results}





# Mount static files for UI at the very end


static_dir = os.path.join(os.path.dirname(__file__), "..", "static")


if not os.path.exists(static_dir):


    os.makedirs(static_dir)


app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")





