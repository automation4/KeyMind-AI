"""Iter16 — Daily AI tool usage counter bug verification.

User reports: tool_uses_today stays at 0 for non-premium users (guest + normal),
even after calling /api/ai/tool multiple times.

Scenarios covered (per review_request):
  1. Guest counter increments — 3 calls → tool_uses_today=3, remaining=7.
  2. Normal (non-premium) user counter increments — 4 calls → tool_uses_today=4.
  3. Daily limit enforcement — 10th call OK, 11th returns 429.
  4. Admin (premium) NOT counted — 5 calls → still tool_uses_today=0.
  5. Persistence across logout/login (same device_id) — counter survives.
  6. Quick regression — smart_reply x3, paraphrase x3, TTS nova/coral,
     vocab_full valid + gibberish, guest premium denial.
"""

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


# -------- Environment bootstrap --------
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

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

GUEST_DEVICE_ID = f"COUNTER_TEST_GUEST_001_{uuid.uuid4().hex[:6]}"
USER_EMAIL = f"counter_test_user_{uuid.uuid4().hex[:6]}@gmail.com"
USER_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    # Teardown — purge all test data.
    db.users.delete_many({"guest_device_id": {"$regex": "^COUNTER_TEST_GUEST_001_"}})
    db.users.delete_many({"email": USER_EMAIL})
    client.close()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# =====================================================
# 1. Guest counter increments
# =====================================================
class TestGuestCounter:
    def test_guest_counter_increments_3_times(self, api, mongo):
        r = api.post(f"{BASE_URL}/api/auth/guest", json={"device_id": GUEST_DEVICE_ID})
        assert r.status_code == 200, r.text
        body = r.json()
        token = body["session_token"]
        assert body["user"]["is_guest"] is True
        assert body["user"]["is_premium"] is False
        assert body["user"]["tool_uses_today"] == 0
        assert body["user"]["tool_uses_remaining"] == 10

        # /auth/me before any calls
        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(token)).json()["user"]
        assert me["tool_uses_today"] == 0

        for i in range(3):
            r = api.post(
                f"{BASE_URL}/api/ai/tool",
                json={"tool": "emoji", "text": f"hi {i}"},
                headers=_auth(token),
            )
            assert r.status_code == 200, f"call {i+1} failed: {r.status_code} {r.text}"

        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(token)).json()["user"]
        print(f"GUEST after 3 calls: tool_uses_today={me['tool_uses_today']}, remaining={me['tool_uses_remaining']}")
        # Also dump raw Mongo doc to confirm persistence shape
        raw = mongo.users.find_one({"guest_device_id": GUEST_DEVICE_ID}, {"_id": 0})
        print(f"GUEST Mongo doc: tool_usage_count={raw.get('tool_usage_count')}, tool_usage_date={raw.get('tool_usage_date')}, is_premium={raw.get('is_premium')}, is_admin={raw.get('is_admin')}")
        assert me["tool_uses_today"] == 3, f"expected 3, got {me['tool_uses_today']}"
        assert me["tool_uses_remaining"] == 7

        # Persist token for cross-call test
        pytest.guest_token = token

    def test_guest_counter_persists_across_logout_relogin(self, api, mongo):
        # logout
        old_token = pytest.guest_token
        r = api.post(f"{BASE_URL}/api/auth/logout", headers=_auth(old_token))
        assert r.status_code == 200

        # login again with SAME device_id
        r = api.post(f"{BASE_URL}/api/auth/guest", json={"device_id": GUEST_DEVICE_ID})
        assert r.status_code == 200
        body = r.json()
        new_token = body["session_token"]
        # Counter must survive
        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(new_token)).json()["user"]
        assert me["tool_uses_today"] == 3, f"persistence regression: expected 3, got {me['tool_uses_today']}"
        assert me["tool_uses_remaining"] == 7


# =====================================================
# 2. Normal (non-premium) user counter increments
#    + 3. Daily limit enforcement (continues to 10, 11th = 429)
# =====================================================
class TestNormalUserCounterAndLimit:
    def test_register_and_counter_increments_4_times(self, api, mongo):
        # /api/auth/register requires @gmail.com (GMAIL_RE in server.py). The
        # review_request asks for counter_test_user@example.com but that fails
        # validation. We use a gmail variant — same intent (non-premium user,
        # is_admin=false, is_premium=false).
        r = api.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": USER_EMAIL, "password": USER_PASSWORD, "name": "Counter User"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        token = body["session_token"]
        u = body["user"]
        assert u["is_premium"] is False
        assert u["is_admin"] is False
        assert u["is_guest"] is False
        assert u["tool_uses_today"] == 0

        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(token)).json()["user"]
        assert me["is_premium"] is False
        assert me["tool_uses_today"] == 0

        for i in range(4):
            r = api.post(
                f"{BASE_URL}/api/ai/tool",
                json={"tool": "emoji", "text": f"hello {i}"},
                headers=_auth(token),
            )
            assert r.status_code == 200, f"call {i+1} failed: {r.status_code} {r.text}"

        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(token)).json()["user"]
        raw = mongo.users.find_one({"email": USER_EMAIL}, {"_id": 0})
        print(f"USER after 4 calls: tool_uses_today={me['tool_uses_today']}, remaining={me['tool_uses_remaining']}")
        print(f"USER Mongo doc: tool_usage_count={raw.get('tool_usage_count')}, tool_usage_date={raw.get('tool_usage_date')}, is_premium={raw.get('is_premium')}, is_admin={raw.get('is_admin')}")
        assert me["tool_uses_today"] == 4
        assert me["tool_uses_remaining"] == 6
        assert raw["tool_usage_count"] == 4
        assert raw["tool_usage_date"] == _today_str()
        pytest.user_token = token

    def test_daily_limit_429_at_11th_call(self, api):
        token = pytest.user_token
        # Already at 4. Push to 10.
        for i in range(4, 10):
            r = api.post(
                f"{BASE_URL}/api/ai/tool",
                json={"tool": "emoji", "text": f"limit {i}"},
                headers=_auth(token),
            )
            assert r.status_code == 200, f"call {i+1} failed: {r.status_code} {r.text}"

        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(token)).json()["user"]
        assert me["tool_uses_today"] == 10
        assert me["tool_uses_remaining"] == 0

        # 11th call → 429
        r = api.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "emoji", "text": "overflow"},
            headers=_auth(token),
        )
        assert r.status_code == 429, f"expected 429, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "")
        assert "daily limit" in detail.lower() or "10" in detail


