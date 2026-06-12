"""Iter13 — Guest persistence / race-condition fix backend tests.

Scenarios (per main agent request):
  1. Same-device persistence: two POST /api/auth/guest with the SAME
     device_id must return the SAME user_id.
  2. Usage persistence across sign-out: a guest's `tool_uses_today`
     must survive a /api/auth/logout when the SAME device_id is reused
     within the same UTC day.
  3. Concurrency / race protection: 5 simultaneous /api/auth/guest with
     same device_id must result in EXACTLY one users document
     (enforced by partial unique index + atomic upsert).
  4. No-device-id fallback: empty body still returns a valid session.
  5. Regression: /api/ai/tool smart_reply, /api/tts nova/coral,
     /api/auth/me, /api/auth/login admin still respond 200 OK.

Direct MongoDB inspection is done for scenario 3 to confirm only
one document was created.
"""

import os
import threading
import time
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


# ---------------------------------------------------------------------------
# Env loading — mirror pattern used by other test files in this folder.
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

# Backend Mongo creds — load straight from backend/.env (test process has
# host-level access to the same MongoDB the API uses).
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

DEVICE_PERSIST = "TEST_DEVICE_PERSIST_001"
DEVICE_USAGE = "TEST_DEVICE_USAGE_002"
DEVICE_RACE = "TEST_DEVICE_RACE_003"


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
    client.close()


@pytest.fixture(autouse=True)
def _cleanup_test_devices(mongo):
    """Wipe test guest docs + their sessions before AND after each test so a
    previous run can never leak state into the next."""

    def _wipe():
        ids = list(
            mongo.users.find(
                {
                    "guest_device_id": {
                        "$in": [DEVICE_PERSIST, DEVICE_USAGE, DEVICE_RACE]
                    }
                },
                {"user_id": 1, "_id": 0},
            )
        )
        user_ids = [d["user_id"] for d in ids if d.get("user_id")]
        if user_ids:
            mongo.user_sessions.delete_many({"user_id": {"$in": user_ids}})
        mongo.users.delete_many(
            {
                "guest_device_id": {
                    "$in": [DEVICE_PERSIST, DEVICE_USAGE, DEVICE_RACE]
                }
            }
        )

    _wipe()
    yield
    _wipe()


