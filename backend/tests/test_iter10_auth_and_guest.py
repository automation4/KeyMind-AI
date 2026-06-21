"""
Auth backend tests (Google-only model) — register endpoint removed,
guest device persistence, admin login via API, /auth/me + /api/ai/tool with session.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://multilingual-text-2.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
EXISTING_USER_EMAIL = "testuser@keymind.app"
EXISTING_USER_PASSWORD = "testpass123"


# ---------- Manual account creation removed ----------
class TestRegisterRemoved:
    def test_register_endpoint_gone(self):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "X", "email": f"x_{uuid.uuid4().hex[:6]}@y.com", "password": "testpass123"})
        assert r.status_code in (404, 405), r.text


# ---------- Email login (API only — legacy/admin accounts) ----------
class TestLogin:
    def test_login_existing_account(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": EXISTING_USER_EMAIL, "password": EXISTING_USER_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["session_token"]
        assert data["user"]["email"] == EXISTING_USER_EMAIL
        assert data["user"]["is_admin"] is False

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": EXISTING_USER_EMAIL, "password": "wrongpass99"})
        assert r.status_code == 401

    def test_login_unknown_email(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": f"noone_{uuid.uuid4().hex[:6]}@x.com", "password": "whatever1"})
        assert r.status_code == 401

    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["session_token"]
        assert data["user"]["is_admin"] is True
        assert data["user"]["is_premium"] is True


# ---------- Google auth endpoint ----------
class TestGoogleAuth:
    def test_invalid_token_rejected(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={"id_token": "not-a-real-token"})
        assert r.status_code == 401
        assert "Invalid" in r.json().get("detail", "")


# ---------- Guest device persistence ----------
class TestGuestDevice:
    def test_guest_same_device_returns_same_user(self):
        device_id = f"TEST_DEV_{uuid.uuid4().hex[:12]}"
        r1 = requests.post(f"{BASE_URL}/api/auth/guest", json={"device_id": device_id})
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{BASE_URL}/api/auth/guest", json={"device_id": device_id})
        assert r2.status_code == 200, r2.text
        u1 = r1.json()["user"]
        u2 = r2.json()["user"]
        assert u1["user_id"] == u2["user_id"], f"Different IDs for same device: {u1['user_id']} vs {u2['user_id']}"
        assert u1.get("is_guest", True) is True
        # tokens should differ (fresh session each call)
        assert r1.json()["session_token"] != r2.json()["session_token"]

    def test_guest_different_devices_different_users(self):
        d1 = f"TEST_DEV_{uuid.uuid4().hex[:12]}"
        d2 = f"TEST_DEV_{uuid.uuid4().hex[:12]}"
        r1 = requests.post(f"{BASE_URL}/api/auth/guest", json={"device_id": d1})
        r2 = requests.post(f"{BASE_URL}/api/auth/guest", json={"device_id": d2})
        assert r1.json()["user"]["user_id"] != r2.json()["user"]["user_id"]

    def test_guest_no_body_backcompat(self):
        r = requests.post(f"{BASE_URL}/api/auth/guest")
        assert r.status_code == 200, r.text
        assert r.json()["user"].get("is_guest", True) is True


# ---------- Session token usable across protected endpoints ----------
class TestSessionUsage:
    @pytest.fixture(scope="class")
    def session_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/guest",
                          json={"device_id": f"TEST_DEV_{uuid.uuid4().hex[:12]}"})
        assert r.status_code == 200
        return r.json()["session_token"]

    def test_me_endpoint(self, session_token):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {session_token}"})
        assert r.status_code == 200
        body = r.json()
        assert "user" in body
        assert "tool_uses_today" in body["user"] or "tool_uses_remaining" in body["user"]

    def test_ai_tool_with_session(self, session_token):
        r = requests.post(
            f"{BASE_URL}/api/ai/tool",
            headers={"Authorization": f"Bearer {session_token}"},
            json={"tool": "grammar", "text": "i has went to store yesterday"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert any(k in data for k in ("result", "output", "text", "corrected", "response", "suggestions", "data"))