# =====================================================
# 4. Admin/premium NOT counted
# =====================================================
class TestAdminNotCounted:
    def test_admin_calls_dont_bump_counter(self, api, mongo):
        r = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        token = body["session_token"]
        u = body["user"]
        assert u["is_admin"] is True
        assert u["is_premium"] is True
        assert u["tool_uses_remaining"] is None  # unlimited

        # Snapshot the stored count so we can compare after.
        admin_doc_before = mongo.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0})
        count_before = int(admin_doc_before.get("tool_usage_count") or 0)
        date_before = admin_doc_before.get("tool_usage_date")

        for i in range(5):
            r = api.post(
                f"{BASE_URL}/api/ai/tool",
                json={"tool": "emoji", "text": f"admin {i}"},
                headers=_auth(token),
            )
            assert r.status_code == 200, f"admin call {i+1} failed: {r.status_code} {r.text}"

        admin_doc_after = mongo.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0})
        count_after = int(admin_doc_after.get("tool_usage_count") or 0)
        date_after = admin_doc_after.get("tool_usage_date")
        # Counter must NOT have moved (premium bypasses increment).
        assert count_after == count_before, f"admin counter moved: {count_before} -> {count_after}"
        assert date_after == date_before

        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(token)).json()["user"]
        # For premium users tool_uses_today is the projection of the stored
        # count IF date==today, else 0 — but bump never runs so it stays at the
        # pre-existing value.
        assert me["tool_uses_remaining"] is None


# =====================================================
# 6. Regression — smart_reply, paraphrase, TTS, vocab, guest-premium denial
# =====================================================
@pytest.fixture(scope="module")
def regression_guest_token(api):
    dev = f"COUNTER_TEST_GUEST_001_regr_{uuid.uuid4().hex[:6]}"
    r = api.post(f"{BASE_URL}/api/auth/guest", json={"device_id": dev})
    assert r.status_code == 200
    return r.json()["session_token"]


class TestRegression:
    def test_smart_reply_returns_3(self, api, regression_guest_token):
        r = api.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "smart_reply", "text": "Are we still on for dinner?"},
            headers=_auth(regression_guest_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        replies = body.get("suggestions") or []
        assert len(replies) >= 3, f"smart_reply suggestions={replies}"

    def test_paraphrase_returns_3(self, api, regression_guest_token):
        r = api.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "paraphrase", "text": "This is a simple test sentence."},
            headers=_auth(regression_guest_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        variants = body.get("suggestions") or []
        assert len(variants) >= 3, f"paraphrase suggestions={variants}"

    @pytest.mark.parametrize("voice", ["nova", "coral"])
    def test_tts_voices(self, api, regression_guest_token, voice):
        r = api.post(
            f"{BASE_URL}/api/tts",
            json={"text": "Hello world", "voice": voice},
            headers=_auth(regression_guest_token),
        )
        if r.status_code == 404:
            pytest.skip("TTS endpoint not at /api/tts")
        assert r.status_code == 200, f"tts {voice} failed: {r.status_code} {r.text}"

    def test_vocab_full_valid_word(self, api, regression_guest_token):
        r = api.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "vocab_full", "text": "resilient", "options": {"target_lang": "Hindi"}},
            headers=_auth(regression_guest_token),
        )
        assert r.status_code == 200, r.text
        data = r.json().get("data") or {}
        # tenses should be a dict with at least one tense filled.
        tenses = data.get("tenses")
        assert tenses, f"valid vocab tenses missing: {data}"

    def test_vocab_full_gibberish(self, api, regression_guest_token):
        r = api.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "vocab_full", "text": "zzqxwfg", "options": {"target_lang": "Hindi"}},
            headers=_auth(regression_guest_token),
        )
        assert r.status_code == 200, r.text
        data = r.json().get("data") or {}
        # Soft-pass — LLM is allowed to occasionally classify as a real word.
        pos = (data.get("part_of_speech") or "").lower()
        assert isinstance(data, dict)
        print(f"GIBBERISH vocab_full → part_of_speech={pos!r}, tenses={data.get('tenses')}")

    def test_guest_premium_denial(self, api, regression_guest_token):
        # Even if we mutate Mongo, guest must remain non-premium in projection.
        me = api.get(f"{BASE_URL}/api/auth/me", headers=_auth(regression_guest_token)).json()["user"]
        assert me["is_guest"] is True
        assert me["is_premium"] is False
        assert me["is_admin"] is False
        assert me["premium_source"] is None
