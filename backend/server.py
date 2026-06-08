from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import hmac
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai.text_to_speech import OpenAITextToSpeech
import base64

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
FREE_TOOL_DAILY_LIMIT = int(os.environ.get("FREE_TOOL_DAILY_LIMIT", "5"))

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


# =====================================================
# Helpers
# =====================================================
def _today_str() -> str:
    return date.today().isoformat()


async def _ensure_whitelist_sync(user: Dict[str, Any]) -> Dict[str, Any]:
    """Reflect whitelist + admin flags onto the user doc if needed."""
    email = (user.get("email") or "").lower().strip()
    is_admin = email == ADMIN_EMAIL
    wl = await db.whitelist.find_one({"email": email}, {"_id": 0})
    is_premium = bool(wl and wl.get("is_premium")) or is_admin
    if user.get("is_admin") != is_admin or user.get("is_premium") != is_premium:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"is_admin": is_admin, "is_premium": is_premium}},
        )
        user["is_admin"] = is_admin
        user["is_premium"] = is_premium
    return user


def _user_public(user: Dict[str, Any]) -> Dict[str, Any]:
    """Public projection of a user document — includes usage info."""
    today = _today_str()
    usage_date = user.get("tool_usage_date")
    usage_count = int(user.get("tool_usage_count") or 0) if usage_date == today else 0
    is_premium = bool(user.get("is_premium") or user.get("is_admin"))
    limit = FREE_TOOL_DAILY_LIMIT
    return {
        "user_id": user.get("user_id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "is_guest": bool(user.get("is_guest")),
        "is_admin": bool(user.get("is_admin")),
        "is_premium": is_premium,
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
            detail=f"Daily free limit reached ({FREE_TOOL_DAILY_LIMIT}/day). Upgrade to Premium for unlimited access.",
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
    await db.users.update_one({"email": email}, {"$set": {"is_premium": False}})
    return {"deleted": res.deleted_count}


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
        "Provide a clear, simple explanation of the given word or phrase: meaning, part of speech, "
        "one usage example. Keep response under 80 words. Plain text only."
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
    if req.tool in multi_tools:
        suggestions = _parse_numbered_list(raw)
        if req.tool == "synonyms" and len(suggestions) == 1 and "," in suggestions[0]:
            suggestions = [s.strip() for s in suggestions[0].split(",") if s.strip()]
    else:
        suggestions = [raw]

    return AIToolResponse(tool=req.tool, original=req.text, suggestions=suggestions)


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
