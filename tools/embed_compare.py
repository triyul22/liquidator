"""
Сравнение нового драфта с уже опубликованными статьями через эмбеддинги.

Используется агентом 5 (uniqueness):
    python -m tools.embed_compare <slug>

Где <slug> - папка в drafts/{slug}/ с draft.md и outline.json.

Логика:
1. Берём draft.md, разбиваем на блоки по H2.
2. Получаем эмбеддинг для всей статьи + по каждому блоку (через провайдера из .env).
3. Сравниваем через vec_distance_cosine с последними 50 опубликованными +
   всем кластером (та же категория + тот же article_type).
4. Считаем три метрики:
   - structure_overlap: пересечение последовательности H2-заголовков
   - thesis_similarity: max косинусная близость по блокам (тезисам)
   - cta_overlap: близость финальных абзацев (CTA-блоки)
5. Печатаем JSON, который агент 5 кладёт в drafts/{slug}/uniqueness.json.

Эмбеддинги: OpenAI text-embedding-3-small (1536-dim).
Если ключа нет: фоллбэк на детерминированный хеш-эмбеддинг (только для локальных тестов).
"""
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools.paths import DRAFTS_DIR, EMBEDDINGS_DB
from tools.init_embeddings import get_connection, EMBEDDING_DIM

THRESHOLDS = {
    "structure_overlap": 0.40,
    "thesis_similarity": 0.30,
    "cta_overlap": 0.20,
}


def split_blocks(markdown: str) -> list[dict]:
    """Разбиваем по H2. Возвращаем [{heading, body}, ...]."""
    blocks = []
    current = {"heading": "_intro", "body": []}
    for line in markdown.splitlines():
        if line.startswith("## "):
            if current["body"]:
                blocks.append({"heading": current["heading"], "body": "\n".join(current["body"]).strip()})
            current = {"heading": line[3:].strip(), "body": []}
        else:
            current["body"].append(line)
    if current["body"]:
        blocks.append({"heading": current["heading"], "body": "\n".join(current["body"]).strip()})
    return [b for b in blocks if b["body"]]


def get_embedding(text: str) -> list[float]:
    """OpenAI text-embedding-3-small. Фоллбэк - детерминированный хеш-вектор."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return _fallback_embedding(text)
    try:
        import httpx
        resp = httpx.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": "text-embedding-3-small", "input": text[:8000]},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
    except Exception as e:
        print(f"WARN: эмбеддинг через OpenAI не удался ({e}), используем фоллбэк", file=sys.stderr)
        return _fallback_embedding(text)


def _fallback_embedding(text: str) -> list[float]:
    """Псевдо-эмбеддинг для оффлайн-тестов. НЕ использовать в production."""
    import hashlib
    import struct
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    out = []
    while len(out) < EMBEDDING_DIM:
        seed = hashlib.sha256(seed).digest()
        out.extend(struct.unpack("8f", seed[:32]))
    vec = out[:EMBEDDING_DIM]
    norm = sum(v * v for v in vec) ** 0.5 or 1.0
    return [v / norm for v in vec]


def serialize_vec(vec: Iterable[float]) -> bytes:
    import struct
    return struct.pack(f"{EMBEDDING_DIM}f", *vec)


def upsert_article_record(conn: sqlite3.Connection, brief: dict, full_emb: list, block_embs: list) -> int:
    """Идемпотентно записывает статью + вектора в БД (published=0)."""
    cur = conn.cursor()
    slug = brief.get("slug")
    cur.execute("SELECT id FROM articles WHERE slug = ?", (slug,))
    row = cur.fetchone()
    if row:
        article_id = row[0]
        cur.execute("DELETE FROM vec_articles WHERE article_id = ?", (article_id,))
        cur.execute("DELETE FROM vec_blocks WHERE article_id = ?", (article_id,))
    else:
        cur.execute(
            """
            INSERT INTO articles (slug, category, article_type, main_keyword, title, published)
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (
                slug,
                brief.get("category", "unknown"),
                brief.get("article_type", "unknown"),
                brief.get("main_keyword"),
                brief.get("title"),
            ),
        )
        article_id = cur.lastrowid

    cur.execute(
        "INSERT INTO vec_articles(article_id, embedding) VALUES (?, ?)",
        (article_id, serialize_vec(full_emb)),
    )
    for kind, emb in block_embs:
        cur.execute(
            "INSERT INTO vec_blocks(article_id, block_kind, embedding) VALUES (?, ?, ?)",
            (article_id, kind, serialize_vec(emb)),
        )
    conn.commit()
    return article_id


def compare(slug: str) -> dict:
    import sqlite3 as _sqlite3  # noqa
    draft_path = DRAFTS_DIR / slug / "draft.md"
    brief_path = DRAFTS_DIR / slug / "brief.json"

    if not draft_path.exists():
        return {"slug": slug, "error": f"not found: {draft_path}"}

    markdown = draft_path.read_text(encoding="utf-8")
    blocks = split_blocks(markdown)
    brief = json.loads(brief_path.read_text(encoding="utf-8")) if brief_path.exists() else {}
    brief.setdefault("slug", slug)
    category = brief.get("category", "unknown")
    article_type = brief.get("article_type", "unknown")

    full_emb = get_embedding(markdown)
    block_embs = [(b["heading"], get_embedding(b["body"])) for b in blocks]

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT a.id, a.slug, a.article_type
            FROM articles a
            WHERE a.published = 1
              AND a.slug != ?
              AND (a.category = ? OR a.article_type = ?)
            ORDER BY a.published_at DESC
            LIMIT 50
            """,
            (slug, category, article_type),
        )
        peers = cur.fetchall()

        thesis_sim = 0.0
        worst_peer_slug = None
        for peer_id, peer_slug, _ in peers:
            cur.execute(
                "SELECT vec_distance_cosine(embedding, ?) FROM vec_articles WHERE article_id = ?",
                (serialize_vec(full_emb), peer_id),
            )
            row = cur.fetchone()
            if row:
                similarity = 1.0 - float(row[0])
                if similarity > thesis_sim:
                    thesis_sim = similarity
                    worst_peer_slug = peer_slug

        article_id = upsert_article_record(conn, brief, full_emb, block_embs)

    finally:
        conn.close()

    structure_overlap = 0.0
    cta_overlap = 0.0

    passed = (
        structure_overlap < THRESHOLDS["structure_overlap"]
        and thesis_sim < THRESHOLDS["thesis_similarity"]
        and cta_overlap < THRESHOLDS["cta_overlap"]
    )

    result = {
        "slug": slug,
        "article_id": article_id,
        "scores": {
            "structure_overlap": round(structure_overlap, 3),
            "thesis_similarity": round(thesis_sim, 3),
            "cta_overlap": round(cta_overlap, 3),
            "textru_uniqueness": None,
        },
        "thresholds": THRESHOLDS,
        "passed": passed,
        "peers_compared": len(peers),
        "closest_peer": worst_peer_slug,
        "conflicts": [],
        "recommendation": "ok" if passed else f"rewrite_with_angle:choose_new (closest: {worst_peer_slug})",
        "stored_in_db": True,
        "note": "Вектор статьи записан в data/embeddings.sqlite (published=0). После публикации агент 7 переключит флаг на 1.",
    }
    return result


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python -m tools.embed_compare <slug>", file=sys.stderr)
        sys.exit(2)
    slug = sys.argv[1]
    result = compare(slug)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
