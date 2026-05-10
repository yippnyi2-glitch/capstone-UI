import numpy as np

def find_best_match(crawling_vec, user_vectors, user_ids, threshold=0.8):
    """
    Search best matches for a single crawling vector against all user vectors.
    L2 normalization is assumed for both, so dot product is used for cosine similarity.
    """
    if len(user_vectors) == 0:
        return []

    # Calculate similarities block
    # user_vectors shape: (N, 512), crawling_vec shape: (512,)
    # Output similarities shape: (N,)
    similarities = np.dot(user_vectors, crawling_vec)

    # Threshold filtering
    matched_indices = np.where(similarities >= threshold)[0]
    
    results = []
    for idx in matched_indices:
        results.append({
            "user_id": user_ids[idx],
            "cosine_similarity": float(similarities[idx])
        })
    return results
