import time
import random

def automate_form_submission(image_url: str, log_func):
    """
    Simulates automated browser interaction with the target site.
    """
    prefix = "[TAKEDOWN-BOT]"
    log_func(f"{prefix} Initializing automated reporting agent...")
    time.sleep(1.0)
    
    log_func(f"{prefix} Opening target site: http://localhost:8888/ui/crawler_target/index.html")
    time.sleep(1.5)
    
    log_func(f"{prefix} Scanning page for image: {image_url}")
    time.sleep(1.2)
    
    log_func(f"{prefix} Image found. Navigating to detail page...")
    time.sleep(1.0)
    
    log_func(f"{prefix} Entering 'Report/Takedown' form section.")
    time.sleep(1.5)
    
    log_func(f"{prefix} Filling out requester info (demo_user_01)...")
    time.sleep(0.8)
    
    reasons = ["Non-consensual deepfake detected", "Identity theft through AI manipulation", "Violation of image consent policy"]
    reason = random.choice(reasons)
    log_func(f"{prefix} Inputting reason: '{reason}'")
    time.sleep(1.0)
    
    log_func(f"{prefix} Submitting formal takedown request to site administrator...")
    time.sleep(2.0)
    
    log_func(f"{prefix} SUCCESS: Request submitted. Receipt ID: TKD-{int(time.time())}")
    return True
