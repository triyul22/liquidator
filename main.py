"""
ЛИКВИДАТОР: единое приложение (статика + API).

Запуск локально:
    uvicorn main:app --reload --port 8000

Эндпоинты:
    GET  /api/health   - проверка жизни + наличия SMTP-кредов
    POST /api/lead     - приём заявки с формы → письмо на MAIL_TO
    /                  - статика из текущей директории (index.html, styles.css, ...)
"""
from __future__ import annotations

import os
import re
import time
import html
import smtplib
import logging
from collections import defaultdict, deque
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, field_validator

# Локально подхватываем .env (на Timeweb переменные идут из ENV приложения)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ============ CONFIG ============
ROOT = Path(__file__).parent

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.yandex.ru")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

MAIL_TO        = os.getenv("MAIL_TO", "lead@pravo.shop")
MAIL_FROM      = os.getenv("MAIL_FROM", SMTP_USER or "lead@pravo.shop")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Сайт ЛИКВИДАТОР")

# CORS: если сайт и API на одном домене (рекомендуется) - оставь "same-origin".
# Если API будет на поддомене api.liquidator.ru - поставь "https://liquidator.ru".
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "same-origin")

RATE_LIMIT_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "3"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("liquidator")


# ============ APP ============
app = FastAPI(
    title="Liquidator",
    docs_url=None, redoc_url=None, openapi_url=None,  # прячем swagger в проде
)

if ALLOWED_ORIGIN != "same-origin":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[ALLOWED_ORIGIN] if ALLOWED_ORIGIN != "*" else ["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

# Gzip-сжатие всех ответов > 500 байт (HTML, CSS, JS, JSON, SVG сжимаются в 4-5 раз)
app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=6)


# Cache-Control заголовки для статики (кэш в браузере, чтобы повторные заходы были мгновенными)
_CACHE_IMMUTABLE_EXT = (".webp", ".jpg", ".jpeg", ".png", ".svg", ".ico",
                         ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf")
_CACHE_MEDIUM_EXT = (".css", ".js")


@app.middleware("http")
async def _cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path.lower()
    if path.endswith(_CACHE_IMMUTABLE_EXT):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path.endswith(_CACHE_MEDIUM_EXT):
        response.headers["Cache-Control"] = "public, max-age=2592000"
    elif path.endswith(".html") or path == "/" or path.endswith("/"):
        response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
    elif path.endswith(".json"):
        response.headers["Cache-Control"] = "public, max-age=3600"
    return response


# ============ MODELS ============
PHONE_RE = re.compile(r"^[\d\s\+\-\(\)]{10,25}$")


class LeadIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=10, max_length=25)
    source: Optional[str] = Field(default="", max_length=200)
    page_url: Optional[str] = Field(default="", max_length=500)
    page_title: Optional[str] = Field(default="", max_length=300)
    consent: bool = True
    # honeypot: скрытое поле, которое боты обычно заполняют, а люди - нет
    hp: Optional[str] = Field(default="", alias="_hp")

    model_config = {"populate_by_name": True}

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("name too short")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        if not PHONE_RE.match(v):
            raise ValueError("invalid phone")
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("phone too short")
        return v


# ============ RATE LIMIT (in-memory) ============
# Для одного инстанса ок. Если пойдём в несколько реплик - надо Redis.
_rate: dict[str, deque] = defaultdict(deque)


def _rate_limit_ok(ip: str) -> bool:
    now = time.time()
    q = _rate[ip]
    # чистим старые записи
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_HOUR:
        return False
    q.append(now)
    return True


def _client_ip(request: Request) -> str:
    # за прокси Timeweb/Cloudflare берём первый из X-Forwarded-For
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


# ============ MAIL ============
def _send_mail(subject: str, html_body: str, text_body: str) -> None:
    if not (SMTP_USER and SMTP_PASS):
        raise RuntimeError("SMTP_USER/SMTP_PASS не заданы в ENV")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((MAIL_FROM_NAME, MAIL_FROM))
    msg["To"] = MAIL_TO
    msg["Reply-To"] = MAIL_TO
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    # 465 = SSL, 587 = STARTTLS
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(MAIL_FROM, [MAIL_TO], msg.as_string())
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(MAIL_FROM, [MAIL_TO], msg.as_string())


