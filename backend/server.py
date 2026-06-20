from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, File, UploadFile, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient  # legacy import kept for type compat (unused)
# `ReturnDocument` was originally `pymongo.ReturnDocument` — we now route it
# through the Firestore compat shim so the existing call sites keep working.
import hashlib
import os
import logging
import uuid
import hmac
import httpx
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date
from passlib.context import CryptContext

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech
# STT (speech-to-text) import removed — mic/dictation feature was deprecated.
import base64
import json
import re

from prompts import (
    TOOL_PROMPTS,
    MULTI_TOOLS,
    CHAT_SYSTEM_MESSAGE,
    OCR_SYSTEM_MESSAGE,
    format_prompt as _format_prompt,
    vocab_payload_valid as _vocab_payload_valid,
    build_chat_response_language_directive as _build_chat_lang_directive,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Env
MONGO_URL = os.environ.get("MONGO_URL", "")  # legacy: unused after Firestore swap
DB_NAME = os.environ.get("DB_NAME", "")      # legacy: unused after Firestore swap
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

# Admin credentials (single-admin app) — provided via backend/.env only,
# never shipped in the client bundle/APK.
ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL") or "").lower().strip()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

# Password hashing for email/password accounts
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Free-tier daily AI usage limit (any tool, any combination)
FREE_TOOL_DAILY_LIMIT = int(os.environ.get("FREE_TOOL_DAILY_LIMIT", "5"))

# ---------------------------------------------------------------------------
# Database — Firestore via Mongo-compatible shim.
# ---------------------------------------------------------------------------
# We migrated off MongoDB to Firebase Firestore. The shim in
# `firestore_compat.py` exposes the same `db.<collection>.find_one(...)`,
# `update_one(...)`, `find_one_and_update(...)`, etc. surface used by Motor,
# so the entire request layer below stayed untouched.
from firestore_compat import db, ReturnDocument  # noqa: E402
client = None  # legacy: kept so `client.close()` in shutdown handler doesn't break.

app = FastAPI(title="KeyMind AI Backend")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# =====================================================
# Models
# =====================================================
class SessionCreate(BaseModel):
    session_id: str  # one-time session_id from Emergent redirect


class AdminLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None


class GuestAuth(BaseModel):
    name: Optional[str] = None
    device_id: Optional[str] = None


class EmailLoginRequest(BaseModel):
    email: str
    password: str


class EmailRegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class GoogleAuthRequest(BaseModel):
    id_token: str


class AIToolRequest(BaseModel):
    tool: str
    text: str
    options: Dict[str, Any] = Field(default_factory=dict)


class AIToolResponse(BaseModel):
    tool: str
    original: str
    suggestions: List[str]
    explanation: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class ChatRequest(BaseModel):
    session_id: str
    message: str
    response_language: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    reply: str


class HistoryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    tool: str
    original: str
    applied: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class HistoryCreate(BaseModel):
    tool: str
    original: str
    applied: str


class OCRRequest(BaseModel):
    image_base64: str


class OCRResponse(BaseModel):
    text: str


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    # Optional: caller's preferred language (e.g. "Hindi", "Arabic", "Konkani").
    # When provided, the server picks a consistent native-sounding voice for
    # that language instead of inferring from the text — this keeps every
    # Listen button inside a Describe & Translate card sounding identical
    # even if the rendered text contains a mix of scripts.
    language: Optional[str] = None


class WhitelistAdd(BaseModel):
    email: str
    is_premium: bool = True


class WhitelistToggle(BaseModel):
    email: str
    is_premium: bool


class SubscribeRequest(BaseModel):
    plan: str  # "weekly" or "monthly"


# Mock subscription pricing — INR. Real payment integration TBD.
SUBSCRIPTION_PLANS: Dict[str, Dict[str, Any]] = {
    "weekly":  {"label": "Weekly",  "price_inr": 250, "days": 7},
    "monthly": {"label": "Monthly", "price_inr": 800, "days": 30},
}


# =====================================================
# Helpers
# =====================================================
def _today_str() -> str:
    return date.today().isoformat()


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _subscription_active(user: Dict[str, Any]) -> bool:
    exp = _parse_dt(user.get("subscription_expires_at"))
    return bool(exp and exp > datetime.now(timezone.utc))


async def _ensure_whitelist_sync(user: Dict[str, Any]) -> Dict[str, Any]:
    """Compute effective is_premium and is_admin from:
       (a) hardcoded admin email,
       (b) admin whitelist entry,
       (c) active paid subscription.
    Persist if it diverges from the stored doc.
    """
    email = (user.get("email") or "").lower().strip()
    is_admin = email == ADMIN_EMAIL
    wl = await db.whitelist.find_one({"email": email}, {"_id": 0})
    admin_granted = bool(wl and wl.get("is_premium"))
    sub_active = _subscription_active(user)
    is_premium = is_admin or admin_granted or sub_active

    updates: Dict[str, Any] = {}
    if user.get("is_admin") != is_admin:
        updates["is_admin"] = is_admin
    if user.get("is_premium") != is_premium:
        updates["is_premium"] = is_premium
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        user.update(updates)

    # Stash computed sources for the public projection (not persisted).
    user["_admin_granted"] = admin_granted
    user["_subscription_active"] = sub_active
    return user


def _user_public(user: Dict[str, Any]) -> Dict[str, Any]:
    """Public projection of a user document — includes usage + subscription info."""
    today = _today_str()
    usage_date = user.get("tool_usage_date")
    usage_count = int(user.get("tool_usage_count") or 0) if usage_date == today else 0
    is_guest = bool(user.get("is_guest"))
    # Hard rule: guests are NEVER premium or admin, regardless of any stored
    # field on the document. Premium upgrades are tied to a real account.
    is_admin = False if is_guest else bool(user.get("is_admin"))
    is_premium = False if is_guest else bool(user.get("is_premium") or user.get("is_admin"))
    limit = FREE_TOOL_DAILY_LIMIT
    # Premium source for UI labelling: "admin" | "subscription" | None
    source: Optional[str] = None
    if not is_guest:
        if user.get("is_admin") or user.get("_admin_granted"):
            source = "admin"
        elif user.get("_subscription_active"):
            source = "subscription"
    exp = _parse_dt(user.get("subscription_expires_at"))
    return {
        "user_id": user.get("user_id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "is_guest": is_guest,
        "is_admin": is_admin,
        "is_premium": is_premium,
        "premium_source": source,
        "subscription_plan": None if is_guest else user.get("subscription_plan"),
        "subscription_expires_at": exp.isoformat() if (exp and not is_guest) else None,
        "tool_uses_today": usage_count,
        "tool_uses_limit": limit,
        "tool_uses_remaining": max(0, limit - usage_count) if not is_premium else None,
        "setup_completed": bool(user.get("setup_completed")),
    }


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user = await _ensure_whitelist_sync(user)
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    """Returns user dict if authorized, else None (no error)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


async def require_admin(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user = await get_current_user(authorization)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def _enforce_and_count_usage(user: Optional[Dict[str, Any]]) -> None:
    """Raise 429 if free user has hit daily limit; else increment counter."""
    if not user:
        return  # Anonymous calls (e.g. guest flow without token) are not metered server-side.
    if user.get("is_admin") or user.get("is_premium"):
        return
    today = _today_str()
    current_count = int(user.get("tool_usage_count") or 0) if user.get("tool_usage_date") == today else 0
    if current_count >= FREE_TOOL_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached ({FREE_TOOL_DAILY_LIMIT}/day). Resets at midnight UTC.",
        )
    new_count = current_count + 1
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"tool_usage_date": today, "tool_usage_count": new_count}},
    )
    user["tool_usage_date"] = today
    user["tool_usage_count"] = new_count


# =====================================================
# Auth Routes
# =====================================================
@api.post("/auth/session")
async def create_session(body: SessionCreate):
    url = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get(url, headers={"X-Session-ID": body.session_id})
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Auth service unreachable: {e}")

    email = (data.get("email") or "").lower().strip()
    name = data.get("name", email)
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=502, detail="Malformed auth response")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "is_guest": False,
                "is_admin": email == ADMIN_EMAIL,
                "is_premium": email == ADMIN_EMAIL,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        }
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user_doc = await _ensure_whitelist_sync(user_doc)
    return {"session_token": session_token, "user": _user_public(user_doc)}


@api.post("/auth/google")
async def google_login(body: GoogleAuthRequest):
    """Direct Google Sign-In: verify a Google ID token and issue a session."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID") or ""
    if not client_id:
        raise HTTPException(status_code=500, detail="Google sign-in is not configured")
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        claims = google_id_token.verify_oauth2_token(
            body.id_token, google_requests.Request(), client_id
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = (claims.get("email") or "").lower().strip()
    if not email or not claims.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google account email not verified")
    name = claims.get("name") or email
    picture = claims.get("picture")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "is_guest": False,
                "is_admin": email == ADMIN_EMAIL,
                "is_premium": email == ADMIN_EMAIL,
                "auth_provider": "google",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    token = uuid.uuid4().hex
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        }
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user_doc = await _ensure_whitelist_sync(user_doc)
    return {"session_token": token, "user": _user_public(user_doc)}


@api.post("/auth/guest")
async def create_guest(
    request: Request,
    body: Optional[GuestAuth] = None,
):
    """Atomically get-or-create a guest account anchored to the caller's stable
    device id. Uses find_one_and_update(upsert=True) so two concurrent calls
    with the same device_id resolve to the SAME document — preventing duplicate
    guest accounts that would silently reset the user's daily tool-usage count.

    When the client cannot provide a stable device id (older builds, web
    sandboxes, edge cases where Application.getAndroidId/getIosIdForVendor
    returns null) we derive a deterministic SERVER-SIDE fingerprint from
    `client_ip + user_agent`. This is good enough to bind the same guest to
    the same browser/device for the next ~24h — preventing the "counter
    always reads 0" bug seen in the field.
    """
    device_id = (body.device_id or "").strip() if body else ""
    derived = False
    if not device_id:
        ua = (request.headers.get("user-agent") or "").strip()
        ip = (request.client.host if request.client else "") or "no-ip"
        if ua or ip != "no-ip":
            digest = hashlib.sha256(f"{ip}|{ua}".encode("utf-8")).hexdigest()
            device_id = f"srv_{digest[:24]}"
            derived = True
    logger.info(
        "guest auth — device_id=%s (derived=%s, sent=%s)",
        (device_id[:24] + "…") if device_id else "<empty>",
        derived,
        bool(body and body.device_id),
    )

    user: Optional[Dict[str, Any]] = None
    now_iso = datetime.now(timezone.utc).isoformat()

    if device_id:
        new_user_id = f"guest_{uuid.uuid4().hex[:12]}"
        # Atomic upsert: returns the existing guest if one already exists for
        # this device, otherwise creates a fresh one in a single round-trip.
        user = await db.users.find_one_and_update(
            {"guest_device_id": device_id, "is_guest": True},
            {
                "$setOnInsert": {
                    "user_id": new_user_id,
                    "email": f"{new_user_id}@guest.local",
                    "name": "Guest",
                    "picture": None,
                    "is_guest": True,
                    "is_admin": False,
                    "is_premium": False,
                    "guest_device_id": device_id,
                    "device_id_source": "client" if not derived else "server-fingerprint",
                    "created_at": now_iso,
                },
                "$set": {"last_seen_at": now_iso},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
            projection={"_id": 0},
        )
    else:
        # Truly anonymous (no IP, no UA — should never happen) — single-use guest.
        user_id = f"guest_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": f"{user_id}@guest.local",
            "name": "Guest",
            "picture": None,
            "is_guest": True,
            "is_admin": False,
            "is_premium": False,
            "created_at": now_iso,
            "last_seen_at": now_iso,
        }
        await db.users.insert_one(dict(user))
        user.pop("_id", None)

    token = uuid.uuid4().hex
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user["user_id"],
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        }
    )
    return {"session_token": token, "user": _user_public(user)}


