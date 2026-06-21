"""Iter15 — backend tests.

Scenarios:
  1. Guest is NEVER premium/admin — even if Mongo doc is mutated.
  2. Admin login regression — is_premium/is_admin/premium_source='admin'.
  3. vocab_full gibberish — part_of_speech='other', tenses=null, idioms=[].
  4. vocab_full valid word — tenses populated (regression).
"""

import os
import uuid
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


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

GUEST_DEVICE_ID = f"GUEST_NEVER_PREMIUM_001_{uuid.uuid4().hex[:6]}"


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
    # Cleanup test guest docs
    db.users.delete_many({"guest_device_id": {"$regex": "^GUEST_NEVER_PREMIUM_001_"}})
    client.close()


def _admin_token(api) -> str:
    r = api.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


# ---------------------------------------------------------------------------
# 1. Guest is NEVER premium or admin
# ---------------------------------------------------------------------------
class TestGuestNeverPremium:
    def test_fresh_guest_not_premium_not_admin(self, api, mongo):
        mongo.users.delete_many({"guest_device_id": GUEST_DEVICE_ID})

        r = api.post(
            f"{BASE_URL}/api/auth/guest",
            json={"device_id": GUEST_DEVICE_ID},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        tok = data["session_token"]
        user = data["user"]
        user_id = user["user_id"]

        assert user["is_guest"] is True
        assert user["is_premium"] is False
        assert user["is_admin"] is False
        assert user["premium_source"] is None
        assert user["subscription_plan"] is None

        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert me.status_code == 200
        mu = me.json()["user"]
        assert mu["is_premium"] is False
        assert mu["is_admin"] is False
        assert mu["premium_source"] is None
        assert mu["subscription_plan"] is None

    def test_guest_manual_mongo_override_still_not_premium(self, api, mongo):
        # Re-use same device_id → same guest doc.
        r = api.post(
            f"{BASE_URL}/api/auth/guest",
            json={"device_id": GUEST_DEVICE_ID},
        )
        assert r.status_code == 200
        tok = r.json()["session_token"]
        user_id = r.json()["user"]["user_id"]

        # Mutate the doc directly to attempt privilege escalation.
        res = mongo.users.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "is_premium": True,
                    "is_admin": True,
                    "subscription_plan": "monthly",
                }
            },
        )
        assert res.matched_count == 1, "Could not find guest doc to mutate"

        # Sanity: confirm the mutation actually landed in Mongo.
        raw = mongo.users.find_one({"user_id": user_id})
        assert raw.get("is_premium") is True
        assert raw.get("is_admin") is True
        assert raw.get("subscription_plan") == "monthly"

        # Now /auth/me must STILL deny premium/admin — projection enforces it.
        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert me.status_code == 200, me.text
        mu = me.json()["user"]
        assert mu["is_guest"] is True
        assert mu["is_premium"] is False, (
            f"Guest must NEVER be premium even with mongo override. body={me.json()}"
        )
        assert mu["is_admin"] is False, (
            f"Guest must NEVER be admin even with mongo override. body={me.json()}"
        )
        assert mu["premium_source"] is None, (
            f"premium_source must be null for guests. body={me.json()}"
        )
        assert mu["subscription_plan"] is None, (
            f"subscription_plan must be null for guests. body={me.json()}"
        )


# ---------------------------------------------------------------------------
# 2. Admin regression
# ---------------------------------------------------------------------------
class TestAdminRegression:
    def test_admin_login_premium_and_source(self, api):
        tok = _admin_token(api)
        me = api.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert me.status_code == 200, me.text
        u = me.json()["user"]
        assert u.get("is_admin") is True
        assert u.get("is_premium") is True
        assert u.get("premium_source") == "admin"
        assert (u.get("email") or "").lower() == ADMIN_EMAIL


# ---------------------------------------------------------------------------
# 3 & 4. vocab_full
# ---------------------------------------------------------------------------
class TestVocabFullInvalidAndValid:
    def _call_vocab(self, api, tok, text):
        r = api.post(
            f"{BASE_URL}/api/ai/tool",
            headers={"Authorization": f"Bearer {tok}"},
            json={
                "tool": "vocab_full",
                "text": text,
                "target_language": "Hindi",
            },
            timeout=90,
        )
        return r

    def test_gibberish_returns_not_recognized(self, api):
        tok = _admin_token(api)
        r = self._call_vocab(api, tok, "zzqxwfg")
        assert r.status_code == 200, r.text
        body = r.json()
        # response shape: { ok: true, data: {...} } OR direct dict
        data = body.get("data") if isinstance(body, dict) and "data" in body else body
        assert isinstance(data, dict), f"Unexpected response: {body}"

        pos = (data.get("part_of_speech") or "").lower()
        tenses = data.get("tenses")
        idioms = data.get("idioms_phrases")
        native_alt = data.get("native_alternative")
        meaning = (data.get("meaning_simple") or "").lower()

        soft_fails = []
        if pos != "other":
            soft_fails.append(f"part_of_speech expected 'other', got {pos!r}")
        if tenses not in (None, {}, ""):
            soft_fails.append(f"tenses expected null, got {tenses!r}")
        if idioms not in (None, [], ""):
            soft_fails.append(f"idioms_phrases expected empty list, got {idioms!r}")
        if native_alt not in (None, ""):
            soft_fails.append(f"native_alternative expected empty, got {native_alt!r}")
        if not ("not" in meaning or "recognized" in meaning or "recognised" in meaning):
            soft_fails.append(f"meaning_simple should mention 'not/recognized', got {meaning!r}")

        if soft_fails:
            # Per main-agent note: soft-fail if LLM didn't honor prompt.
            pytest.fail(
                "LLM did not honor gibberish rule (soft fail — prompt regression):\n"
                + "\n".join(soft_fails)
                + f"\nFull data: {data}"
            )

    def test_valid_word_has_tenses(self, api):
        tok = _admin_token(api)
        r = self._call_vocab(api, tok, "resilient")
        assert r.status_code == 200, r.text
        body = r.json()
        data = body.get("data") if isinstance(body, dict) and "data" in body else body
        assert isinstance(data, dict), f"Unexpected response: {body}"

        tenses = data.get("tenses")
        # Valid word should produce tenses object with past/present/future
        assert tenses is not None and isinstance(tenses, dict), (
            f"Expected tenses dict for 'resilient', got {tenses!r}. Full data: {data}"
        )
        for key in ("past", "present", "future"):
            assert key in tenses, f"Missing tense '{key}' in {tenses}"
            entry = tenses[key]
            # entry is typically {english: "...", native: "..."} or similar
            if isinstance(entry, dict):
                eng = (entry.get("english") or "").strip()
                assert eng, f"tense '{key}' english is empty: {entry}"
            else:
                # If it's a plain string, still must be non-empty
                assert str(entry).strip(), f"tense '{key}' empty"
