"""KeyMind 'Describe' tool — iter6 transliteration enhancement.

Per iter6 review request:
- Non-Latin target_language → meaning_transliterated, spoken_usage_transliterated and
  tenses.<x>.transliterated must be NON-EMPTY and contain ONLY Latin characters
  (a-z A-Z + basic punctuation/spaces) — phonetic Hinglish/Tenglish/Tanglish/Romaji/Pinyin.
- Native-script translation fields must remain in their native scripts.
- Latin target_language (English / Spanish / French / German) → all transliterated
  fields MUST be empty strings.
"""
import re
import pytest
import requests

BASE_URL = None
with open("/app/frontend/.env") as f:
    for ln in f:
        if ln.startswith("EXPO_PUBLIC_BACKEND_URL"):
            BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")
            break
API = f"{BASE_URL}/api"

# Latin = ASCII letters + spaces + common punctuation we expect in phonetic text
LATIN_RE = re.compile(r"^[A-Za-z0-9 .,!?'\-’\"()/:;]+$")

DEVANAGARI = (0x0900, 0x097F)
TELUGU = (0x0C00, 0x0C7F)
TAMIL = (0x0B80, 0x0BFF)


def _has_script(s: str, rng) -> bool:
    return bool(s) and any(rng[0] <= ord(ch) <= rng[1] for ch in s)


def _is_latin_only(s: str) -> bool:
    if not s:
        return False
    return bool(LATIN_RE.match(s))


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def guest_token(session):
    r = session.post(f"{API}/auth/guest", json={})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _call_vocab(session, token, word, lang):
    r = session.post(
        f"{API}/ai/tool",
        json={"tool": "vocab", "text": word, "options": {"target_language": lang}},
        headers=_auth(token),
        timeout=120,
    )
    assert r.status_code == 200, f"{lang} HTTP {r.status_code}: {r.text}"
    body = r.json()
    assert body["data"] is not None, f"{lang} data null. raw={body.get('suggestions')}"
    return body["data"]


def _assert_translit_keys_present(data):
    """Every transliterated key must EXIST in the payload (even if empty)."""
    assert "meaning_transliterated" in data, f"missing meaning_transliterated. keys={list(data.keys())}"
    assert "spoken_usage_transliterated" in data, f"missing spoken_usage_transliterated. keys={list(data.keys())}"
    tenses = data.get("tenses") or {}
    for t in ("past", "present", "future"):
        assert t in tenses, f"missing tense {t}"
        assert "transliterated" in tenses[t], f"missing tenses.{t}.transliterated. keys={list(tenses[t].keys())}"


# ============== Non-Latin languages — must have populated transliterations ==============

class TestNonLatinTransliterations:
    def test_hindi_hinglish(self, session, guest_token):
        data = _call_vocab(session, guest_token, "replicate", "Hindi")
        _assert_translit_keys_present(data)
        # Native script preserved
        assert _has_script(data["meaning_translated"], DEVANAGARI), \
            f"meaning_translated lost Devanagari: {data['meaning_translated']!r}"
        # Transliterations populated AND only Latin chars
        mt_tl = data["meaning_transliterated"]
        st_tl = data["spoken_usage_transliterated"]
        assert mt_tl.strip(), f"Hindi meaning_transliterated empty: {mt_tl!r}"
        assert _is_latin_only(mt_tl), f"Hindi meaning_transliterated has non-Latin chars: {mt_tl!r}"
        assert st_tl.strip(), f"Hindi spoken_usage_transliterated empty: {st_tl!r}"
        assert _is_latin_only(st_tl), f"Hindi spoken_usage_transliterated has non-Latin chars: {st_tl!r}"
        for t in ("past", "present", "future"):
            tl = data["tenses"][t]["transliterated"]
            assert tl.strip(), f"Hindi tense {t} transliterated empty: {tl!r}"
            assert _is_latin_only(tl), f"Hindi tense {t} transliterated has non-Latin: {tl!r}"

    def test_telugu_tenglish(self, session, guest_token):
        data = _call_vocab(session, guest_token, "replicate", "Telugu")
        _assert_translit_keys_present(data)
        assert _has_script(data["meaning_translated"], TELUGU), \
            f"Telugu meaning_translated not Telugu: {data['meaning_translated']!r}"
        assert not _has_script(data["meaning_translated"], DEVANAGARI), \
            f"Telugu meaning leaked Devanagari: {data['meaning_translated']!r}"
        mt_tl = data["meaning_transliterated"]
        assert mt_tl.strip() and _is_latin_only(mt_tl), \
            f"Telugu meaning_transliterated bad: {mt_tl!r}"
        for t in ("past", "present", "future"):
            tl = data["tenses"][t]["transliterated"]
            assert tl.strip() and _is_latin_only(tl), \
                f"Telugu tense {t} transliterated bad: {tl!r}"

    def test_tamil_tanglish(self, session, guest_token):
        data = _call_vocab(session, guest_token, "replicate", "Tamil")
        _assert_translit_keys_present(data)
        assert _has_script(data["meaning_translated"], TAMIL), \
            f"Tamil meaning_translated not Tamil: {data['meaning_translated']!r}"
        mt_tl = data["meaning_transliterated"]
        assert mt_tl.strip() and _is_latin_only(mt_tl), \
            f"Tamil meaning_transliterated bad: {mt_tl!r}"
        for t in ("past", "present", "future"):
            tl = data["tenses"][t]["transliterated"]
            assert tl.strip() and _is_latin_only(tl), \
                f"Tamil tense {t} transliterated bad: {tl!r}"


# ============== Latin languages — transliterations MUST be empty strings ==============

class TestLatinLanguagesEmpty:
    def test_english_empty(self, session, guest_token):
        data = _call_vocab(session, guest_token, "replicate", "English")
        _assert_translit_keys_present(data)
        assert data["meaning_transliterated"] == "", \
            f"English meaning_transliterated should be empty, got: {data['meaning_transliterated']!r}"
        assert data["spoken_usage_transliterated"] == "", \
            f"English spoken_usage_transliterated should be empty: {data['spoken_usage_transliterated']!r}"
        for t in ("past", "present", "future"):
            assert data["tenses"][t]["transliterated"] == "", \
                f"English tense {t} transliterated not empty: {data['tenses'][t]['transliterated']!r}"

    def test_spanish_empty(self, session, guest_token):
        data = _call_vocab(session, guest_token, "replicate", "Spanish")
        _assert_translit_keys_present(data)
        assert data["meaning_transliterated"] == "", \
            f"Spanish meaning_transliterated should be empty: {data['meaning_transliterated']!r}"
        assert data["spoken_usage_transliterated"] == "", \
            f"Spanish spoken_usage_transliterated should be empty: {data['spoken_usage_transliterated']!r}"
        for t in ("past", "present", "future"):
            assert data["tenses"][t]["transliterated"] == "", \
                f"Spanish tense {t} transliterated not empty: {data['tenses'][t]['transliterated']!r}"
