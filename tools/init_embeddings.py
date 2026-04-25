"""
Инициализация SQLite-БД для эмбеддингов статей.
Запуск: python -m tools.init_embeddings (из корня projects/bankrotstvo/)

Создаёт data/embeddings.sqlite со схемой:
- articles: метаданные статьи (slug, category, type, published, timestamps)
- vec_articles: векторное хранилище (sqlite-vec, 1536-dim для OpenAI text-embedding-3-small)
- vec_blocks: векторное хранилище по блокам статьи (для проверки структуры/тезисов)

Идемпотентен: повторный запуск не сломает существующую БД.
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.paths import EMBEDDINGS_DB, DATA_DIR

EMBEDDING_DIM = 1536


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(EMBEDDINGS_DB)
    conn.enable_load_extension(True)
    try:
        import sqlite_vec
        sqlite_vec.load(conn)
    except ImportError:
        print("ERROR: sqlite-vec не установлен. Запусти: pip install -r requirements.txt", file=sys.stderr)
        sys.exit(1)
    conn.enable_load_extension(False)
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            category TEXT NOT NULL,
            article_type TEXT NOT NULL,
            main_keyword TEXT,
            title TEXT,
            published INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            published_at TEXT
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published)
    """)

    cur.execute(f"""
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_articles USING vec0(
            article_id INTEGER PRIMARY KEY,
            embedding FLOAT[{EMBEDDING_DIM}]
        )
    """)

    cur.execute(f"""
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_blocks USING vec0(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER,
            block_kind TEXT,
            embedding FLOAT[{EMBEDDING_DIM}]
        )
    """)

    conn.commit()


def main() -> None:
    print(f"Инициализация {EMBEDDINGS_DB}")
    conn = get_connection()
    try:
        init_schema(conn)
        cur = conn.cursor()
        cur.execute("SELECT vec_version()")
        version = cur.fetchone()[0]
        print(f"  sqlite-vec version: {version}")
        cur.execute("SELECT COUNT(*) FROM articles")
        count = cur.fetchone()[0]
        print(f"  статей в БД: {count}")
        print("OK")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
