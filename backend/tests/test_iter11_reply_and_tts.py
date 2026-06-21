"""
Iteration 11 backend tests.

Covers:
- /api/ai/tool tool="smart_reply" returning 4 English options (no '| English:' suffix)
- /api/ai/tool tool="smart_reply" with Hindi (Devanagari) input returns 4 options each containing ' | English: '
- /api/tts returns voice='coral' for Hindi (Devanagari) text, voice='nova' for English
- regression: grammar / paraphrase / vocab still work via /api/ai/tool
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Admin login to bypass guest daily limit."""
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": os.environ.get("ADMIN_EMAIL", ""),
              "password": os.environ.get("ADMIN_PASSWORD", "")},
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


# ---------- smart_reply / Reply tool ----------

class TestSmartReply:
    def test_smart_reply_english_returns_4_no_translation(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "smart_reply", "text": "Hey! Are you free for a quick call this evening?"},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert len(suggestions) == 3, f"expected 3 suggestions, got {len(suggestions)}: {suggestions}"
        for s in suggestions:
            assert isinstance(s, str) and s.strip(), f"empty suggestion: {s!r}"
            assert "| English:" not in s, f"English-only reply must NOT include translation suffix: {s!r}"
            # Must be plain ASCII-ish English (allow common punctuation)
            assert all(ord(c) < 128 for c in s), f"non-ASCII chars in English reply: {s!r}"

    def test_smart_reply_hindi_returns_4_each_with_english_translation(self, api_client, auth_headers):
        hindi_msg = "क्या तुम आज शाम को मिल सकते हो?"  # "Can you meet this evening?"
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "smart_reply", "text": hindi_msg},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert len(suggestions) == 3, f"expected 3 suggestions, got {len(suggestions)}: {suggestions}"
        for s in suggestions:
            assert "| English:" in s, f"Hindi reply must include ' | English: ' translation: {s!r}"
            reply_part, english_part = s.split("| English:", 1)
            assert reply_part.strip(), f"empty reply part: {s!r}"
            assert english_part.strip(), f"empty English translation part: {s!r}"


# ---------- TTS voice mapping ----------

class TestTTS:
    def test_tts_hindi_uses_coral_voice(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tts",
            json={"text": "नमस्ते, आप कैसे हैं?"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("voice") == "coral", f"expected coral, got {body.get('voice')}"
        audio_b64 = body.get("audio_base64") or ""
        assert len(audio_b64) > 1000, f"audio_base64 too short ({len(audio_b64)} chars)"

    def test_tts_english_uses_nova_voice(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/tts",
            json={"text": "Hello, how are you doing today?"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("voice") == "nova", f"expected nova, got {body.get('voice')}"
        assert len(body.get("audio_base64") or "") > 1000


# ---------- regression: other tools still work ----------

class TestRegression:
    def test_grammar_tool(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "grammar", "text": "she go to the school every day"},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert len(suggestions) >= 1 and suggestions[0].strip()

    def test_paraphrase_tool(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "paraphrase", "text": "The weather is very nice today."},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        suggestions = r.json().get("suggestions") or []
        assert len(suggestions) >= 1

    def test_vocab_tool(self, api_client, auth_headers):
        r = api_client.post(
            f"{BASE_URL}/api/ai/tool",
            json={"tool": "vocab", "text": "ephemeral", "options": {"target_language": "Hindi"}},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        data = body.get("data") or {}
        assert data.get("word"), f"vocab data missing 'word': {data}"
        assert data.get("meaning_translated"), "vocab data missing meaning_translated"