@api.post("/auth/login")
async def email_login(body: EmailLoginRequest):
    email = (body.email or "").lower().strip()
    password = body.password or ""

    # Admin shortcut — admin signs in via the same form.
    if email == ADMIN_EMAIL and hmac.compare_digest(password, ADMIN_PASSWORD):
        return await admin_login(AdminLogin(email=email, password=password))

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        # Same message for unknown email / Google-only accounts to avoid enumeration,
        # except guide Google users explicitly.
        if user and not user.get("password_hash"):
            raise HTTPException(status_code=401, detail="This account uses Google Sign-In. Tap the Google button below.")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not pwd_context.verify(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user_id = user["user_id"]
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}},
    )
    token = uuid.uuid4().hex
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        }
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user_doc = await _ensure_whitelist_sync(user_doc)
    return {"session_token": token, "user": _user_public(user_doc)}


# Manual sign-up — restricted to Gmail addresses only.
GMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@gmail\.com$", re.IGNORECASE)


@api.post("/auth/register")
async def email_register(body: EmailRegisterRequest):
    email = (body.email or "").lower().strip()
    password = body.password or ""
    name = (body.name or "").strip() or email.split("@", 1)[0]

    # Gmail-only validation (case-insensitive).
    if not GMAIL_RE.match(email):
        raise HTTPException(
            status_code=400,
            detail="Only Gmail addresses are allowed (must end with @gmail.com).",
        )
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if email == ADMIN_EMAIL:
        # Don't let anyone register the configured admin email through this path.
        raise HTTPException(status_code=400, detail="This email is reserved.")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="An account already exists for this email. Try signing in instead.")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    password_hash = pwd_context.hash(password)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.insert_one(
        {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": None,
            "is_guest": False,
            "is_admin": False,
            "is_premium": False,
            "password_hash": password_hash,
            "auth_provider": "email",
            "created_at": now_iso,
            "last_login": now_iso,
        }
    )
    token = uuid.uuid4().hex
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        }
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user_doc = await _ensure_whitelist_sync(user_doc)
    return {"session_token": token, "user": _user_public(user_doc)}


