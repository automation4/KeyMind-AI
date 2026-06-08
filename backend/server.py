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

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText
import base64
import json
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Env
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

# Admin credentials (single-admin app)
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "himthegreat@gmail.com").lower().strip()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "aa$fufm2q")

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
async def create_guest():
    user_id = f"guest_{uuid.uuid4().hex[:12]}"
    token = uuid.uuid4().hex
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
    await db.users.insert_one(user)
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
        }
    )
    return {"session_token": token, "user": _user_public(user)}


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


# =====================================================
# AI Engine (Gemini 3 Flash)
# =====================================================
TOOL_PROMPTS: Dict[str, str] = {
    "grammar": (
        "You are an expert multilingual grammar corrector supporting all Indian languages "
        "(Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu, Assamese), "
        "Romanized variants (Hinglish, Tanglish, Manglish), and 50+ international languages. "
        "Auto-detect the user's input language. Correct grammar, spelling, and clarity while preserving the "
        "ORIGINAL language and script. Return ONLY the corrected text — no explanation, no markdown, no quotes."
    ),
    "tone": (
        "Rewrite the user's text in a {tone} tone. Preserve the original language and meaning. "
        "Return ONLY the rewritten text."
    ),
    "smart_reply": (
        "Generate exactly 3 short, distinct, contextual reply options to the conversation message below. "
        "Format as a numbered list (1., 2., 3.) and nothing else. Match the original language."
    ),
    "vocab": (
        "You are a multilingual vocabulary tutor / word coach. The user wants a deep breakdown of a word or short phrase, "
        "with translations in: **{target_language}**.\n"
        "Output a STRICT JSON object only — no markdown, no code fences, no leading or trailing text — in EXACTLY this shape:\n"
        "{\n"
        "  \"word\": \"<the input word/phrase, cleaned>\",\n"
        "  \"part_of_speech\": \"<noun | verb | adjective | adverb | idiom | phrase | other>\",\n"
        "  \"meaning_simple\": \"<one short ENGLISH sentence using ONLY everyday words a 10-year-old understands>\",\n"
        "  \"tricky_words\": [\"<any word from meaning_simple that a beginner might not know; empty list if none>\"],\n"
        "  \"meaning_translated\": \"<the simple meaning, written in {target_language}>\",\n"
        "  \"meaning_transliterated\": \"<meaning_translated written ONLY in the Latin (English) alphabet so a learner can pronounce it — e.g. Hindi 'किसी चीज़ की हूबहू नकल बनाना' → 'Kisi cheez ki hubahu nakal banana'. EMPTY STRING if target_language already uses Latin script (English/Spanish/French/German).>\",\n"
        "  \"synonyms\": [\"<3-5 common English synonyms>\"],\n"
        "  \"antonyms\": [\"<2-4 common English antonyms; empty list if none exist>\"],\n"
        "  \"spoken_usage\": \"<one short ENGLISH sentence showing how a native speaker would say it in conversation (informal, natural register)>\",\n"
        "  \"spoken_usage_translated\": \"<same sentence translated into {target_language} using its native script>\",\n"
        "  \"spoken_usage_transliterated\": \"<spoken_usage_translated written ONLY in the Latin alphabet — phonetic Hinglish/Tanglish/Tenglish/Banglish/Pinyin/Romaji etc. EMPTY STRING if target_language is already Latin.>\",\n"
        "  \"native_alternative\": \"<a single more natural / idiomatic word or phrase a fluent native speaker would prefer instead; if the word is already natural, suggest a stylistic upgrade>\",\n"
        "  \"native_alternative_why\": \"<one short ENGLISH sentence explaining WHY a native would pick it>\",\n"
        "  \"memory_tip\": \"<one short ENGLISH sentence with a mnemonic, etymology, or vivid image to help remember the word>\",\n"
        "  \"tenses\": {\n"
        "    \"past\":    {\"english\": \"<PAST tense example>\",    \"translated\": \"<same in {target_language} native script>\", \"transliterated\": \"<same in Latin alphabet; empty if Latin>\"},\n"
        "    \"present\": {\"english\": \"<PRESENT tense example>\", \"translated\": \"<same in {target_language} native script>\", \"transliterated\": \"<same in Latin alphabet; empty if Latin>\"},\n"
        "    \"future\":  {\"english\": \"<FUTURE tense example>\",  \"translated\": \"<same in {target_language} native script>\", \"transliterated\": \"<same in Latin alphabet; empty if Latin>\"}\n"
        "  }\n"
        "}\n"
        "CRITICAL SCRIPT RULE (read TWICE before answering):\n"
        "→ Every 'translated' field MUST be written in the NATIVE SCRIPT of {target_language}.\n"
        "→ DO NOT default to Hindi/Devanagari unless target_language is exactly 'Hindi' or 'Sanskrit'.\n"
        "→ If you cannot translate authentically into {target_language}, still attempt it — NEVER substitute another language.\n\n"
        "REQUIRED SCRIPTS PER LANGUAGE (use ONLY the script listed):\n"
        "• English   → Latin (English alphabet)              e.g. \"He sent a message.\"\n"
        "• Hindi     → Devanagari (हिंदी)                       e.g. \"उसने संदेश भेजा।\"\n"
        "• Sanskrit  → Devanagari, CLASSICAL grammar (संस्कृतम्) e.g. \"सः सन्देशम् अप्रेषयत्।\" (विभक्ति, सन्धि, विसर्ग)\n"
        "• Bengali   → Bengali script (বাংলা)                  e.g. \"সে একটি বার্তা পাঠিয়েছিল।\"\n"
        "• Tamil     → Tamil script (தமிழ்) — NO Devanagari    e.g. \"அவன் ஒரு செய்தியை அனுப்பினான்.\"\n"
        "• Telugu    → Telugu script (తెలుగు) — NO Devanagari  e.g. \"అతను ఒక సందేశం పంపాడు.\"\n"
        "• Marathi   → Devanagari (मराठी)                       e.g. \"त्याने एक संदेश पाठवला.\"\n"
        "• Gujarati  → Gujarati script (ગુજરાતી) — NO Devanagari e.g. \"તેણે એક સંદેશ મોકલ્યો.\"\n"
        "• Kannada   → Kannada script (ಕನ್ನಡ) — NO Devanagari   e.g. \"ಅವನು ಒಂದು ಸಂದೇಶವನ್ನು ಕಳುಹಿಸಿದನು.\"\n"
        "• Malayalam → Malayalam script (മലയാളം) — NO Devanagari e.g. \"അവൻ ഒരു സന്ദേശം അയച്ചു.\"\n"
        "• Punjabi   → Gurmukhi (ਪੰਜਾਬੀ)                          e.g. \"ਉਸਨੇ ਇੱਕ ਸੁਨੇਹਾ ਭੇਜਿਆ।\"\n"
        "• Urdu      → Perso-Arabic Nastaliq (اردو) RTL — NO Devanagari e.g. \"اس نے ایک پیغام بھیجا۔\"\n"
        "• Arabic    → Arabic script (العربية) RTL\n"
        "• Spanish   → Latin              French → Latin              German → Latin\n"
        "• Japanese  → Kana + Kanji (日本語)\n"
        "• Chinese   → Simplified Hanzi (中文)\n\n"
        "OTHER RULES:\n"
        "1. meaning_simple, synonyms, antonyms, spoken_usage, native_alternative_why, memory_tip, and the 'english' tense fields are ALWAYS in plain English.\n"
        "2. tricky_words = unusual words from meaning_simple (or []).\n"
        "3. If {target_language} is English, 'meaning_translated', 'spoken_usage_translated', and every tense.translated equal their english counterparts verbatim; transliterated fields are EMPTY STRINGS.\n"
        "4. If {target_language} is Spanish, French, German, or any other Latin-script language: transliterated fields MUST be EMPTY STRINGS (the translated text is already Latin).\n"
        "5. For ALL non-Latin languages (Hindi, Sanskrit, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu, Arabic, Japanese, Chinese): every transliterated field MUST be a phonetic Latin-alphabet rendering — readable for English speakers. Use the popular romanization: Hinglish for Hindi/Marathi/Sanskrit, Tanglish for Tamil, Tenglish for Telugu, Banglish for Bengali, Punjabi-Roman for Punjabi, Roman-Urdu for Urdu, Romanized Arabic for Arabic, Romaji for Japanese, Pinyin (with tone marks ok) for Chinese.\n"
        "6. Verify before output: does every 'translated' field use the script listed above for {target_language}? If not, REWRITE it. Does every 'transliterated' field use ONLY Latin letters (a-z, A-Z, basic punctuation, spaces)? If it contains any non-Latin character, REWRITE.\n"
        "7. If antonyms genuinely don't exist (e.g. proper nouns, technical terms), return an empty list — do NOT invent.\n"
        "Output JSON ONLY — no fences, no prose."
    ),
    "translate": (
        "Translate the following text to {target_language}. Preserve tone and meaning. "
        "Return ONLY the translation."
    ),
    "enhance": (
        "Improve the vocabulary and sentence structure of the text below while preserving meaning and language. "
        "Return ONLY the enhanced text."
    ),
    "ask": (
        "You are a helpful AI writing assistant. Respond directly and concisely to the user's request below."
    ),
    "paraphrase": (
        "Generate exactly 3 distinct paraphrased versions of the text below. Preserve language and meaning. "
        "Format as a numbered list (1., 2., 3.) and nothing else."
    ),
    "emoji": (
        "Suggest 8 relevant emojis (only emoji characters, separated by single spaces) that match the mood and "
        "content of the text below. Return ONLY the emojis."
    ),
    "longer": (
        "Expand the text below into a more detailed version with relevant context. Preserve the original "
        "language and tone. Return ONLY the expanded text."
    ),
    "continue": (
        "Continue writing the text below naturally. Generate exactly 2 distinct continuation options. "
        "Format as a numbered list (1., 2.) and nothing else. Match the original language."
    ),
    "summarize": (
        "Summarize the text below concisely as 3-5 bullet points. Preserve the original language. "
        "Return ONLY the bullet points (use '- ' prefix)."
    ),
    "synonyms": (
        "List 6 context-aware synonyms for the given word (comma-separated, no numbering). "
        "Return ONLY the synonyms."
    ),
    "email": (
        "Write a complete professional email based on the user's brief idea below. Use {tone} tone. "
        "Include subject, greeting, body, and signoff. Return ONLY the email."
    ),
    "shorter": (
        "Trim the text below to a concise version. Remove filler words. Preserve core meaning and language. "
        "Return ONLY the shortened text."
    ),
    "versify": (
        "Convert the text below into a {style} (poem, shayari, or rhyming verse). Match the original language. "
        "Return ONLY the verse."
    ),
}


