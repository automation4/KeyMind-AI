"""
Iteration 10 backend tests — email register/login, guest device persistence,
admin email/password login through normal form, /auth/me + /api/ai/tool with session.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://multilingual-text-2.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "himthegreat@gmail.com"
ADMIN_PASSWORD = "aa$fufm2q"
EXISTING_USER_EMAIL = "testuser@keymind.app"
EXISTING_USER_PASSWORD = "testpass123"


# ---------- Email register ----------
class TestRegister:
    def test_register_success(self):
        email = f"test_iter10_{uuid.uuid4().hex[:8]}@keymind.app"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Iter10 User", "email": email, "password": "testpass123"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_token" in data and data["session_token"]
        assert data["user"]["email"] == email
        assert data["user"]["is_admin"] is False
        assert data["user"].get("is_guest") in (False, None)

        # session token works
        me = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {data['session_token']}"})
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email

    def test_register_duplicate_email(self):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Dup", "email": EXISTING_USER_EMAIL, "password": "testpass123"})
        assert r.status_code == 400

    def test_register_short_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Short", "email": f"short_{uuid.uuid4().hex[:6]}@x.com", "password": "abc"})
        assert r.status_code == 400
        assert "8" in r.json().get("detail", "")

    def test_register_admin_email_blocked(self):
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Hax", "email": ADMIN_EMAIL, "password": "testpass123"})
        assert r.status_code == 400


# ---------- Email login ----------
class TestLogin:
    def test_login_success(self):
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

    def test_admin_login_via_email_form(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["session_token"]
        assert data["user"]["is_admin"] is True
        assert data["user"]["is_premium"] is True


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
        email = f"sess_{uuid.uuid4().hex[:8]}@keymind.app"
        r = requests.post(f"{BASE_URL}/api/auth/register",
                          json={"name": "Sess", "email": email, "password": "testpass123"})
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
        # Tool must work (200) for a fresh user (within free quota)
        assert r.status_code == 200, r.text
        data = r.json()
        # The endpoint should return some result text (key name varies)
        assert any(k in data for k in ("result", "output", "text", "corrected", "response", "suggestions", "data"))
