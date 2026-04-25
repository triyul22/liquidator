"""Подтягивает свежие правки из GitHub.

Запуск на сервере по cron каждые 5 минут:
    */5 * * * * cd /app && /usr/bin/python3 tools/git_autopull.py >> data/autopull.log 2>&1

Логика:
- git fetch
- если локальный HEAD == origin/{branch} - выходим без изменений
- иначе git reset --hard origin/{branch} (правки заказчика побеждают локальные)
- логируем что подтянулось

Безопасность: на сервере НЕ редактируем файлы вручную - источник истины GitHub.
Если на сервере что-то поменяли руками, оно перезатрётся следующим pull.
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANCH = os.getenv("GITHUB_BRANCH", "main")


def run(args: list[str]) -> tuple[int, str]:
    res = subprocess.run(args, cwd=str(ROOT), capture_output=True, text=True)
    return res.returncode, (res.stdout + res.stderr).strip()


def main() -> int:
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    if not (ROOT / ".git").exists():
        print(f"[{ts}] not a git repo: {ROOT}", file=sys.stderr)
        return 1

    code, out = run(["git", "fetch", "--quiet", "origin", BRANCH])
    if code != 0:
        print(f"[{ts}] fetch failed: {out}", file=sys.stderr)
        return code

    code, local = run(["git", "rev-parse", "HEAD"])
    if code != 0:
        return code
    code, remote = run(["git", "rev-parse", f"origin/{BRANCH}"])
    if code != 0:
        return code

    if local.strip() == remote.strip():
        return 0

    code, log = run(["git", "log", "--oneline", f"HEAD..origin/{BRANCH}"])
    code2, _ = run(["git", "reset", "--hard", f"origin/{BRANCH}"])
    if code2 != 0:
        print(f"[{ts}] reset failed", file=sys.stderr)
        return code2

    print(f"[{ts}] pulled new commits from origin/{BRANCH}:")
    print(log)
    return 0


if __name__ == "__main__":
    sys.exit(main())