def _format_prompt(tool: str, options: Dict[str, Any]) -> str:
    template = TOOL_PROMPTS.get(tool, TOOL_PROMPTS["ask"])
    safe = {
        "tone": options.get("tone", "professional"),
        "target_language": options.get("target_language", "English"),
        "style": options.get("style", "poem"),
    }
    try:
        return template.format(**safe)
    except KeyError:
        return template


_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


# Unicode range per language for the `meaning_translated` script validation.
# Each value is a list of (start_codepoint, end_codepoint) inclusive ranges.
# Latin-script languages are handled by the `latin` keyword.
LANG_SCRIPT_RANGES: Dict[str, Any] = {
    "English":   "latin",
    "Spanish":   "latin",
    "French":    "latin",
    "German":    "latin",
    "Hindi":     [(0x0900, 0x097F)],           # Devanagari
    "Sanskrit":  [(0x0900, 0x097F)],           # Devanagari
    "Marathi":   [(0x0900, 0x097F)],           # Devanagari
    "Bengali":   [(0x0980, 0x09FF)],           # Bengali
    "Tamil":     [(0x0B80, 0x0BFF)],           # Tamil
    "Telugu":    [(0x0C00, 0x0C7F)],           # Telugu
    "Kannada":   [(0x0C80, 0x0CFF)],           # Kannada
    "Malayalam": [(0x0D00, 0x0D7F)],           # Malayalam
    "Gujarati":  [(0x0A80, 0x0AFF)],           # Gujarati
    "Punjabi":   [(0x0A00, 0x0A7F)],           # Gurmukhi
    "Urdu":      [(0x0600, 0x06FF), (0x0750, 0x077F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)],  # Arabic + Urdu
    "Arabic":    [(0x0600, 0x06FF), (0x0750, 0x077F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)],
    "Japanese":  [(0x3040, 0x309F), (0x30A0, 0x30FF), (0x4E00, 0x9FFF)],  # Hiragana, Katakana, Kanji
    "Chinese":   [(0x4E00, 0x9FFF), (0x3400, 0x4DBF)],  # CJK
}


