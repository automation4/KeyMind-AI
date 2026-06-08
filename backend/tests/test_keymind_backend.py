"""KeyMind AI Backend tests - guest auth, AI tools, chat, history."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
# Fallback: read frontend/.env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("EXPO_PUBLIC_BACKEND_URL"):
                BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def guest_auth(session):
    r = session.post(f"{API}/auth/guest", json={})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "session_token" in data and "user" in data
    return data


# ============ AUTH ============
class TestAuth:
    def test_guest_signin(self, guest_auth):
        assert guest_auth["user"]["is_guest"] is True
        assert guest_auth["user"]["user_id"].startswith("guest_")

    def test_me_with_token(self, session, guest_auth):
        token = guest_auth["session_token"]
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["user_id"] == guest_auth["user"]["user_id"]

    def test_me_without_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_logout_invalidates(self, session):
        # fresh guest for logout test
        r = session.post(f"{API}/auth/guest", json={})
        token = r.json()["session_token"]
        # Confirm works
        r1 = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r1.status_code == 200
        # Logout
        r2 = session.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        # Now should 401
        r3 = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r3.status_code == 401


# ============ AI TOOLS ============
class TestAITools:
    def test_grammar_english(self, session):
        r = session.post(f"{API}/ai/tool", json={"tool": "grammar", "text": "she go to market yesterday"}, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tool"] == "grammar"
        assert isinstance(body["suggestions"], list) and len(body["suggestions"]) >= 1
        corrected = body["suggestions"][0].lower()
        # Expect 'went' or 'goes' style correction
        assert "went" in corrected or "going" in corrected or "goes" in corrected, f"Got: {corrected}"

    def test_grammar_hinglish_preserves_roman(self, session):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "grammar", "text": "mein kal market gaya tha"}, timeout=60)
        assert r.status_code == 200, r.text
        out = r.json()["suggestions"][0]
        # Should remain in Roman/Latin script (no devanagari)
        has_devanagari = any('\u0900' <= ch <= '\u097F' for ch in out)
        assert not has_devanagari, f"Expected Roman Hinglish, got: {out}"
        assert len(out) > 0

    def test_paraphrase_returns_3(self, session):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "paraphrase", "text": "The weather is nice today and I am happy."},
                         timeout=60)
        assert r.status_code == 200, r.text
        suggestions = r.json()["suggestions"]
        assert len(suggestions) == 3, f"Expected 3, got {len(suggestions)}: {suggestions}"

    def test_translate_to_hindi(self, session):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "translate", "text": "Good morning, how are you?",
                               "options": {"target_language": "Hindi"}}, timeout=60)
        assert r.status_code == 200, r.text
        out = r.json()["suggestions"][0]
        has_devanagari = any('\u0900' <= ch <= '\u097F' for ch in out)
        assert has_devanagari, f"Expected Devanagari, got: {out}"

    def test_tone_professional(self, session):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "tone", "text": "hey can u send me that file asap",
                               "options": {"tone": "professional"}}, timeout=60)
        assert r.status_code == 200, r.text
        out = r.json()["suggestions"][0]
        assert len(out) > 5

    def test_summarize_bullets(self, session):
        text = ("Artificial intelligence is transforming industries. It helps with automation, "
                "improves productivity, and enables new discoveries in medicine and science. "
                "However, it also raises ethical questions about bias, privacy, and employment.")
        r = session.post(f"{API}/ai/tool", json={"tool": "summarize", "text": text}, timeout=60)
        assert r.status_code == 200, r.text
        bullets = r.json()["suggestions"]
        assert len(bullets) >= 2, f"Expected multiple bullets, got: {bullets}"

    def test_synonyms_min_3(self, session):
        r = session.post(f"{API}/ai/tool", json={"tool": "synonyms", "text": "happy"}, timeout=60)
        assert r.status_code == 200, r.text
        syns = r.json()["suggestions"]
        assert len(syns) >= 3, f"Expected ≥3 synonyms, got: {syns}"

    def test_emoji(self, session):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "emoji", "text": "I'm so happy about my birthday party tomorrow!"},
                         timeout=60)
        assert r.status_code == 200, r.text
        out = r.json()["suggestions"][0]
        # Emoji chars are typically in supplementary planes (>= U+1F000) or symbols range
        has_emoji = any(ord(ch) > 0x2000 for ch in out)
        assert has_emoji, f"No emoji chars in output: {out!r}"

    def test_empty_text_returns_400(self, session):
        r = session.post(f"{API}/ai/tool", json={"tool": "grammar", "text": "   "})
        assert r.status_code == 400


# ============ CHAT ============
class TestChat:
    def test_chat_and_history(self, session):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        r = session.post(f"{API}/ai/chat",
                         json={"session_id": sid, "message": "What does 'serendipity' mean?"},
                         timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["session_id"] == sid
        assert len(body["reply"]) > 0

        # Fetch history
        r2 = session.get(f"{API}/ai/chat/{sid}", timeout=30)
        assert r2.status_code == 200
        msgs = r2.json()["messages"]
        assert len(msgs) >= 2
        roles = [m["role"] for m in msgs]
        assert "user" in roles and "assistant" in roles


# ============ HISTORY ============
class TestHistory:
    def test_history_crud(self, session, guest_auth):
        token = guest_auth["session_token"]
        h = {"Authorization": f"Bearer {token}"}

        # Create
        payload = {"tool": "grammar", "original": "TEST_he go", "applied": "TEST_he goes"}
        r = session.post(f"{API}/history", json=payload, headers=h)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["tool"] == "grammar"
        assert item["applied"] == "TEST_he goes"
        item_id = item["id"]

        # List
        r2 = session.get(f"{API}/history", headers=h)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert any(it["id"] == item_id for it in items), "Newly created item not in list"

        # Delete
        r3 = session.delete(f"{API}/history/{item_id}", headers=h)
        assert r3.status_code == 200
        assert r3.json()["deleted"] == 1

        # Verify gone
        r4 = session.get(f"{API}/history", headers=h)
        ids_after = [it["id"] for it in r4.json()["items"]]
        assert item_id not in ids_after

    def test_history_requires_auth(self, session):
        r = session.get(f"{API}/history")
        assert r.status_code == 401