@api.post("/auth/admin")
async def admin_login(body: AdminLogin):
    """Hidden admin login — only the configured admin email can use this."""
    email = (body.email or "").lower().strip()
    if email != ADMIN_EMAIL or not hmac.compare_digest(body.password or "", ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "is_admin": True,
                "is_premium": True,
                "last_login": datetime.now(timezone.utc).isoformat(),
            }},
        )
    else:
        user_id = f"admin_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": "Admin",
                "picture": None,
                "is_guest": False,
                "is_admin": True,
                "is_premium": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    token = uuid.uuid4().hex
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        }
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": token, "user": _user_public(user_doc)}


@api.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    return {"user": _user_public(user)}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.post("/auth/setup-complete")
async def mark_setup_complete(authorization: Optional[str] = Header(None)):
    """Mark the current user as having finished the 'Make it yours' setup.
    This is what makes returning users skip the setup screen on a fresh
    install / cache wipe — the flag travels with the account, not the device.
    """
    user = await get_current_user(authorization)
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"setup_completed": True}}
    )
    user["setup_completed"] = True
    return {"ok": True, "user": _user_public(user)}


# =====================================================
# Admin Routes
# =====================================================
@api.get("/admin/whitelist")
async def admin_list_whitelist(authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    entries = await db.whitelist.find({}, {"_id": 0}).sort("added_at", -1).to_list(500)
    # Enrich with user info if user exists
    enriched = []
    for w in entries:
        u = await db.users.find_one({"email": w["email"]}, {"_id": 0})
        enriched.append({
            "email": w["email"],
            "is_premium": bool(w.get("is_premium")),
            "added_at": w.get("added_at"),
            "name": u.get("name") if u else None,
            "has_account": bool(u),
            "tool_uses_today": int(u.get("tool_usage_count") or 0) if u and u.get("tool_usage_date") == _today_str() else 0,
        })
    return {"items": enriched}


@api.post("/admin/whitelist")
async def admin_add_whitelist(body: WhitelistAdd, authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    email = (body.email or "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    if email == ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="Admin email cannot be whitelisted")
    now = datetime.now(timezone.utc).isoformat()
    await db.whitelist.update_one(
        {"email": email},
        {"$set": {"email": email, "is_premium": bool(body.is_premium), "added_at": now}},
        upsert=True,
    )
    # Sync user is_premium if account already exists
    await db.users.update_one({"email": email}, {"$set": {"is_premium": bool(body.is_premium)}})
    return {"ok": True, "email": email, "is_premium": bool(body.is_premium)}


@api.put("/admin/whitelist")
async def admin_toggle_whitelist(body: WhitelistToggle, authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    email = (body.email or "").lower().strip()
    res = await db.whitelist.update_one(
        {"email": email},
        {"$set": {"is_premium": bool(body.is_premium)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Email not whitelisted")
    await db.users.update_one({"email": email}, {"$set": {"is_premium": bool(body.is_premium)}})
    return {"ok": True, "email": email, "is_premium": bool(body.is_premium)}


@api.delete("/admin/whitelist/{email}")
async def admin_remove_whitelist(email: str, authorization: Optional[str] = Header(None)):
    await require_admin(authorization)
    email = email.lower().strip()
    res = await db.whitelist.delete_one({"email": email})
    # Only clear is_premium if the user has no active paid subscription.
    target = await db.users.find_one({"email": email}, {"_id": 0})
    if target and not _subscription_active(target):
        await db.users.update_one({"email": email}, {"$set": {"is_premium": False}})
    return {"deleted": res.deleted_count}


# =====================================================
# Subscription (mock payment)
# =====================================================
@api.get("/subscription/plans")
async def list_plans():
    """Public — pricing screen calls this to render plan cards."""
    return {
        "plans": [
            {"id": pid, **info, "currency": "INR"}
            for pid, info in SUBSCRIPTION_PLANS.items()
        ]
    }


@api.post("/subscription/subscribe")
async def subscribe(body: SubscribeRequest, authorization: Optional[str] = Header(None)):
    """MOCK PAYMENT: instantly activates a subscription. No real gateway call.
    Extends the existing expiry by `days` if the user is already subscribed.
    """
    user = await get_current_user(authorization)
    plan = (body.plan or "").lower().strip()
    if plan not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")
    info = SUBSCRIPTION_PLANS[plan]
    now = datetime.now(timezone.utc)
    current_exp = _parse_dt(user.get("subscription_expires_at"))
    base = current_exp if (current_exp and current_exp > now) else now
    new_exp = base + timedelta(days=info["days"])
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "subscription_plan": plan,
            "subscription_expires_at": new_exp.isoformat(),
            "is_premium": True,
        }},
    )
    user["subscription_plan"] = plan
    user["subscription_expires_at"] = new_exp.isoformat()
    user["is_premium"] = True
    user = await _ensure_whitelist_sync(user)
    return {
        "ok": True,
        "mock_payment": True,
        "plan": plan,
        "expires_at": new_exp.isoformat(),
        "user": _user_public(user),
    }


@api.post("/subscription/cancel")
async def cancel_subscription(authorization: Optional[str] = Header(None)):
    """Immediately ends the user's subscription. Admin-whitelisted users keep premium."""
    user = await get_current_user(authorization)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"subscription_plan": None, "subscription_expires_at": None}},
    )
    user["subscription_plan"] = None
    user["subscription_expires_at"] = None
    user = await _ensure_whitelist_sync(user)
    return {"ok": True, "user": _user_public(user)}


_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _safe_parse_json(raw: str) -> Optional[Dict[str, Any]]:
    """Try to extract a JSON object from raw LLM output. Tolerates ```json fences and trailing prose."""
    if not raw:
        return None
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        return json.loads(cleaned)
    except Exception:
        match = _JSON_BLOCK_RE.search(cleaned)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except Exception:
            return None


def _parse_numbered_list(raw: str) -> List[str]:
    lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
    items = []
    for ln in lines:
        for prefix in ("1.", "2.", "3.", "4.", "5.", "1)", "2)", "3)", "4)", "5)", "-", "*"):
            if ln.startswith(prefix):
                ln = ln[len(prefix):].strip()
                break
        if ln:
            items.append(ln)
    return items or [raw.strip()]


@api.post("/ai/tool", response_model=AIToolResponse)
async def ai_tool(req: AIToolRequest, authorization: Optional[str] = Header(None)):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text required")

    user = await get_optional_user(authorization)
    await _enforce_and_count_usage(user)

    system_message = _format_prompt(req.tool, req.options)
    session_id = f"tool-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model("gemini", "gemini-3-flash-preview")

    try:
        reply = await chat.send_message(UserMessage(text=req.text))
        raw = str(reply).strip()
    except Exception as e:
        logger.exception("AI tool failed")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")

    multi_tools = MULTI_TOOLS
    data: Optional[Dict[str, Any]] = None
    if req.tool == "grammar":
        # Grammar returns a JSON object with corrected / is_correct / explanation / examples.
        parsed = _safe_parse_json(raw)
        if isinstance(parsed, dict) and parsed.get("corrected"):
            corrected = str(parsed.get("corrected") or "").strip()
            explanation = str(parsed.get("explanation") or "").strip()
            examples = parsed.get("examples") or []
            if not isinstance(examples, list):
                examples = []
            examples = [str(e).strip() for e in examples if str(e).strip()][:5]
            # Detect "no change needed" — trust model's flag, fall back to text comparison.
            raw_correct = parsed.get("is_correct")
            if isinstance(raw_correct, bool):
                is_correct = raw_correct
            else:
                is_correct = corrected.strip().lower() == (req.text or "").strip().lower()
            suggestions = [corrected] if corrected else [raw]
            data = {
                "is_correct": is_correct,
                "explanation": explanation,
                "examples": examples,
            }
        else:
            # Fallback: model returned plain text — keep current UX (single corrected text).
            suggestions = [raw]
    elif req.tool in ("vocab", "vocab_full"):
        data = _safe_parse_json(raw)
        target_lang = (req.options or {}).get("target_language", "English")
        # Script validation: Gemini sometimes ignores the target language for
        # less-common scripts (Telugu/Tamil/Kannada/Malayalam/Gujarati/Punjabi/Urdu/Bengali)
        # and falls back to Hindi/Devanagari. Detect + retry once with a stronger prompt.
        if not _vocab_payload_valid(data, target_lang):
            logger.warning(
                "Vocab translation failed script validation for %s. Retrying with stricter prompt.",
                target_lang,
            )
            retry_system = (
                system_message
                + "\n\nIMPORTANT RETRY INSTRUCTION:\n"
                f"Your previous response did NOT use the {target_lang} script. "
                f"The user requested {target_lang}. You MUST write 'meaning_translated' "
                f"and every tense.translated USING ONLY {target_lang}'s native script. "
                "DO NOT use Hindi or Devanagari unless target is Hindi/Sanskrit/Marathi. "
                "Re-emit the FULL JSON object with the corrected script. JSON ONLY."
            )
            retry_chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"tool-retry-{uuid.uuid4().hex[:8]}",
                system_message=retry_system,
            ).with_model("gemini", "gemini-3-flash-preview")
            try:
                retry_reply = await retry_chat.send_message(UserMessage(text=req.text))
                retry_raw = str(retry_reply).strip()
                retry_data = _safe_parse_json(retry_raw)
                if _vocab_payload_valid(retry_data, target_lang):
                    data = retry_data
                    raw = retry_raw
                elif retry_data and not data:
                    data = retry_data  # at least keep parsed JSON even if script imperfect
                    raw = retry_raw
            except Exception:
                logger.exception("Vocab retry failed")
        # Keep suggestions as the raw text fallback; UI prefers `data` when present.
        suggestions = [raw]
    elif req.tool == "idioms":
        parsed = _safe_parse_json(raw)
        items: List[Dict[str, Any]] = []
        kind: Optional[str] = None
        if isinstance(parsed, dict):
            kind = str(parsed.get("input_kind") or "").lower().strip() or None
            raw_items = parsed.get("items") or []
            if isinstance(raw_items, list):
                for it in raw_items:
                    if not isinstance(it, dict):
                        continue
                    idiom = str(it.get("idiom") or "").strip()
                    meaning = str(it.get("meaning") or "").strip()
                    examples_raw = it.get("examples") or []
                    if not isinstance(examples_raw, list):
                        examples_raw = []
                    examples = [str(e).strip() for e in examples_raw if str(e).strip()][:2]
                    if idiom and meaning:
                        items.append({"idiom": idiom, "meaning": meaning, "examples": examples})
        if items:
            # When kind == 'sentence', strip examples (per spec).
            if kind == "sentence":
                for it in items:
                    it["examples"] = []
            data = {"input_kind": kind or ("idiom" if len(items) == 1 else "sentence"), "items": items}
            suggestions = [f"{it['idiom']} — {it['meaning']}" for it in items]
        else:
            # Fallback: model returned plain text — keep old multi-sentence UX.
            fallback = _parse_numbered_list(raw)
            suggestions = fallback if fallback else [raw]
    elif req.tool in multi_tools:
        suggestions = _parse_numbered_list(raw)
        # Comma-separated outputs (synonyms / antonyms) come back as one chunk — split them.
        if req.tool in ("synonyms", "antonyms") and len(suggestions) == 1 and "," in suggestions[0]:
            suggestions = [s.strip() for s in suggestions[0].split(",") if s.strip()]
    else:
        suggestions = [raw]

    return AIToolResponse(tool=req.tool, original=req.text, suggestions=suggestions, data=data)