def _render_mail(payload: LeadIn, ip: str, ua: str, ts: str) -> tuple[str, str]:
    e = html.escape

    # Источник: метка кнопки ("1 блок (главный экран)", "Статья") + ссылка на страницу.
    # Если title страницы выглядит как "Статья: ...", показываем полное название статьи.
    label = payload.source or "Не указан"
    page_title = (payload.page_title or "").strip()
    page_url = (payload.page_url or "").strip()

    # собираем HTML-источник
    if page_url:
        anchor_text = page_title or page_url
        source_html = f'{e(label)} - <a href="{e(page_url)}">{e(anchor_text)}</a>'
    else:
        source_html = e(label)

    # собираем plain-text источник
    if page_url:
        source_text = f"{label} - {page_title or page_url} ({page_url})"
    else:
        source_text = label

    text = (
        "Новая заявка с сайта ЛИКВИДАТОР\n\n"
        f"Имя: {payload.name}\n"
        f"Телефон: {payload.phone}\n\n"
        f"Источник: {source_text}\n"
        f"Дата: {ts}\n"
        f"IP: {ip}\n"
        f"User-Agent: {ua}\n"
    )
    html_body = f"""<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0;padding:16px;color:#222;">
  <h2 style="color:#5b6236;margin:0 0 12px;">Новая заявка с сайта</h2>
  <table cellpadding="6" style="border-collapse:collapse;font-size:15px;">
    <tr><td style="color:#888;width:120px;">Имя:</td><td><b>{e(payload.name)}</b></td></tr>
    <tr><td style="color:#888;">Телефон:</td><td><b><a href="tel:{e(payload.phone)}">{e(payload.phone)}</a></b></td></tr>
    <tr><td style="color:#888;vertical-align:top;">Источник:</td><td>{source_html}</td></tr>
    <tr><td style="color:#888;">Дата:</td><td>{ts}</td></tr>
    <tr><td style="color:#888;">IP:</td><td>{e(ip)}</td></tr>
    <tr><td style="color:#888;vertical-align:top;">User-Agent:</td><td style="font-size:12px;color:#666;">{e(ua)}</td></tr>
  </table>
</body></html>"""
    return html_body, text


# ============ SECURITY: блокируем отдачу исходников и служебных файлов ============
_BLOCKED_PATHS = {
    "/main.py", "/requirements.txt", "/BACKEND.md", "/README.md",
    "/.env", "/.env.example", "/.gitignore",
}
_BLOCKED_PREFIXES = ("/.git", "/.venv", "/venv", "/__pycache__", "/agent-plan")


@app.middleware("http")
async def _block_sources(request: Request, call_next):
    p = request.url.path
    if p in _BLOCKED_PATHS or any(p.startswith(pref) for pref in _BLOCKED_PREFIXES):
        return Response(status_code=404)
    return await call_next(request)


# ============ ROUTES ============
@app.get("/api/health")
def health():
    return {
        "ok": True,
        "smtp_configured": bool(SMTP_USER and SMTP_PASS),
        "mail_to": MAIL_TO,
    }


@app.post("/api/lead")
async def create_lead(payload: LeadIn, request: Request):
    # 1. honeypot: бот заполнил _hp - тихо отвечаем ok, письмо не шлём
    if payload.hp:
        log.info("honeypot triggered ip=%s name=%r", _client_ip(request), payload.name)
        return {"ok": True}

    # 2. согласие на обработку ПД
    if not payload.consent:
        raise HTTPException(status_code=400, detail="Требуется согласие на обработку персональных данных")

    ip = _client_ip(request)

    # 3. rate limit
    if not _rate_limit_ok(ip):
        log.warning("rate limit ip=%s", ip)
        raise HTTPException(status_code=429, detail="Слишком много заявок. Попробуйте через час.")

    ua = request.headers.get("user-agent", "")
    ts = time.strftime("%d.%m.%Y %H:%M", time.localtime())

    html_body, text_body = _render_mail(payload, ip, ua, ts)

    try:
        _send_mail("PRAVO.SHOP - Заявка", html_body, text_body)
    except Exception:
        log.exception("send_mail failed")
        raise HTTPException(
            status_code=500,
            detail="Не удалось отправить заявку. Позвоните нам или попробуйте позже.",
        )

    log.info("lead sent name=%r phone=%r ip=%s", payload.name, payload.phone, ip)
    return {"ok": True}


# ============ STATIC ============
# Монтируем ПОСЛЕ api-роутов, чтобы /api/* не перехватывался статикой.
# html=True: /path/ → /path/index.html, / → /index.html
app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="static")
