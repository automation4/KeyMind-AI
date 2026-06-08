"""Tests for new features: admin auth, free-tier limits, admin whitelist endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("EXPO_PUBLIC_BACKEND_URL"):
                BASE_URL = ln.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "himthegreat@gmail.com"
ADMIN_PASSWORD = "auto"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_auth(session):
    r = session.post(f"{API}/auth/admin", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


# ============ Admin Login ============
class TestAdminLogin:
    def test_admin_login_success(self, admin_auth):
        assert "session_token" in admin_auth
        u = admin_auth["user"]
        assert u["is_admin"] is True
        assert u["is_premium"] is True
        assert u["email"] == ADMIN_EMAIL

    def test_admin_login_wrong_password(self, session):
        r = session.post(f"{API}/auth/admin", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_admin_login_wrong_email(self, session):
        r = session.post(f"{API}/auth/admin",
                         json={"email": "nobody@example.com", "password": ADMIN_PASSWORD})
        assert r.status_code == 401

    def test_me_admin_has_flags(self, session, admin_auth):
        token = admin_auth["session_token"]
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["is_admin"] is True
        assert u["is_premium"] is True
        assert u["tool_uses_limit"] == 5
        # premium => remaining is None
        assert u["tool_uses_remaining"] is None
        assert "tool_uses_today" in u


# ============ Free-tier limit ============
class TestFreeTierLimit:
    def test_5_tool_uses_then_429(self, session):
        # Fresh guest each run, so counter is 0
        r = session.post(f"{API}/auth/guest", json={})
        assert r.status_code == 200
        token = r.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        for i in range(5):
            resp = session.post(
                f"{API}/ai/tool",
                json={"tool": "synonyms", "text": f"happy"},
                headers=headers,
                timeout=60,
            )
            assert resp.status_code == 200, f"call {i + 1} failed: {resp.status_code} {resp.text}"

        # /me should reflect remaining=0
        me = session.get(f"{API}/auth/me", headers=headers).json()["user"]
        assert me["tool_uses_today"] == 5
        assert me["tool_uses_remaining"] == 0

        # 6th call → 429
        r6 = session.post(
            f"{API}/ai/tool",
            json={"tool": "synonyms", "text": "happy"},
            headers=headers,
            timeout=60,
        )
        assert r6.status_code == 429, f"Expected 429, got {r6.status_code}: {r6.text}"
        assert "Daily free limit reached" in r6.json().get("detail", "")

    def test_admin_not_limited(self, session, admin_auth):
        token = admin_auth["session_token"]
        headers = {"Authorization": f"Bearer {token}"}
        # admin should be able to call repeatedly w/o increment counter
        for _ in range(2):
            resp = session.post(
                f"{API}/ai/tool",
                json={"tool": "synonyms", "text": "fast"},
                headers=headers,
                timeout=60,
            )
            assert resp.status_code == 200, resp.text
        me = session.get(f"{API}/auth/me", headers=headers).json()["user"]
        # admin counter should still report tool_uses_today as 0 (premium bypass)
        # (counter is not incremented because is_admin/is_premium)
        assert me["tool_uses_remaining"] is None


# ============ Admin Whitelist CRUD ============
class TestAdminWhitelist:
    test_email = f"test_{uuid.uuid4().hex[:6]}@example.com"

    def test_add_requires_admin(self, session):
        r = session.post(f"{API}/admin/whitelist",
                         json={"email": self.test_email, "is_premium": True})
        assert r.status_code in (401, 403), r.text

    def test_list_requires_admin(self, session):
        r = session.get(f"{API}/admin/whitelist")
        assert r.status_code in (401, 403)

    def test_delete_requires_admin(self, session):
        r = session.delete(f"{API}/admin/whitelist/{self.test_email}")
        assert r.status_code in (401, 403)

    def test_admin_full_flow(self, session, admin_auth):
        h = {"Authorization": f"Bearer {admin_auth['session_token']}"}

        # Add
        r = session.post(f"{API}/admin/whitelist",
                         json={"email": self.test_email, "is_premium": True}, headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == self.test_email
        assert body["is_premium"] is True

        # List contains it
        r = session.get(f"{API}/admin/whitelist", headers=h)
        assert r.status_code == 200
        items = r.json()["items"]
        emails = [it["email"] for it in items]
        assert self.test_email in emails

        # Toggle
        r = session.put(f"{API}/admin/whitelist",
                        json={"email": self.test_email, "is_premium": False}, headers=h)
        assert r.status_code == 200
        assert r.json()["is_premium"] is False

        # Delete
        r = session.delete(f"{API}/admin/whitelist/{self.test_email}", headers=h)
        assert r.status_code == 200
        assert r.json()["deleted"] == 1

        # Confirm gone
        r = session.get(f"{API}/admin/whitelist", headers=h)
        emails2 = [it["email"] for it in r.json()["items"]]
        assert self.test_email not in emails2

    def test_cannot_whitelist_admin_email(self, session, admin_auth):
        h = {"Authorization": f"Bearer {admin_auth['session_token']}"}
        r = session.post(f"{API}/admin/whitelist",
                         json={"email": ADMIN_EMAIL, "is_premium": True}, headers=h)
        assert r.status_code == 400

    def test_toggle_nonexistent(self, session, admin_auth):
        h = {"Authorization": f"Bearer {admin_auth['session_token']}"}
        r = session.put(f"{API}/admin/whitelist",
                        json={"email": "nonexistent_xyz@example.com", "is_premium": True}, headers=h)
        assert r.status_code == 404