# =====================================================
# Chatbot
# =====================================================
@api.post("/ai/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest, authorization: Optional[str] = Header(None)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message required")

    user = await get_optional_user(authorization)
    await _enforce_and_count_usage(user)

    past = await db.chat_messages.find(
        {"session_id": req.session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)

    system = CHAT_SYSTEM_MESSAGE + _build_chat_lang_directive(req.response_language)
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=req.session_id,
        system_message=system,
    ).with_model("gemini", "gemini-3-flash-preview")

    history_text = ""
    for m in past[-10:]:
        role = "User" if m.get("role") == "user" else "Assistant"
        history_text += f"{role}: {m.get('content', '')}\n"
    user_text = (history_text + f"User: {req.message}").strip() if history_text else req.message

    try:
        reply = await chat.send_message(UserMessage(text=user_text))
        reply_text = str(reply).strip()
    except Exception as e:
        logger.exception("Chat failed")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")

    now = datetime.now(timezone.utc).isoformat()
    await db.chat_messages.insert_many(
        [
            {"session_id": req.session_id, "role": "user", "content": req.message, "created_at": now},
            {"session_id": req.session_id, "role": "assistant", "content": reply_text, "created_at": now},
        ]
    )
    return ChatResponse(session_id=req.session_id, reply=reply_text)


