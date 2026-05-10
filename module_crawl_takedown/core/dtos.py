from dataclasses import dataclass
from typing import List, Optional

@dataclass
class RunRequest:
    user_id: int
    site_ids: Optional[List[int]] = None
    seed_url_override: Optional[str] = None

@dataclass
class CrawlJobPlan:
    crawl_job_ids: List[int]

@dataclass
class DownloadTask:
    crawl_job_id: int
    site_id: int
    image_url: str

@dataclass
class DownloadTaskList:
    tasks: List[DownloadTask]
