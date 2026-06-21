"""KeyMind Vocab AI tool enhancement tests.

Verifies:
1. Vocab returns structured JSON in `data` with shape: word, part_of_speech,
   meaning_simple, tricky_words, meaning_translated, tenses{past,present,future}{english,translated}.
2. Sanskrit, Hindi, Tamil translations use native script.
3. Other AI tools (grammar, smart_reply, translate) still work (no regression).
4. Free-tier 5/day limit enforces 429 on 6th call for fresh guest user.
5. Admin user is NOT limit-enforced.
"""
import os
import uuid
import pytest
import requests

BASE_URL = None
with open("/app/frontend/.env") as f:
    for ln in f:
        if ln.startswith("EXPO_PUBLIC_BACKEND_URL"):
            BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

# Unicode script ranges
DEVANAGARI = ("\u0900", "\u097F")  # Hindi & Sanskrit
TAMIL = ("\u0B80", "\u0BFF")


def _has_script(s: str, rng) -> bool:
    return any(rng[0] <= ch <= rng[1] for ch in s)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(f"{API}/auth/admin", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture
def fresh_guest(session):
    """Each test that needs an un-metered fresh guest can use this."""
    r = session.post(f"{API}/auth/guest", json={})
    assert r.status_code == 200
    return r.json()["session_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# =========================================================
# Vocab tool — structured JSON shape
# =========================================================
class TestVocabSchema:
    """Strict schema validation on vocab tool."""

    def _validate_vocab_shape(self, data: dict, target_lang: str):
        assert isinstance(data, dict), f"data should be dict, got {type(data)}: {data}"
        for key in ("word", "part_of_speech", "meaning_simple", "tricky_words",
                    "meaning_translated", "tenses"):
            assert key in data, f"Missing key '{key}' for {target_lang}. data={data}"
        assert isinstance(data["tricky_words"], list)
        assert isinstance(data["tenses"], dict)
        for tense in ("past", "present", "future"):
            assert tense in data["tenses"], f"Missing tense '{tense}'"
            assert "english" in data["tenses"][tense]
            assert "translated" in data["tenses"][tense]
            assert len(data["tenses"][tense]["english"]) > 0
            assert len(data["tenses"][tense]["translated"]) > 0
        assert len(data["meaning_simple"]) > 0
        assert len(data["meaning_translated"]) > 0

    def test_vocab_hindi_shape(self, session, fresh_guest):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "vocab", "text": "ephemeral",
                               "options": {"target_language": "Hindi"}},
                         headers=_auth(fresh_guest), timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tool"] == "vocab"
        assert body["original"] == "ephemeral"
        assert isinstance(body["suggestions"], list) and len(body["suggestions"]) >= 1
        assert body["data"] is not None, f"data is None — JSON parse failed. raw={body['suggestions']}"
        self._validate_vocab_shape(body["data"], "Hindi")
        # Hindi meaning + tenses in Devanagari
        assert _has_script(body["data"]["meaning_translated"], DEVANAGARI), \
            f"Hindi meaning_translated not Devanagari: {body['data']['meaning_translated']}"
        for t in ("past", "present", "future"):
            assert _has_script(body["data"]["tenses"][t]["translated"], DEVANAGARI), \
                f"Hindi tense '{t}' not Devanagari: {body['data']['tenses'][t]['translated']}"

    def test_vocab_sanskrit_shape(self, session, fresh_guest):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "vocab", "text": "serendipity",
                               "options": {"target_language": "Sanskrit"}},
                         headers=_auth(fresh_guest), timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data"] is not None, f"Sanskrit vocab data is None. raw={body['suggestions']}"
        self._validate_vocab_shape(body["data"], "Sanskrit")
        # Sanskrit uses Devanagari script too
        assert _has_script(body["data"]["meaning_translated"], DEVANAGARI), \
            f"Sanskrit meaning_translated not Devanagari: {body['data']['meaning_translated']}"
        for t in ("past", "present", "future"):
            translated = body["data"]["tenses"][t]["translated"]
            assert _has_script(translated, DEVANAGARI), \
                f"Sanskrit tense '{t}' not Devanagari: {translated}"

    def test_vocab_tamil_shape(self, session, fresh_guest):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "vocab", "text": "benevolent",
                               "options": {"target_language": "Tamil"}},
                         headers=_auth(fresh_guest), timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data"] is not None, f"Tamil vocab data is None. raw={body['suggestions']}"
        self._validate_vocab_shape(body["data"], "Tamil")
        assert _has_script(body["data"]["meaning_translated"], TAMIL), \
            f"Tamil meaning_translated not Tamil script: {body['data']['meaning_translated']}"
        for t in ("past", "present", "future"):
            translated = body["data"]["tenses"][t]["translated"]
            assert _has_script(translated, TAMIL), f"Tamil tense '{t}' not Tamil script: {translated}"


# =========================================================
# Regression — other tools must still work
# =========================================================
class TestOtherTools:
    def test_grammar_no_data_field(self, session, fresh_guest):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "grammar", "text": "he go to school every day"},
                         headers=_auth(fresh_guest), timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data"] is None, f"Non-vocab data should be None, got: {body['data']}"
        assert len(body["suggestions"]) >= 1
        out = body["suggestions"][0].lower()
        assert "goes" in out or "going" in out, f"Grammar correction not found: {out}"

    def test_smart_reply_multiple_items(self, session, fresh_guest):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "smart_reply", "text": "Are you free for dinner tonight?"},
                         headers=_auth(fresh_guest), timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data"] is None
        assert len(body["suggestions"]) >= 2, f"smart_reply should have multiple items: {body['suggestions']}"

    def test_translate_sanskrit(self, session, fresh_guest):
        r = session.post(f"{API}/ai/tool",
                         json={"tool": "translate", "text": "Hello",
                               "options": {"target_language": "Sanskrit"}},
                         headers=_auth(fresh_guest), timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data"] is None
        out = body["suggestions"][0]
        # Sanskrit uses Devanagari
        assert _has_script(out, DEVANAGARI), f"Translate→Sanskrit not Devanagari: {out}"


# =========================================================
# Free-tier rate limit + admin bypass
# =========================================================
class TestLimits:
    def test_free_user_429_on_6th(self, session):
        # Fresh guest, 5 uses + 6th should be 429
        gr = session.post(f"{API}/auth/guest", json={})
        assert gr.status_code == 200
        token = gr.json()["session_token"]
        headers = _auth(token)

        # Use cheap tool (synonyms) for speed
        for i in range(5):
            r = session.post(f"{API}/ai/tool",
                             json={"tool": "synonyms", "text": f"happy{i}"},
                             headers=headers, timeout=60)
            assert r.status_code == 200, f"Call {i+1} failed: {r.status_code} {r.text}"

        # 6th call should be 429
        r6 = session.post(f"{API}/ai/tool",
                          json={"tool": "synonyms", "text": "limit"},
                          headers=headers, timeout=30)
        assert r6.status_code == 429, f"Expected 429 on 6th call, got {r6.status_code}: {r6.text}"
        detail = r6.json().get("detail", "").lower()
        assert "limit" in detail or "5/day" in detail or "premium" in detail, \
            f"Limit detail unclear: {detail}"

    def test_admin_unlimited(self, session, admin_token):
        # Run 6 calls as admin — none should be limited
        headers = _auth(admin_token)
        for i in range(6):
            r = session.post(f"{API}/ai/tool",
                             json={"tool": "synonyms", "text": f"admintest{i}"},
                             headers=headers, timeout=60)
            assert r.status_code == 200, f"Admin call {i+1} failed: {r.status_code} {r.text}"
