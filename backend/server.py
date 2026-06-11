from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, File, UploadFile, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
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
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

# Admin credentials (single-admin app)
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "himthegreat@gmail.com").lower().strip()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "aa$fufm2q")

# Password hashing for email/password accounts
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Free-tier daily AI usage limit (any tool, any combination)
FREE_TOOL_DAILY_LIMIT = int(os.environ.get("FREE_TOOL_DAILY_LIMIT", "10"))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

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


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class EmailLoginRequest(BaseModel):
    email: str
    password: str


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
    is_premium = bool(user.get("is_premium") or user.get("is_admin"))
    limit = FREE_TOOL_DAILY_LIMIT
    # Premium source for UI labelling: "admin" | "subscription" | None
    source: Optional[str] = None
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
        "is_guest": bool(user.get("is_guest")),
        "is_admin": bool(user.get("is_admin")),
        "is_premium": is_premium,
        "premium_source": source,
        "subscription_plan": user.get("subscription_plan"),
        "subscription_expires_at": exp.isoformat() if exp else None,
        "tool_uses_today": usage_count,
        "tool_uses_limit": limit,
        "tool_uses_remaining": max(0, limit - usage_count) if not is_premium else None,
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


@api.post("/auth/guest")
async def create_guest(body: Optional[GuestAuth] = None):
    device_id = (body.device_id or "").strip() if body else ""
    user = None
    if device_id:
        # One guest account per device — reuse so usage limits persist.
        user = await db.users.find_one(
            {"guest_device_id": device_id, "is_guest": True}, {"_id": 0}
        )
    if not user:
        user_id = f"guest_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": f"{user_id}@guest.local",
            "name": "Guest",
            "picture": None,
            "is_guest": True,
            "is_admin": False,
            "is_premium": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if device_id:
            user["guest_device_id"] = device_id
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


@api.post("/auth/register")
async def register(body: RegisterRequest):
    email = (body.email or "").lower().strip()
    name = (body.name or "").strip()
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if not name:
        raise HTTPException(status_code=400, detail="Enter your name")
    if len(body.password or "") < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if email == ADMIN_EMAIL:
        raise HTTPException(status_code=400, detail="This email cannot be registered")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered. Sign in instead.")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user = {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": None,
        "is_guest": False,
        "is_admin": False,
        "is_premium": False,
        "auth_provider": "password",
        "password_hash": pwd_context.hash(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(dict(user))

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
# TTS — Native-voice audio via OpenAI tts-1
# =====================================================
def _detect_voice(text: str) -> str:
    if not text:
        return "nova"
    for ch in text:
        code = ord(ch)
        if 0x0900 <= code <= 0x097F:
            return "shimmer"
        if 0x0980 <= code <= 0x09FF:
            return "shimmer"
        if 0x0B80 <= code <= 0x0BFF:
            return "nova"
        if 0x0C00 <= code <= 0x0C7F:
            return "nova"
        if 0x0C80 <= code <= 0x0CFF:
            return "nova"
        if 0x0D00 <= code <= 0x0D7F:
            return "nova"
        if 0x0A80 <= code <= 0x0AFF:
            return "shimmer"
        if 0x0A00 <= code <= 0x0A7F:
            return "shimmer"
        if 0x0B00 <= code <= 0x0B7F:
            return "nova"
        if 0x0600 <= code <= 0x06FF:
            return "fable"
        if 0x4E00 <= code <= 0x9FFF:
            return "alloy"
        if 0x3040 <= code <= 0x30FF:
            return "alloy"
    return "nova"


@api.post("/tts")
async def tts(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text required")

    voice = req.voice or _detect_voice(req.text)
    if voice not in OpenAITextToSpeech.VOICES:
        voice = "nova"

    try:
        tts_client = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_bytes = await tts_client.generate_speech(
            text=req.text[:4000],
            model="tts-1",
            voice=voice,
            speed=1.0,
            response_format="mp3",
        )
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS error: {e}")

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {"audio_base64": audio_b64, "voice": voice, "mime": "audio/mpeg"}


@api.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
):
    """Speech-to-text via OpenAI Whisper-1 (through Emergent LLM Key).
    Accepts m4a/mp3/wav/webm/mp4. Returns {text: "..."}.
    Does NOT count toward the daily AI-tool limit — voice typing is an input aid.
    """
    # Optional auth — guests can use voice input too. Just makes sure caller is valid if header sent.
    if authorization:
        try:
            await get_current_user(authorization)
        except HTTPException:
            pass  # don't block transcription if session expired

    filename = audio.filename or "voice.m4a"
    ext = Path(filename).suffix.lstrip(".").lower()
    if ext not in {"m4a", "mp3", "mp4", "mpeg", "mpga", "wav", "webm"}:
        # Default to m4a since expo-audio records m4a/aac on iOS, m4a/mp4 on Android.
        ext = "m4a"

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large (max 25MB)")

    tmp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        # Whisper auto-detects language when `language` is None.
        # litellm expects `file` to be bytes / IOBase / PathLike — NOT a plain str,
        # so we open the temp file as a binary handle.
        with open(tmp_path, "rb") as fh:
            result = await stt.transcribe(
                file=fh,
                model="whisper-1",
                response_format="json",
                language=language or None,
                temperature=0.0,
            )
        # `result` is a dict-like / LiteLLM TranscriptionResponse. Pull `.text`.
        text = ""
        if isinstance(result, dict):
            text = result.get("text") or ""
        else:
            text = getattr(result, "text", "") or str(result)
        return {"text": text.strip()}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription error: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


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
    logger.info("Indexes ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
