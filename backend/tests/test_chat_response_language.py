"""Tests for the new chat `response_language` feature.

Covers:
- Backwards compatibility (no field / auto)
- Hindi (Devanagari script)
- Hinglish (Roman / no Devanagari)
- Konkani Devanagari + Romi
- Translation format preservation with non-default reply language
- Pydantic acceptance of optional response_language
"""
import os
import re
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://multilingual-text-2.preview.emergentagent.com").rstrip("/")

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
LATIN_LETTER_RE = re.compile(r"[A-Za-z]")


def _has_devanagari(text: str) -> bool:
    return bool(DEVANAGARI_RE.search(text or ""))


def _has_latin(text: str) -> bool:
    return bool(LATIN_LETTER_RE.search(text or ""))


def _devanagari_ratio(text: str) -> float:
    if not text:
        return 0.0
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    deva = sum(1 for c in letters if 0x0900 <= ord(c) <= 0x097F)
    return deva / len(letters)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _post_chat(session, payload):
    r = session.post(f"{BASE_URL}/api/ai/chat", json=payload, timeout=60)
    return r


class TestChatResponseLanguage:
    def test_health(self, session):
        r = session.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_chat_backward_compatible_no_field(self, session):
        """No response_language field at all → should work fine (backwards compat)."""
        sid = f"test-chat-bc-{uuid.uuid4().hex[:8]}"
        r = _post_chat(session, {"session_id": sid, "message": "Say hi in one short sentence."})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["session_id"] == sid
        assert isinstance(body["reply"], str) and body["reply"].strip()

    def test_chat_response_language_auto(self, session):
        """response_language='auto' should behave like default — reply primarily in English."""
        sid = f"test-chat-auto-{uuid.uuid4().hex[:8]}"
        r = _post_chat(
            session,
            {"session_id": sid, "message": "Say hi in one short sentence.", "response_language": "auto"},
        )
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        assert _has_latin(reply), f"Auto reply should contain Latin letters, got: {reply!r}"
        assert not _has_devanagari(reply), f"Auto reply should NOT contain Devanagari, got: {reply!r}"

    def test_chat_response_language_hindi_uses_devanagari(self, session):
        sid = f"test-chat-hi-{uuid.uuid4().hex[:8]}"
        r = _post_chat(
            session,
            {
                "session_id": sid,
                "message": "Tell me a one-line motivational quote",
                "response_language": "hindi",
            },
        )
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        ratio = _devanagari_ratio(reply)
        assert ratio >= 0.5, (
            f"Hindi reply should be predominantly Devanagari (ratio={ratio:.2f}): {reply!r}"
        )

    def test_chat_response_language_hinglish_is_roman_only(self, session):
        sid = f"test-chat-hing-{uuid.uuid4().hex[:8]}"
        r = _post_chat(
            session,
            {
                "session_id": sid,
                "message": "Tell me a one-line motivational quote",
                "response_language": "hinglish",
            },
        )
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        assert _has_latin(reply), f"Hinglish reply should contain Latin: {reply!r}"
        # Allow at most a couple of stray Devanagari chars but ratio must be near zero.
        ratio = _devanagari_ratio(reply)
        assert ratio <= 0.05, (
            f"Hinglish reply must be Roman/Latin, not Devanagari (ratio={ratio:.2f}): {reply!r}"
        )

    def test_chat_response_language_konkani_deva(self, session):
        sid = f"test-chat-koDV-{uuid.uuid4().hex[:8]}"
        r = _post_chat(
            session,
            {
                "session_id": sid,
                "message": "Tell me a one-line motivational quote",
                "response_language": "konkani-deva",
            },
        )
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        ratio = _devanagari_ratio(reply)
        assert ratio >= 0.4, (
            f"Konkani-Devanagari reply should use Devanagari (ratio={ratio:.2f}): {reply!r}"
        )

    def test_chat_response_language_konkani_romi(self, session):
        sid = f"test-chat-koRO-{uuid.uuid4().hex[:8]}"
        r = _post_chat(
            session,
            {
                "session_id": sid,
                "message": "Tell me a one-line motivational quote",
                "response_language": "konkani-romi",
            },
        )
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        assert _has_latin(reply), f"Konkani-Romi reply should contain Latin: {reply!r}"
        ratio = _devanagari_ratio(reply)
        assert ratio <= 0.05, (
            f"Konkani-Romi reply must be Roman, not Devanagari (ratio={ratio:.2f}): {reply!r}"
        )

    def test_translation_format_with_hindi_reply_language(self, session):
        """Translation request → <Lang>: line stays in target script (French),
        but Quick Tip / explanations should be in Hindi (Devanagari)."""
        sid = f"test-chat-tx-{uuid.uuid4().hex[:8]}"
        r = _post_chat(
            session,
            {
                "session_id": sid,
                "message": "How do I say 'good morning' in French",
                "response_language": "hindi",
            },
        )
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        # Sanity: must contain the French translation token "Bonjour" (case-insensitive)
        assert "bonjour" in reply.lower(), f"Expected French translation, got: {reply!r}"
        # And there should be Devanagari somewhere (Quick Tip / explanation in Hindi).
        assert _has_devanagari(reply), (
            f"Translation reply with hindi response_language should include Devanagari in tips: {reply!r}"
        )

    def test_chat_request_accepts_optional_response_language(self, session):
        """ChatRequest model should accept the optional field without 422/400."""
        sid = f"test-chat-opt-{uuid.uuid4().hex[:8]}"
        # Explicit null should still be valid (Optional[str] = None).
        r = _post_chat(
            session,
            {"session_id": sid, "message": "hi", "response_language": None},
        )
        assert r.status_code == 200, f"Expected 200 for response_language=None, got {r.status_code}: {r.text}"

        # Empty string also OK (treated as auto by build_chat_response_language_directive).
        r2 = _post_chat(
            session,
            {"session_id": sid + "-2", "message": "hi", "response_language": ""},
        )
        assert r2.status_code == 200, f"Expected 200 for empty string, got {r2.status_code}: {r2.text}"

    def test_chat_history_endpoint(self, session):
        sid = f"test-chat-hist-{uuid.uuid4().hex[:8]}"
        r = _post_chat(
            session,
            {"session_id": sid, "message": "ping", "response_language": "english"},
        )
        assert r.status_code == 200, r.text
        time.sleep(0.5)
        h = session.get(f"{BASE_URL}/api/ai/chat/{sid}", timeout=15)
        assert h.status_code == 200, h.text
        msgs = h.json()["messages"]
        assert len(msgs) >= 2
        assert any(m["role"] == "user" for m in msgs)
        assert any(m["role"] == "assistant" for m in msgs)
