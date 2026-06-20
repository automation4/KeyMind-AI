"""
Iter 17 — Firestore migration regression suite.
Verifies that all routes in server.py still behave correctly after swapping
Motor → firestore_compat shim. Tests run against the public preview URL.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://multilingual-text-2.preview.emergentagent.com"
).rstrip("/")

API = f"{BASE_URL}/api"


# ---------------- helpers ----------------
def _new_device_id() -> str:
    return f"test_firestore_{uuid.uuid4().hex[:12]}"


def _guest_signup(device_id: str) -> dict:
    r = requests.post(f"{API}/auth/guest", json={"device_id": device_id}, timeout=30)
    assert r.status_code == 200, f"guest signup failed: {r.status_code} {r.text}"
    return r.json()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------- 1. Guest signup ----------------
class TestGuestAuth:
    def test_guest_signup_returns_user_and_token(self):
        device_id = _new_device_id()
        data = _guest_signup(device_id)
        assert "session_token" in data and data["session_token"]
        assert "user" in data
        user = data["user"]
        assert user.get("user_id")
        assert user.get("is_guest") is True
        assert user.get("tool_uses_today") == 0
        assert user.get("tool_uses_limit") == 5
        # email may be auto-generated guest@... or None — accept either
        assert "email" in user

    def test_guest_idempotent_same_device_id(self):
        device_id = _new_device_id()
        a = _guest_signup(device_id)
        b = _guest_signup(device_id)
        assert a["user"]["user_id"] == b["user"]["user_id"], (
            f"Idempotency broken: {a['user']['user_id']} != {b['user']['user_id']}"
        )


# ---------------- 2. /auth/me ----------------
class TestAuthMe:
    def test_auth_me_returns_wrapped_user(self):
        device_id = _new_device_id()
        data = _guest_signup(device_id)
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(data["session_token"]), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "user" in body
        u = body["user"]
        assert u["user_id"] == data["user"]["user_id"]
        assert "tool_uses_today" in u and "tool_uses_limit" in u
        assert u["tool_uses_limit"] == 5


# ---------------- 3. AI tool invocations ----------------
class TestAITool:
    def test_grammar_tool_increments_counter(self):
        device_id = _new_device_id()
        data = _guest_signup(device_id)
        token = data["session_token"]
        r = requests.post(
            f"{API}/ai/tool",
            headers=_auth_headers(token),
            json={"tool": "grammar", "text": "she go to school every day"},
            timeout=60,
        )
        assert r.status_code == 200, f"grammar tool failed: {r.status_code} {r.text}"
        body = r.json()
        # response shape: {data: {...}, ...}
        assert "data" in body or "applied" in body or "corrected" in body
        time.sleep(0.5)
        me = requests.get(f"{API}/auth/me", headers=_auth_headers(token), timeout=15).json()
        assert me["user"]["tool_uses_today"] == 1

    def test_vocab_full_konkani_returns_meaning_simple(self):
        device_id = _new_device_id()
        data = _guest_signup(device_id)
        token = data["session_token"]
        r = requests.post(
            f"{API}/ai/tool",
            headers=_auth_headers(token),
            json={
                "tool": "vocab_full",
                "text": "ubiquitous",
                "target_language": "Konkani",
            },
            timeout=90,
        )
        assert r.status_code == 200, f"vocab_full failed: {r.status_code} {r.text}"
        body = r.json()
        data_obj = body.get("data") or body
        assert "meaning_simple" in data_obj, f"meaning_simple missing: {body}"
        time.sleep(0.5)
        me = requests.get(f"{API}/auth/me", headers=_auth_headers(token), timeout=15).json()
        assert me["user"]["tool_uses_today"] == 1


# ---------------- 4. Daily limit enforcement ----------------
class TestDailyLimit:
    def test_sixth_call_returns_429(self):
        device_id = _new_device_id()
        data = _guest_signup(device_id)
        token = data["session_token"]
        # 5 successful grammar calls
        for i in range(5):
            r = requests.post(
                f"{API}/ai/tool",
                headers=_auth_headers(token),
                json={"tool": "grammar", "text": f"hello world {i}"},
                timeout=60,
            )
            assert r.status_code == 200, f"call #{i+1} failed: {r.status_code} {r.text}"
        # 6th must be rejected
        r6 = requests.post(
            f"{API}/ai/tool",
            headers=_auth_headers(token),
            json={"tool": "grammar", "text": "should be blocked"},
            timeout=60,
        )
        assert r6.status_code == 429, f"expected 429, got {r6.status_code}: {r6.text}"


# ---------------- 5. setup-complete persistence ----------------
class TestSetupComplete:
    def test_setup_complete_persists_across_reauth(self):
        device_id = _new_device_id()
        first = _guest_signup(device_id)
        token = first["session_token"]
        r = requests.post(
            f"{API}/auth/setup-complete",
            headers=_auth_headers(token),
            json={},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Re-auth same device — must report setup_completed=true
        second = _guest_signup(device_id)
        u = second["user"]
        assert u["user_id"] == first["user"]["user_id"]
        assert u.get("setup_completed") is True, f"setup_completed not persisted: {u}"


# ---------------- 6. History CRUD ----------------
class TestHistory:
    def test_create_get_delete_history(self):
        device_id = _new_device_id()
        token = _guest_signup(device_id)["session_token"]
        h = _auth_headers(token)
        payload = {
            "tool": "grammar",
            "original": "she go school",
            "applied": "She goes to school.",
        }
        r = requests.post(f"{API}/history", headers=h, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item.get("id") and item.get("applied") == payload["applied"]

        # GET
        g = requests.get(f"{API}/history", headers=h, timeout=15).json()
        items = g.get("items", [])
        assert any(it["id"] == item["id"] for it in items), f"saved item missing: {items}"

        # DELETE
        d = requests.delete(f"{API}/history/{item['id']}", headers=h, timeout=15)
        assert d.status_code == 200, d.text

        # GET after delete
        g2 = requests.get(f"{API}/history", headers=h, timeout=15).json()
        assert not any(it["id"] == item["id"] for it in g2.get("items", []))


# ---------------- 7. AI chat ----------------
class TestAIChat:
    def test_chat_session_send_history(self):
        device_id = _new_device_id()
        token = _guest_signup(device_id)["session_token"]
        h = _auth_headers(token)

        s = requests.post(f"{API}/ai/chat/session", headers=h, json={}, timeout=15)
        assert s.status_code == 200, s.text
        session_id = s.json().get("session_id") or s.json().get("id")
        assert session_id, f"no session id: {s.json()}"

        c = requests.post(
            f"{API}/ai/chat",
            headers=h,
            json={"session_id": session_id, "message": "hi"},
            timeout=60,
        )
        assert c.status_code == 200, c.text
        assert c.json().get("reply") or c.json().get("message"), c.json()

        hist = requests.get(f"{API}/ai/chat/{session_id}", headers=h, timeout=15)
        assert hist.status_code == 200, hist.text
        body = hist.json()
        msgs = body.get("messages") or body.get("items") or body
        assert isinstance(msgs, list) and len(msgs) >= 2, f"messages too few: {body}"


# ---------------- 8. TTS voice mapping ----------------
class TestTTS:
    @pytest.mark.parametrize("language,expected_voice", [
        ("Arabic", "shimmer"),
        ("Hindi", "coral"),
        ("Japanese", "nova"),
        ("Konkani", "coral"),
    ])
    def test_voice_picked_per_language(self, language, expected_voice):
        device_id = _new_device_id()
        token = _guest_signup(device_id)["session_token"]
        r = requests.post(
            f"{API}/tts",
            headers=_auth_headers(token),
            json={"text": "hello", "language": language},
            timeout=60,
        )
        assert r.status_code == 200, f"{language} tts failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("voice") == expected_voice, (
            f"{language}: expected {expected_voice}, got {body.get('voice')}"
        )


# ---------------- 9. Logout invalidates session ----------------
class TestLogout:
    def test_logout_invalidates_session(self):
        device_id = _new_device_id()
        token = _guest_signup(device_id)["session_token"]
        h = _auth_headers(token)
        r = requests.post(f"{API}/auth/logout", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/auth/me", headers=h, timeout=15)
        assert me.status_code == 401, f"expected 401 after logout, got {me.status_code}"


# ---------------- 10. Google auth invalid token → 401 ----------------
class TestGoogleAuth:
    def test_invalid_id_token_returns_401(self):
        r = requests.post(
            f"{API}/auth/google",
            json={"id_token": "this.is.not.a.real.jwt"},
            timeout=15,
        )
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
