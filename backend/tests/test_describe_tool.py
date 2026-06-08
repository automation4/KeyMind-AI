"""KeyMind 'Describe' tool (id: vocab) — enhanced schema + script validation.

Per iter5 review request:
 - data must contain: word, part_of_speech, meaning_simple, tricky_words[],
   meaning_translated, synonyms[], antonyms[], spoken_usage,
   spoken_usage_translated, native_alternative, native_alternative_why,
   memory_tip, tenses{past,present,future}.{english,translated}
 - meaning_translated AND spoken_usage_translated AND every tense.translated
   must be in target_language native script (Telugu/Tamil/Hindi tested).
"""
import pytest
import requests

BASE_URL = None
with open("/app/frontend/.env") as f:
    for ln in f:
        if ln.startswith("EXPO_PUBLIC_BACKEND_URL"):
            BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")
            break
API = f"{BASE_URL}/api"

# Unicode script ranges
DEVANAGARI = (0x0900, 0x097F)   # Hindi/Sanskrit/Marathi
TELUGU = (0x0C00, 0x0C7F)
TAMIL = (0x0B80, 0x0BFF)

REQUIRED_KEYS = [
    "word", "part_of_speech", "meaning_simple", "tricky_words",
    "meaning_translated", "synonyms", "antonyms",
    "spoken_usage", "spoken_usage_translated",
    "native_alternative", "native_alternative_why",
    "memory_tip", "tenses",
]


def _has_script(s: str, rng) -> bool:
    if not s:
        return False
    return any(rng[0] <= ord(ch) <= rng[1] for ch in s)


def _not_devanagari(s: str) -> bool:
    """True if `s` contains NO Devanagari letters (i.e. no Hindi leakage)."""
    return not _has_script(s, DEVANAGARI)


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


def _validate_full_shape(data: dict):
    assert isinstance(data, dict), f"data not dict: {data}"
    for k in REQUIRED_KEYS:
        assert k in data, f"Missing key '{k}'. Got keys: {list(data.keys())}"

    # Types
    assert isinstance(data["tricky_words"], list), "tricky_words must be list"
    assert isinstance(data["synonyms"], list), "synonyms must be list"
    assert isinstance(data["antonyms"], list), "antonyms must be list"
    for s in data["synonyms"]:
        assert isinstance(s, str) and s.strip(), f"synonym not str: {s!r}"
    for a in data["antonyms"]:
        assert isinstance(a, str) and a.strip(), f"antonym not str: {a!r}"

    # Non-empty strings (required fields)
    for k in ("word", "part_of_speech", "meaning_simple", "meaning_translated",
              "spoken_usage", "spoken_usage_translated",
              "native_alternative", "native_alternative_why", "memory_tip"):
        v = data[k]
        assert isinstance(v, str) and v.strip(), f"{k} empty or not string: {v!r}"

    # Tenses shape
    t = data["tenses"]
    assert isinstance(t, dict)
    for tense in ("past", "present", "future"):
        assert tense in t, f"Missing tense {tense}"
        row = t[tense]
        assert "english" in row and "translated" in row, f"Tense {tense} missing fields: {row}"
        assert row["english"].strip(), f"Tense {tense} english empty"
        assert row["translated"].strip(), f"Tense {tense} translated empty"

    # Synonyms count >=3 per prompt
    assert len(data["synonyms"]) >= 3, f"Expected >=3 synonyms, got {data['synonyms']}"


class TestDescribeSchema:
    """Validate schema + native-script translations for each target_language."""

    def _call(self, session, token, word, lang):
        r = session.post(
            f"{API}/ai/tool",
            json={"tool": "vocab", "text": word, "options": {"target_language": lang}},
            headers=_auth(token),
            timeout=120,
        )
        assert r.status_code == 200, f"{lang} HTTP {r.status_code}: {r.text}"
        body = r.json()
        assert body["tool"] == "vocab"
        assert body["original"] == word
        assert body["data"] is not None, f"{lang} data null. raw suggestions={body['suggestions']}"
        return body["data"]

    def test_describe_hindi_resilient(self, session, guest_token):
        data = self._call(session, guest_token, "resilient", "Hindi")
        _validate_full_shape(data)
        assert _has_script(data["meaning_translated"], DEVANAGARI), \
            f"Hindi meaning_translated not Devanagari: {data['meaning_translated']!r}"
        assert _has_script(data["spoken_usage_translated"], DEVANAGARI), \
            f"Hindi spoken_usage_translated not Devanagari: {data['spoken_usage_translated']!r}"
        for tense in ("past", "present", "future"):
            tr = data["tenses"][tense]["translated"]
            assert _has_script(tr, DEVANAGARI), f"Hindi tense {tense} not Devanagari: {tr!r}"

    def test_describe_telugu_resilient(self, session, guest_token):
        data = self._call(session, guest_token, "resilient", "Telugu")
        _validate_full_shape(data)
        mt = data["meaning_translated"]
        st = data["spoken_usage_translated"]
        assert _has_script(mt, TELUGU), f"Telugu meaning_translated not Telugu script: {mt!r}"
        assert _not_devanagari(mt), f"Telugu meaning_translated leaked Devanagari: {mt!r}"
        assert _has_script(st, TELUGU), f"Telugu spoken_usage_translated not Telugu: {st!r}"
        assert _not_devanagari(st), f"Telugu spoken_usage_translated leaked Devanagari: {st!r}"
        for tense in ("past", "present", "future"):
            tr = data["tenses"][tense]["translated"]
            assert _has_script(tr, TELUGU), f"Telugu tense {tense} not Telugu: {tr!r}"
            assert _not_devanagari(tr), f"Telugu tense {tense} leaked Devanagari: {tr!r}"

    def test_describe_tamil_resilient(self, session, guest_token):
        data = self._call(session, guest_token, "resilient", "Tamil")
        _validate_full_shape(data)
        mt = data["meaning_translated"]
        st = data["spoken_usage_translated"]
        assert _has_script(mt, TAMIL), f"Tamil meaning_translated not Tamil: {mt!r}"
        assert _not_devanagari(mt), f"Tamil meaning_translated leaked Devanagari: {mt!r}"
        assert _has_script(st, TAMIL), f"Tamil spoken_usage_translated not Tamil: {st!r}"
        assert _not_devanagari(st), f"Tamil spoken_usage_translated leaked Devanagari: {st!r}"
        for tense in ("past", "present", "future"):
            tr = data["tenses"][tense]["translated"]
            assert _has_script(tr, TAMIL), f"Tamil tense {tense} not Tamil: {tr!r}"
            assert _not_devanagari(tr), f"Tamil tense {tense} leaked Devanagari: {tr!r}"
