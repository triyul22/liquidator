"""
Единая точка для путей. Кроссплатформенно (Windows локально / Linux на сервере).
Все остальные скрипты импортируют пути отсюда - никаких хардкоженных C:\\... в коде.
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = PROJECT_ROOT / "data"
DRAFTS_DIR = PROJECT_ROOT / "drafts"
ARTICLES_DIR = PROJECT_ROOT / "articles"
ASSETS_DIR = PROJECT_ROOT / "assets"
TOOLS_DIR = PROJECT_ROOT / "tools"

EMBEDDINGS_DB = DATA_DIR / "embeddings.sqlite"
KEYWORDS_JSON = DATA_DIR / "keywords.json"
CLUSTERS_JSON = DATA_DIR / "clusters.json"
RESEARCH_CACHE = DATA_DIR / "research_cache.json"
QUEUE_JSON = DATA_DIR / "queue.json"
PUBLICATION_LOG = DATA_DIR / "publication_log.json"
BATCH_LOG = DATA_DIR / "batch_log.json"
