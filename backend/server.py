from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Env
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

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


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None


class GuestAuth(BaseModel):
    name: Optional[str] = None


class AIToolRequest(BaseModel):
    tool: str  # grammar | tone | smart_reply | vocab | translate | enhance | ask | paraphrase | emoji | longer | continue | summarize | synonyms | email | shorter | versify
    text: str
    options: Dict[str, Any] = Field(default_factory=dict)  # e.g. {"tone": "professional", "target_language": "Hindi"}


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


# =====================================================
# Auth Helpers
# =====================================================
async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    # Normalize expires_at
    expires_at = session.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# =====================================================
# Auth Routes
# =====================================================
@api.post("/auth/session")
async def create_session(body: SessionCreate):
    """Exchange Emergent session_id (one-time) for a persistent session_token."""
    url = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get(url, headers={"X-Session-ID": body.session_id})
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Auth service unreachable: {e}")

    email = data.get("email")
    name = data.get("name", email)
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=502, detail="Malformed auth response")

    # Upsert user by email
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
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    # Store session
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        }
    )

    return {
        "session_token": session_token,
        "user": {"user_id": user_id, "email": email, "name": name, "picture": picture},
    }


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
    return {
        "session_token": token,
        "user": {"user_id": user_id, "email": user["email"], "name": user["name"], "picture": None, "is_guest": True},
    }


@api.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    return {"user": user}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


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
        # Strip "1.", "1)", "- ", "* "
        for prefix in ("1.", "2.", "3.", "4.", "5.", "1)", "2)", "3)", "4)", "5)", "-", "*"):
            if ln.startswith(prefix):
                ln = ln[len(prefix):].strip()
                break
        if ln:
            items.append(ln)
    return items or [raw.strip()]


@api.post("/ai/tool", response_model=AIToolResponse)
async def ai_tool(req: AIToolRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text required")

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
async def ai_chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message required")

    # Load past messages for context
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

    # Replay context as a single concatenated user message (LlmChat handles its own session,
    # but to keep stateless across requests we feed prior turns)
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
# Health
# =====================================================
@api.get("/")
async def root():
    return {"message": "KeyMind AI API", "ok": True}


# Mount router
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
    logger.info("Indexes ready")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
