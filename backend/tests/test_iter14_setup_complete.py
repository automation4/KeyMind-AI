"""Iter14 — `setup_completed` per-account flag backend tests.

Scenarios (per main agent request):
  1. NEW: POST /api/auth/setup-complete with admin token returns
     {ok: true, user.setup_completed: true}; subsequent GET /api/auth/me
     also reports user.setup_completed == true.
  2. NEW: /api/auth/me for a fresh guest returns user.setup_completed == false.
  3. NEW: After admin POST /auth/setup-complete, log out and log back in →
     /auth/me still shows setup_completed == true (persists across sessions).
  4. Negative: POST /api/auth/setup-complete WITHOUT a bearer token → 401.

We intentionally do NOT reset the admin's setup_completed flag back to
false after the test — once set, it should stay set for the account.
"""

import os
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


# ---------------------------------------------------------------------------
# Env loading — mirror pattern used by other tests in this folder.
# ---------------------------------------------------------------------------
if not os.environ.get("EXPO_PUBLIC_BACKEND_URL"):
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for ln in env_path.read_text().splitlines():
            if ln.startswith("EXPO_PUBLIC_BACKEND_URL"):
                os.environ["EXPO_PUBLIC_BACKEND_URL"] = (
                    ln.split("=", 1)[1].strip().strip('"')
                )

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

if not os.environ.get("MONGO_URL"):
    be_env = Path("/app/backend/.env")
    if be_env.exists():
        for ln in be_env.read_text().splitlines():
            if ln.startswith("MONGO_URL"):
                os.environ["MONGO_URL"] = ln.split("=", 1)[1].strip().strip('"')
            elif ln.startswith("DB_NAME"):
                os.environ["DB_NAME"] = ln.split("=", 1)[1].strip().strip('"')

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "himthegreat@gmail.com"
ADMIN_PASSWORD = "aa$fufm2q"

DEVICE_FRESH_GUEST = f"TEST_DEVICE_ITER14_FRESH_{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    # Cleanup any stray test guest docs
    db.users.delete_many({"guest_device_id": {"$regex": "^TEST_DEVICE_ITER14_"}})
    client.close()


def _admin_token(api) -> str:
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


# ---------------------------------------------------------------------------
# 1. POST /auth/setup-complete (admin) → flag flips true everywhere.
# ---------------------------------------------------------------------------
class TestSetupCompleteAdmin:
    def test_admin_setup_complete_sets_flag(self, api):
        tok = _admin_token(api)
        r = api.post(
            f"{BASE_URL}/api/auth/setup-complete",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        user = body.get("user") or {}
        assert user.get("setup_completed") is True, (
            f"Expected user.setup_completed=true in response, got: {body}"
        )
        # Sanity: admin identity preserved
        assert (user.get("email") or "").lower() == ADMIN_EMAIL
        assert user.get("is_admin") is True

    def test_auth_me_reflects_setup_completed(self, api):
        tok = _admin_token(api)
        # Ensure flag is set (idempotent — call again should not break)
        api.post(
            f"{BASE_URL}/api/auth/setup-complete",
            headers={"Authorization": f"Bearer {tok}"},
        )
        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert me.status_code == 200, me.text
        u = me.json().get("user") or {}
        assert u.get("setup_completed") is True, (
            f"/auth/me did not show setup_completed=true after POST. body={me.json()}"
        )


# ---------------------------------------------------------------------------
# 2. Fresh guest → setup_completed defaults to false.
# ---------------------------------------------------------------------------
class TestFreshGuestDefaultsFalse:
    def test_fresh_guest_setup_completed_false(self, api, mongo):
        # Use a unique device_id to guarantee a brand-new guest doc.
        mongo.users.delete_many({"guest_device_id": DEVICE_FRESH_GUEST})

        r = api.post(
            f"{BASE_URL}/api/auth/guest",
            json={"device_id": DEVICE_FRESH_GUEST},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        tok = d["session_token"]
        assert d["user"].get("setup_completed") is False, (
            f"Fresh guest should default to setup_completed=false, "
            f"got: {d['user']}"
        )

        # Double-check via /auth/me
        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert me.status_code == 200
        assert me.json()["user"].get("setup_completed") is False

        # cleanup
        mongo.user_sessions.delete_many({"user_id": d["user"]["user_id"]})
        mongo.users.delete_many({"guest_device_id": DEVICE_FRESH_GUEST})


# ---------------------------------------------------------------------------
# 3. Persistence across sessions: setup_completed survives logout + new login.
# ---------------------------------------------------------------------------
class TestSetupCompletedPersistsAcrossSessions:
    def test_flag_survives_logout_and_relogin(self, api):
        # First session — set flag
        tok1 = _admin_token(api)
        r1 = api.post(
            f"{BASE_URL}/api/auth/setup-complete",
            headers={"Authorization": f"Bearer {tok1}"},
        )
        assert r1.status_code == 200
        assert r1.json()["user"]["setup_completed"] is True

        # Logout (invalidates tok1)
        lo = api.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {tok1}"},
        )
        assert lo.status_code == 200
        assert lo.json().get("ok") is True

        # Old token must now be rejected
        me_old = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok1}"},
        )
        assert me_old.status_code == 401, (
            f"Expected 401 after logout, got {me_old.status_code}"
        )

        # New session
        tok2 = _admin_token(api)
        assert tok2 != tok1

        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok2}"},
        )
        assert me.status_code == 200, me.text
        u = me.json()["user"]
        assert u.get("setup_completed") is True, (
            f"P0: setup_completed did not persist across logout/login. "
            f"body={me.json()}"
        )


# ---------------------------------------------------------------------------
# 4. Negative — no auth header → 401.
# ---------------------------------------------------------------------------
class TestSetupCompleteUnauthorized:
    def test_no_token_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/setup-complete")
        assert r.status_code == 401, (
            f"Expected 401 without auth, got {r.status_code}: {r.text}"
        )

    def test_bad_token_returns_401(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/setup-complete",
            headers={"Authorization": "Bearer not-a-real-token-xxxxx"},
        )
        assert r.status_code == 401