@api.get("/ai/chat/{session_id}")
async def chat_history(session_id: str):
    msgs = await db.chat_messages.find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return {"session_id": session_id, "messages": msgs}


# =====================================================
# History
# =====================================================
@api.post("/history")
async def save_history(body: HistoryCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    item = HistoryItem(user_id=user["user_id"], **body.dict())
    await db.history.insert_one(item.dict())
    return item.dict()


@api.get("/history")
async def get_history(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    items = await db.history.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": items}


@api.delete("/history/{item_id}")
async def delete_history(item_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    res = await db.history.delete_one({"id": item_id, "user_id": user["user_id"]})
    return {"deleted": res.deleted_count}


# =====================================================
# OCR — Image → Text (any language)
# =====================================================
@api.post("/ocr", response_model=OCRResponse)
async def ocr(req: OCRRequest):
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 required")
    b64 = req.image_base64
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    try:
        base64.b64decode(b64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image data")

    session_id = f"ocr-{uuid.uuid4().hex[:8]}"
    system = OCR_SYSTEM_MESSAGE
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system).with_model(
        "gemini", "gemini-3-flash-preview"
    )
    try:
        msg = UserMessage(
            text="Extract all visible text from this image.",
            file_contents=[ImageContent(image_base64=b64)],
        )
        reply = await chat.send_message(msg)
        text = str(reply).strip()
    except Exception as e:
        logger.exception("OCR failed")
        raise HTTPException(status_code=502, detail=f"OCR error: {e}")

    if text.upper().startswith("NO_TEXT_FOUND"):
        text = ""
    return OCRResponse(text=text)


# =====================================================
# TTS — Native-voice audio via OpenAI tts-1-hd
# =====================================================
# Voice notes: OpenAI's TTS voices are language-agnostic — each one will speak
# any language, but with a different timbre. After A/B-listening tests, this
# map picks the most natural-sounding voice per language family:
#
#   • Indic (Devanagari / Bengali / Tamil / Telugu / Kannada / Malayalam /
#     Gujarati / Punjabi / Odia / Konkani) → 'coral' — soft, warm, easy on
#     consonants like ख / झ / ट.
#   • Arabic & Urdu → 'shimmer' — fuller emphasis on emphatic consonants and
#     a calmer pace than 'sage'; stays consistent across sentences.
#   • CJK (Japanese / Chinese / Korean) → 'nova' — clean pitch contour, doesn't
#     over-emphasise tones.
#   • English / Spanish / French / German / Portuguese / Italian → 'nova'.
#   • Russian / European Slavic → 'sage'.
#
# Voices we keep around for fallback when no language is specified:
#   'sage' = neutral, dramatic. 'ash' = mature, narrator-style.

# Curated voice per language family — guarantees the SAME voice every time
# the user listens to a particular language across an entire Describe card.
_VOICE_BY_LANGUAGE: dict = {
    # Indic
    "Hindi": ("coral", 0.95),
    "Sanskrit": ("coral", 0.92),
    "Marathi": ("coral", 0.95),
    "Bengali": ("coral", 0.95),
    "Tamil": ("coral", 0.95),
    "Telugu": ("coral", 0.95),
    "Kannada": ("coral", 0.95),
    "Malayalam": ("coral", 0.95),
    "Gujarati": ("coral", 0.95),
    "Punjabi": ("coral", 0.95),
    "Konkani": ("coral", 0.95),
    "Urdu": ("shimmer", 0.92),
    # Middle East
    "Arabic": ("shimmer", 0.9),
    # CJK
    "Japanese": ("nova", 0.92),
    "Chinese": ("nova", 0.92),
    "Korean": ("nova", 0.92),
    # Latin-script European
    "English": ("nova", 1.0),
    "Spanish": ("nova", 1.0),
    "French": ("nova", 1.0),
    "German": ("nova", 1.0),
    "Portuguese": ("nova", 1.0),
    "Italian": ("nova", 1.0),
    "Russian": ("sage", 0.95),
}

_INDIC_RANGES = (
    (0x0900, 0x097F),  # Devanagari (Hindi/Marathi/Sanskrit/Konkani)
    (0x0980, 0x09FF),  # Bengali
    (0x0A00, 0x0A7F),  # Gurmukhi (Punjabi)
    (0x0A80, 0x0AFF),  # Gujarati
    (0x0B00, 0x0B7F),  # Odia
    (0x0B80, 0x0BFF),  # Tamil
    (0x0C00, 0x0C7F),  # Telugu
    (0x0C80, 0x0CFF),  # Kannada
    (0x0D00, 0x0D7F),  # Malayalam
)


def _detect_voice(text: str) -> tuple:
    """Fallback when no language is provided.

    Counts characters by script (NOT first-match) so that texts with mixed
    English+Native content always resolve to the script that dominates the
    sample — preventing the voice from "flipping" between calls.

    Returns (voice, speed).
    """
    if not text:
        return ("nova", 1.0)

    indic = arabic = cjk = latin = 0
    for ch in text:
        code = ord(ch)
        if any(lo <= code <= hi for lo, hi in _INDIC_RANGES):
            indic += 1
        elif 0x0600 <= code <= 0x06FF:
            arabic += 1
        elif 0x4E00 <= code <= 0x9FFF or 0x3040 <= code <= 0x30FF or 0xAC00 <= code <= 0xD7AF:
            cjk += 1
        elif ch.isalpha():
            latin += 1

    # Pick the dominant non-Latin script — Latin is the default "tie-breaker".
    counts = {"indic": indic, "arabic": arabic, "cjk": cjk}
    dominant = max(counts, key=counts.get)
    if counts[dominant] == 0:
        return ("nova", 1.0)
    if dominant == "indic":
        return ("coral", 0.95)
    if dominant == "arabic":
        return ("shimmer", 0.9)
    if dominant == "cjk":
        return ("nova", 0.92)
    return ("nova", 1.0)


@api.post("/tts")
async def tts(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text required")

    # Resolve (voice, speed) — order of precedence:
    #   1. Explicit voice override on the request body.
    #   2. Language hint from the client (e.g. VocabCard knows it's Arabic).
    #   3. Script-based auto-detect as a last-resort heuristic.
    # This priority means every Listen button inside a given Describe card
    # produces the SAME native voice — fixing the "voice changes every time"
    # bug users reported with Arabic and other mixed-script text.
    speed = 1.0
    if req.voice:
        voice = req.voice
    elif req.language and req.language in _VOICE_BY_LANGUAGE:
        voice, speed = _VOICE_BY_LANGUAGE[req.language]
    else:
        voice, speed = _detect_voice(req.text)

    if voice not in OpenAITextToSpeech.VOICES:
        voice = "nova"

    try:
        tts_client = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_bytes = await tts_client.generate_speech(
            text=req.text[:4000],
            model="tts-1-hd",
            voice=voice,
            speed=speed,
            response_format="mp3",
        )
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {"audio_base64": audio_b64, "voice": voice, "mime": "audio/mpeg"}


# =====================================================
# Health
# =====================================================
@api.get("/")
async def root():
    return {"message": "KeyMind AI API", "ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.history.create_index([("user_id", 1), ("created_at", -1)])
    await db.chat_messages.create_index([("session_id", 1), ("created_at", 1)])
    await db.whitelist.create_index("email", unique=True)

    # --- Guest persistence safety net ---
    # 1) Collapse any pre-existing duplicate guest documents that share the same
    #    device id (created by races in older builds). Preserve the highest
    #    same-day usage count and re-point session tokens to the survivor.
    # 2) Then create a UNIQUE partial index on guest_device_id so duplicates
    #    can never be inserted again — this is what makes the daily usage
    #    counter survive cache clears, sign-outs and reinstalls.
    try:
        await _dedupe_guest_users()
    except Exception:
        logger.exception("Guest dedup migration failed (continuing).")
    try:
        await db.users.create_index(
            "guest_device_id",
            unique=True,
            partialFilterExpression={
                "is_guest": True,
                "guest_device_id": {"$type": "string"},
            },
            name="uniq_guest_device_id",
        )
    except Exception:
        logger.exception("Failed to ensure unique guest_device_id index.")

    logger.info("Indexes ready")


async def _dedupe_guest_users() -> None:
    """Merge duplicate guest accounts that share the same `guest_device_id`.

    Strategy per device_id with >1 guest documents:
      • Keep the survivor with the highest `tool_usage_count` for TODAY
        (so an in-progress day's count is never lost). Tie-break by most
        recent `created_at`.
      • Migrate any session tokens from duplicates → survivor.user_id.
      • Delete duplicate user docs.
    """
    today = _today_str()
    pipeline = [
        {"$match": {"is_guest": True, "guest_device_id": {"$type": "string"}}},
        {"$group": {"_id": "$guest_device_id", "count": {"$sum": 1},
                    "ids": {"$push": "$user_id"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    cursor = await db.users.aggregate(pipeline)
    merged = 0
    for group in cursor:
        ids: List[str] = list(group.get("ids") or [])
        if len(ids) < 2:
            continue
        docs = await db.users.find(
            {"user_id": {"$in": ids}}, {"_id": 0}
        ).to_list(length=len(ids))

        def _score(d: Dict[str, Any]):
            same_day_count = (
                int(d.get("tool_usage_count") or 0)
                if d.get("tool_usage_date") == today else 0
            )
            return (same_day_count, str(d.get("created_at") or ""))

        docs.sort(key=_score, reverse=True)
        survivor = docs[0]
        survivor_id = survivor["user_id"]
        loser_ids = [d["user_id"] for d in docs[1:]]
        # Re-point sessions then drop duplicate user docs.
        await db.user_sessions.update_many(
            {"user_id": {"$in": loser_ids}}, {"$set": {"user_id": survivor_id}}
        )
        await db.users.delete_many({"user_id": {"$in": loser_ids}})
        merged += len(loser_ids)
    if merged:
        logger.info("Merged %d duplicate guest user(s) on startup.", merged)


@app.on_event("shutdown")
async def shutdown_db_client():
    # Firestore client is a process-wide singleton — nothing to close.
    if client is not None:
        try:
            client.close()
        except Exception:
            pass
