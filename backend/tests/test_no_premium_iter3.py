"""Iteration 3 - verify Premium tier removal, new 10/day limit, reworded 429 message,
admin unlimited, whitelist flow, regression vocab scripts (Telugu/Tamil/Bengali),
and absence of /api/pricing endpoint."""
import os
import re
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

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
NEW_LIMIT = 10


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ============ Free-tier: new 10/day limit + reworded 429 ============
class TestFreeTierTenPerDay:
    def test_guest_can_make_10_calls_then_11th_returns_429(self, session):
        r = session.post(f"{API}/auth/guest", json={})
        assert r.status_code == 200, r.text
        token = r.json()["session_token"]
        h = {"Authorization": f"Bearer {token}"}

        for i in range(NEW_LIMIT):
            resp = session.post(
                f"{API}/ai/tool",
                json={"tool": "grammar", "text": "she go to school"},
                headers=h,
                timeout=90,
            )
            assert resp.status_code == 200, (
                f"call {i+1}/{NEW_LIMIT} failed: {resp.status_code} {resp.text}"
            )

        # /auth/me reflects 10/10
        me = session.get(f"{API}/auth/me", headers=h).json()["user"]
        assert me["tool_uses_today"] == NEW_LIMIT, me
        assert me["tool_uses_limit"] == NEW_LIMIT, me
        assert me["tool_uses_remaining"] == 0, me
        assert me["is_premium"] is False
        assert me["is_admin"] is False

        # 11th must 429 with reworded message
        r11 = session.post(
            f"{API}/ai/tool",
            json={"tool": "grammar", "text": "she go to school"},
            headers=h,
            timeout=60,
        )
        assert r11.status_code == 429, f"Expected 429, got {r11.status_code}: {r11.text}"
        detail = r11.json().get("detail", "")
        assert "Daily limit" in detail or "10/day" in detail, f"Unexpected detail: {detail!r}"
        # Must NOT mention Upgrade or Premium
        low = detail.lower()
        assert "upgrade" not in low, f"Detail contains 'Upgrade': {detail!r}"
        assert "premium" not in low, f"Detail contains 'Premium': {detail!r}"


# ============ Admin login + unlimited ============
@pytest.fixture(scope="module")
def admin_auth(session):
    # Try /auth/admin/login first (request), fall back to /auth/admin
    r = session.post(
        f"{API}/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if r.status_code == 404:
        r = session.post(
            f"{API}/auth/admin",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
    assert r.status_code == 200, r.text
    return r.json()


class TestAdmin:
    def test_admin_login(self, admin_auth):
        assert "session_token" in admin_auth
        u = admin_auth["user"]
        assert u["is_admin"] is True
        assert u["is_premium"] is True
        assert u["email"] == ADMIN_EMAIL

    def test_admin_me_flags(self, session, admin_auth):
        token = admin_auth["session_token"]
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["is_admin"] is True
        assert u["is_premium"] is True
        assert u["tool_uses_limit"] == NEW_LIMIT
        assert u["tool_uses_remaining"] is None  # unlimited

    def test_admin_unlimited_12_calls(self, session, admin_auth):
        h = {"Authorization": f"Bearer {admin_auth['session_token']}"}
        for i in range(12):
            r = session.post(
                f"{API}/ai/tool",
                json={"tool": "grammar", "text": "she go to school"},
                headers=h,
                timeout=90,
            )
            assert r.status_code == 200, f"admin call {i+1}/12 failed: {r.status_code} {r.text}"
        # Confirm /me still shows unlimited
        me = session.get(f"{API}/auth/me", headers=h).json()["user"]
        assert me["tool_uses_remaining"] is None


# ============ Admin whitelist flow ============
class TestAdminWhitelist:
    test_email = f"testuser_{uuid.uuid4().hex[:6]}@example.com"

    def test_add_and_list(self, session, admin_auth):
        h = {"Authorization": f"Bearer {admin_auth['session_token']}"}
        r = session.post(
            f"{API}/admin/whitelist",
            json={"email": self.test_email, "is_premium": True},
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == self.test_email.lower()
        assert body["is_premium"] is True

        # GET list and verify entry present
        r = session.get(f"{API}/admin/whitelist", headers=h)
        assert r.status_code == 200
        items = r.json()["items"]
        match = next((it for it in items if it["email"] == self.test_email.lower()), None)
        assert match is not None, f"Whitelist entry not found among {items}"
        assert match["is_premium"] is True

    def test_cleanup(self, session, admin_auth):
        h = {"Authorization": f"Bearer {admin_auth['session_token']}"}
        r = session.delete(f"{API}/admin/whitelist/{self.test_email}", headers=h)
        assert r.status_code == 200


# ============ Regression: vocab in Indian scripts ============
def _has_script(text: str, lo: int, hi: int) -> bool:
    return any(lo <= ord(ch) <= hi for ch in text)


class TestVocabScripts:
    @pytest.fixture(scope="class")
    def guest_token(self, session):
        # Fresh guest so we have 10 calls available for 3 vocab tests
        r = session.post(f"{API}/auth/guest", json={})
        assert r.status_code == 200
        return r.json()["session_token"]

    @pytest.mark.parametrize(
        "lang,lo,hi",
        [
            ("Telugu", 0x0C00, 0x0C7F),
            ("Tamil", 0x0B80, 0x0BFF),
            ("Bengali", 0x0980, 0x09FF),
        ],
    )
    def test_vocab_script(self, session, guest_token, lang, lo, hi):
        h = {"Authorization": f"Bearer {guest_token}"}
        r = session.post(
            f"{API}/ai/tool",
            json={"tool": "vocab", "text": "ephemeral", "options": {"target_language": lang}},
            headers=h,
            timeout=120,
        )
        assert r.status_code == 200, f"{lang} vocab call failed: {r.status_code} {r.text}"
        body = r.json()
        data = body.get("data") or body
        translated = (
            data.get("meaning_translated")
            or data.get("translated")
            or ""
        )
        assert translated, f"{lang}: no meaning_translated in response: {body}"
        assert _has_script(translated, lo, hi), (
            f"{lang}: expected script U+{lo:04X}-U+{hi:04X} in {translated!r}; "
            f"full response: {body}"
        )


# ============ /api/pricing should NOT exist ============
class TestNoPricingEndpoint:
    def test_pricing_endpoint_absent(self, session):
        r = session.get(f"{API}/pricing")
        # FastAPI returns 404 for undefined routes
        assert r.status_code == 404, (
            f"/api/pricing should be absent but returned {r.status_code}: {r.text[:200]}"
        )