def _text_matches_script(text: str, language: str) -> bool:
    """Return True if `text` is plausibly written in the script of `language`.
    Allows ASCII punctuation/digits/spaces. For non-Latin languages we require
    at least 60% of *letter* characters to fall in the expected Unicode range.
    """
    if not text or not language:
        return True  # nothing to check
    spec = LANG_SCRIPT_RANGES.get(language)
    if spec is None:
        return True  # unknown language → don't block
    if spec == "latin":
        # Most letters should be in Latin alphabet (ASCII A-Z/a-z + Latin Extended A/B)
        letters = [c for c in text if c.isalpha()]
        if not letters:
            return True
        latin_letters = sum(
            1 for c in letters
            if (0x0041 <= ord(c) <= 0x005A)
            or (0x0061 <= ord(c) <= 0x007A)
            or (0x00C0 <= ord(c) <= 0x024F)
        )
        return latin_letters / len(letters) >= 0.7
    # Non-Latin: count letters in target Unicode ranges vs all letters
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    in_range = 0
    for c in letters:
        cp = ord(c)
        for lo, hi in spec:
            if lo <= cp <= hi:
                in_range += 1
                break
    return in_range / len(letters) >= 0.6


def _vocab_payload_valid(data: Optional[Dict[str, Any]], target_language: str) -> bool:
    """Validate that a parsed vocab JSON has the correct script for the target language
    in `meaning_translated` and tense translations."""
    if not data or not isinstance(data, dict):
        return False
    mt = data.get("meaning_translated") or ""
    if not _text_matches_script(mt, target_language):
        return False
    tenses = data.get("tenses") or {}
    for k in ("past", "present", "future"):
        row = tenses.get(k) or {}
        tr = (row.get("translated") or "").strip()
        if tr and not _text_matches_script(tr, target_language):
            return False
    return True


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

    multi_tools = {"smart_reply", "paraphrase", "continue", "summarize", "synonyms"}
    data: Optional[Dict[str, Any]] = None
    if req.tool == "vocab":
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
    elif req.tool in multi_tools:
        suggestions = _parse_numbered_list(raw)
        if req.tool == "synonyms" and len(suggestions) == 1 and "," in suggestions[0]:
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

    system = (
        "You are KeyMind AI Tutor — a friendly assistant who explains grammar rules, word meanings, "
        "translations, and language usage clearly and simply in the user's preferred language. "
        "Keep responses concise (<150 words), use examples, and be encouraging."
    )
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
    system = (
        "You are an OCR engine. Extract ALL readable text from the image EXACTLY as written. "
        "Preserve original language, script (Devanagari, Tamil, Bengali, Arabic, Chinese, etc.), "
        "and line breaks. Do NOT translate, summarize, explain, or add formatting. "
        "If the image contains no readable text, reply with the single token: NO_TEXT_FOUND"
    )
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
        result = await stt.transcribe(
            file=tmp_path,
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