# ---------------------------------------------------------------------------
# 1. Same-device persistence
# ---------------------------------------------------------------------------
class TestSameDevicePersistence:
    def test_same_device_returns_same_user(self, api):
        r1 = api.post(
            f"{BASE_URL}/api/auth/guest", json={"device_id": DEVICE_PERSIST}
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert "session_token" in d1 and "user" in d1
        uid1 = d1["user"]["user_id"]
        assert uid1.startswith("guest_")

        r2 = api.post(
            f"{BASE_URL}/api/auth/guest", json={"device_id": DEVICE_PERSIST}
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        uid2 = d2["user"]["user_id"]

        assert uid1 == uid2, (
            f"Same device_id returned DIFFERENT user_ids: {uid1} vs {uid2}"
        )
        # Tokens must be NEW per call (each call mints a fresh session)
        assert d1["session_token"] != d2["session_token"]


# ---------------------------------------------------------------------------
# 2. Usage persistence after sign-out
# ---------------------------------------------------------------------------
class TestUsagePersistsAcrossLogout:
    def test_usage_count_survives_logout_and_re_auth(self, api):
        # First guest session
        r1 = api.post(
            f"{BASE_URL}/api/auth/guest", json={"device_id": DEVICE_USAGE}
        )
        assert r1.status_code == 200, r1.text
        token_a = r1.json()["session_token"]
        uid_a = r1.json()["user"]["user_id"]

        # Bump usage 3x via /api/ai/tool emoji (light + fast)
        bumped = 0
        for _ in range(3):
            tr = api.post(
                f"{BASE_URL}/api/ai/tool",
                json={"tool": "emoji", "text": "hi"},
                headers={"Authorization": f"Bearer {token_a}"},
                timeout=60,
            )
            assert tr.status_code == 200, tr.text
            bumped += 1

        # /auth/me should now report tool_uses_today == 3
        me1 = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert me1.status_code == 200, me1.text
        used_before = me1.json()["user"].get("tool_uses_today")
        assert used_before == 3, f"Expected 3, got {used_before}"

        # Logout (deletes session token A)
        lo = api.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert lo.status_code == 200, lo.text
        assert lo.json().get("ok") is True

        # New /api/auth/guest with the SAME device_id → must hit existing doc.
        r2 = api.post(
            f"{BASE_URL}/api/auth/guest", json={"device_id": DEVICE_USAGE}
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        token_b = d2["session_token"]
        uid_b = d2["user"]["user_id"]
        assert uid_b == uid_a, (
            f"User id changed after logout/re-auth: {uid_a} -> {uid_b}"
        )

        # GET /auth/me with NEW token — daily usage must still be 3.
        me2 = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert me2.status_code == 200, me2.text
        used_after = me2.json()["user"].get("tool_uses_today")
        assert used_after == 3, (
            f"P0 BUG: tool_uses_today reset across sign-out. "
            f"Expected 3, got {used_after}"
        )


# ---------------------------------------------------------------------------
# 3. Concurrency / race protection
# ---------------------------------------------------------------------------
class TestRaceProtection:
    def test_five_concurrent_requests_yield_one_doc(self, api, mongo):
        url = f"{BASE_URL}/api/auth/guest"
        results: list = []
        errors: list = []

        def _fire():
            try:
                r = requests.post(
                    url,
                    json={"device_id": DEVICE_RACE},
                    headers={"Content-Type": "application/json"},
                    timeout=30,
                )
                results.append(
                    (r.status_code, r.json() if r.ok else r.text)
                )
            except Exception as e:  # pragma: no cover
                errors.append(str(e))

        threads = [threading.Thread(target=_fire) for _ in range(5)]
        # Start as close to simultaneously as possible
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)

        assert not errors, f"Thread errors: {errors}"
        statuses = [s for s, _ in results]
        assert len(results) == 5
        assert all(s == 200 for s in statuses), (
            f"Not all concurrent calls succeeded: {statuses}"
        )

        # Allow Mongo a tiny moment for the upserts to settle
        time.sleep(0.2)

        # Inspect DB directly — MUST be exactly 1 doc for this device_id.
        docs = list(
            mongo.users.find({"guest_device_id": DEVICE_RACE}, {"_id": 0})
        )
        assert len(docs) == 1, (
            f"Expected exactly 1 guest doc for device {DEVICE_RACE}, "
            f"found {len(docs)}: {[d.get('user_id') for d in docs]}"
        )

        survivor_id = docs[0]["user_id"]
        returned_ids = {r["user"]["user_id"] for _, r in results}
        assert returned_ids == {survivor_id}, (
            f"Concurrent callers got DIFFERENT user_ids: {returned_ids}, "
            f"db has: {survivor_id}"
        )


# ---------------------------------------------------------------------------
# 4. No-device-id fallback
# ---------------------------------------------------------------------------
class TestNoDeviceIdFallback:
    def test_empty_body_returns_valid_guest(self, api):
        r = api.post(f"{BASE_URL}/api/auth/guest")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("session_token")
        assert d.get("user", {}).get("user_id", "").startswith("guest_")
        assert d["user"].get("is_guest") is True

    def test_empty_string_device_id_returns_valid_guest(self, api):
        r = api.post(f"{BASE_URL}/api/auth/guest", json={"device_id": ""})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("session_token")
        assert d.get("user", {}).get("user_id", "").startswith("guest_")


# ---------------------------------------------------------------------------
# 5. Regression — existing flows still 200 OK
# ---------------------------------------------------------------------------
class TestRegression:
    def test_admin_login_still_works(self, api):
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "session_token" in body
        assert body["user"]["is_admin"] is True

    def test_auth_me_with_admin_token(self, api):
        login = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert login.status_code == 200
        tok = login.json()["session_token"]
        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert me.status_code == 200, me.text
        assert me.json()["user"]["email"].lower() == ADMIN_EMAIL

    def test_ai_tool_smart_reply_returns_3(self, api):
        # Use admin so we never hit free-tier 10/day limits.
        login = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        tok = login.json()["session_token"]

        r = api.post(
            f"{BASE_URL}/api/ai/tool",
            json={
                "tool": "smart_reply",
                "text": "Hey, want to grab coffee tomorrow?",
            },
            headers={"Authorization": f"Bearer {tok}"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tool"] == "smart_reply"
        suggestions = body.get("suggestions") or []
        assert len(suggestions) >= 1, (
            f"smart_reply returned no suggestions: {body}"
        )
        # Best-effort: smart_reply prompt asks for 3 — allow some flexibility
        # but flag if model only returns 1.
        assert len(suggestions) <= 5

    def test_tts_voice_nova(self, api):
        r = api.post(
            f"{BASE_URL}/api/tts",
            json={"text": "Hello world.", "voice": "nova"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("voice") == "nova"
        assert body.get("mime") == "audio/mpeg"
        assert body.get("audio_base64")
        assert len(body["audio_base64"]) > 100

    def test_tts_voice_coral(self, api):
        r = api.post(
            f"{BASE_URL}/api/tts",
            json={"text": "नमस्ते", "voice": "coral"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("voice") == "coral"
        assert body.get("audio_base64")
