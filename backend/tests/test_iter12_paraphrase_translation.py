"""
Iteration 12 backend tests — Paraphrase tool now includes English translation suffix
for non-English paraphrases (same scheme as smart_reply).

- /api/ai/tool tool="paraphrase" English text → 3 suggestions, NONE containing '| English:'
- /api/ai/tool tool="paraphrase" Hindi text → 3 suggestions, EACH containing ' | English: <translation>'
- Quick regression on smart_reply count (3, not 4).
"""
import os
import pytest
import requests

# Load EXPO_PUBLIC_BACKEND_URL from frontend/.env if not exported
if not os.environ.get("EXPO_PUBLIC_BACKEND_URL"):
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as fh:
            for ln in fh:
                if ln.startswith("EXPO_PUBLIC_BACKEND_URL"):
                    os.environ["EXPO_PUBLIC_BACKEND_URL"] = ln.split("=", 1)[1].strip().strip('"')

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": os.environ.get("ADMIN_EMAIL", "himthegreat@gmail.com"),
            "password": os.environ.get("ADMIN_PASSWORD", "aa$fufm2q"),
        },
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("token")
    assert token, f"no token in response: {body}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"}


# ---------- paraphrase: English (no suffix) ----------

class TestParaphraseEnglish:
    def test_paraphrase_english_returns_3_no_translation_suffix(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "paraphrase", "text": "The weather is very nice today and I am happy."},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert len(suggestions) == 3, f"expected 3 paraphrases, got {len(suggestions)}: {suggestions}"
        for s in suggestions:
            assert isinstance(s, str) and s.strip(), f"empty paraphrase: {s!r}"
            assert "| English:" not in s, (
                f"English-only paraphrase must NOT include translation suffix: {s!r}"
            )
            # Must be plain ASCII-ish English (allow common punctuation)
            assert all(ord(c) < 128 for c in s), f"non-ASCII chars in English paraphrase: {s!r}"


# ---------- paraphrase: Hindi (suffix required) ----------

class TestParaphraseHindi:
    def test_paraphrase_hindi_returns_3_each_with_english_translation(self, api_client, auth_headers):
        hindi_msg = "आज मौसम बहुत अच्छा है और मैं खुश हूँ।"
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "paraphrase", "text": hindi_msg},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert len(suggestions) == 3, f"expected 3 paraphrases, got {len(suggestions)}: {suggestions}"
        for s in suggestions:
            assert "| English:" in s, (
                f"Hindi paraphrase must include ' | English: ' translation: {s!r}"
            )
            para_part, english_part = s.split("| English:", 1)
            assert para_part.strip(), f"empty paraphrase part: {s!r}"
            assert english_part.strip(), f"empty English translation part: {s!r}"


# ---------- regression: smart_reply count must be exactly 3 ----------

class TestSmartReplyCountRegression:
    def test_smart_reply_english_returns_exactly_3(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "smart_reply", "text": "Hey are you free for a quick call this evening?"},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        suggestions = r.json().get("suggestions") or []
        assert len(suggestions) == 3, f"expected exactly 3 smart_reply suggestions, got {len(suggestions)}: {suggestions}"
        for s in suggestions:
            assert "| English:" not in s, f"English reply must NOT include translation suffix: {s!r}"
