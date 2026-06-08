"""
Iteration 7 — Validate the "Transfer Describe to Chat + slim Describe Write tab" refactor.

Backend assertions:
  B1. tool=vocab → SLIM payload (only 5 keys), Hindi -> Devanagari, transliteration in Latin.
  B2. tool=vocab,  target_language=English  → translated == simple, transliterated == "".
  B3. tool=vocab_full, Hindi -> rich payload, idioms_phrases non-empty (target 3), correct scripts.
  B4. tool=vocab_full, Telugu -> idioms_phrases.translated in Telugu script, transliterated Latin.
  B5. tool=vocab_full, English -> every translated == english, every transliterated == "".
"""
import os
import re
import requests
import pytest
from pathlib import Path

# Load frontend/.env so EXPO_PUBLIC_BACKEND_URL is available for the public-URL test.
_env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
TOOL_URL = f"{BASE_URL}/ai/tool"
TIMEOUT = 90  # Gemini 3 Flash + retry can be slow


# --- Helpers -----------------------------------------------------------------
def _post(payload):
    r = requests.post(TOOL_URL, json=payload, timeout=TIMEOUT)
    return r


def _is_devanagari(s: str) -> bool:
    if not s:
        return False
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return False
    dev = sum(1 for c in letters if 0x0900 <= ord(c) <= 0x097F)
    return dev / len(letters) >= 0.6


def _is_telugu(s: str) -> bool:
    if not s:
        return False
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return False
    tel = sum(1 for c in letters if 0x0C00 <= ord(c) <= 0x0C7F)
    return tel / len(letters) >= 0.6


def _is_latin_only(s: str) -> bool:
    """Allow a-z/A-Z, digits, spaces, basic punctuation. No non-Latin letters."""
    if s is None:
        return False
    if s == "":
        return True
    for c in s:
        if c.isalpha():
            cp = ord(c)
            in_latin = (
                (0x0041 <= cp <= 0x005A)
                or (0x0061 <= cp <= 0x007A)
                or (0x00C0 <= cp <= 0x024F)
            )
            if not in_latin:
                return False
    return True


SLIM_ALLOWED = {
    "word",
    "part_of_speech",
    "meaning_simple",
    "meaning_translated",
    "meaning_transliterated",
}

RICH_KEYS = {
    "synonyms",
    "antonyms",
    "tenses",
    "idioms_phrases",
    "native_alternative",
    "memory_tip",
    "spoken_usage",
}


# --- B1. SLIM vocab payload (Hindi) ------------------------------------------
def test_b1_vocab_slim_hindi():
    resp = _post({
        "tool": "vocab",
        "text": "resilient",
        "options": {"target_language": "Hindi"},
    })
    assert resp.status_code == 200, resp.text
    body = resp.json()
    data = body.get("data")
    assert isinstance(data, dict), f"data missing/invalid: {body}"

    keys = set(data.keys())
    extra = keys - SLIM_ALLOWED
    assert not extra, f"SLIM vocab leaked keys: {extra}"

    forbidden = keys & RICH_KEYS
    assert not forbidden, f"SLIM vocab has forbidden rich keys: {forbidden}"

    # Required fields present
    for k in ("word", "meaning_simple", "meaning_translated", "meaning_transliterated"):
        assert k in data, f"missing key {k}"

    assert _is_devanagari(data["meaning_translated"]), (
        f"meaning_translated not Devanagari: {data['meaning_translated']!r}"
    )
    assert _is_latin_only(data["meaning_transliterated"]), (
        f"meaning_transliterated has non-Latin chars: {data['meaning_transliterated']!r}"
    )
    assert data["meaning_transliterated"].strip() != "", "Hinglish transliteration empty for Hindi"


# --- B2. SLIM vocab payload (English) ----------------------------------------
def test_b2_vocab_slim_english():
    resp = _post({
        "tool": "vocab",
        "text": "resilient",
        "options": {"target_language": "English"},
    })
    assert resp.status_code == 200, resp.text
    data = resp.json().get("data") or {}
    assert data.get("meaning_translated", "").strip() == data.get("meaning_simple", "").strip(), (
        f"For English target: translated should equal simple. "
        f"simple={data.get('meaning_simple')!r} translated={data.get('meaning_translated')!r}"
    )
    assert data.get("meaning_transliterated", "") == "", (
        f"meaning_transliterated must be empty for English; got {data.get('meaning_transliterated')!r}"
    )


# --- B3. vocab_full (Hindi) -- rich payload + idioms_phrases -----------------
def test_b3_vocab_full_hindi():
    resp = _post({
        "tool": "vocab_full",
        "text": "indifference",
        "options": {"target_language": "Hindi"},
    })
    assert resp.status_code == 200, resp.text
    data = resp.json().get("data") or {}

    for k in ("synonyms", "antonyms", "native_alternative", "native_alternative_why",
              "memory_tip", "tenses", "idioms_phrases"):
        assert k in data, f"vocab_full missing rich key: {k}"

    assert isinstance(data["synonyms"], list) and len(data["synonyms"]) >= 3, (
        f"synonyms should have ≥3 entries; got {data['synonyms']!r}"
    )
    assert isinstance(data["antonyms"], list)

    tenses = data["tenses"]
    for t in ("past", "present", "future"):
        row = tenses.get(t) or {}
        assert row.get("english"), f"tenses.{t}.english missing"
        assert row.get("translated"), f"tenses.{t}.translated missing"
        assert _is_devanagari(row["translated"]), (
            f"tenses.{t}.translated not Devanagari: {row['translated']!r}"
        )
        assert _is_latin_only(row.get("transliterated", "")), (
            f"tenses.{t}.transliterated has non-Latin chars: {row.get('transliterated')!r}"
        )

    idioms = data["idioms_phrases"]
    assert isinstance(idioms, list) and len(idioms) >= 1, f"idioms_phrases empty: {idioms!r}"
    # Target is 3 — warn but don't fail when ≥1
    if len(idioms) < 3:
        print(f"WARN: idioms_phrases has {len(idioms)} entries (target 3)")
    for i, item in enumerate(idioms):
        assert isinstance(item.get("english"), str) and item["english"].strip(), (
            f"idiom[{i}].english empty/missing"
        )
        assert _is_devanagari(item.get("translated", "")), (
            f"idiom[{i}].translated not Devanagari: {item.get('translated')!r}"
        )
        assert _is_latin_only(item.get("transliterated", "")), (
            f"idiom[{i}].transliterated has non-Latin chars: {item.get('transliterated')!r}"
        )


# --- B4. vocab_full Telugu — idioms in Telugu script ------------------------
def test_b4_vocab_full_telugu_idioms_script():
    resp = _post({
        "tool": "vocab_full",
        "text": "replicate",
        "options": {"target_language": "Telugu"},
    })
    assert resp.status_code == 200, resp.text
    data = resp.json().get("data") or {}
    idioms = data.get("idioms_phrases") or []
    assert idioms, "idioms_phrases empty for Telugu"

    # No Devanagari leakage on any field
    bad = []
    for i, item in enumerate(idioms):
        tr = item.get("translated", "") or ""
        if _is_devanagari(tr):
            bad.append((i, "translated", tr))
        if not _is_telugu(tr):
            bad.append((i, "translated-not-telugu", tr))
        tl = item.get("transliterated", "") or ""
        if not _is_latin_only(tl):
            bad.append((i, "transliterated-not-latin", tl))
    assert not bad, f"Telugu idiom script issues: {bad}"

    # Top-level meaning_translated should also be Telugu, not Devanagari
    mt = data.get("meaning_translated", "")
    assert not _is_devanagari(mt), f"meaning_translated leaked Devanagari: {mt!r}"
    assert _is_telugu(mt), f"meaning_translated not Telugu: {mt!r}"


# --- B5. vocab_full English — every translated == english, transliterated == "" --
def test_b5_vocab_full_english_mirror():
    resp = _post({
        "tool": "vocab_full",
        "text": "replicate",
        "options": {"target_language": "English"},
    })
    assert resp.status_code == 200, resp.text
    data = resp.json().get("data") or {}

    # Top-level
    assert data.get("meaning_translated", "").strip() == data.get("meaning_simple", "").strip(), (
        "English: meaning_translated must equal meaning_simple"
    )
    assert data.get("meaning_transliterated", "") == "", (
        f"English: meaning_transliterated must be empty; got {data.get('meaning_transliterated')!r}"
    )

    # spoken_usage mirror
    if data.get("spoken_usage"):
        assert (data.get("spoken_usage_translated") or "").strip() == data["spoken_usage"].strip(), (
            "English: spoken_usage_translated must equal spoken_usage"
        )
        assert data.get("spoken_usage_transliterated", "") == "", (
            "English: spoken_usage_transliterated must be empty"
        )

    # Tenses
    for t in ("past", "present", "future"):
        row = (data.get("tenses") or {}).get(t) or {}
        if row.get("english"):
            assert (row.get("translated") or "").strip() == row["english"].strip(), (
                f"English: tenses.{t}.translated must equal english"
            )
            assert row.get("transliterated", "") == "", (
                f"English: tenses.{t}.transliterated must be empty"
            )

    # Idioms
    for i, item in enumerate(data.get("idioms_phrases") or []):
        if item.get("english"):
            assert (item.get("translated") or "").strip() == item["english"].strip(), (
                f"English: idiom[{i}].translated must equal english"
            )
            assert item.get("transliterated", "") == "", (
                f"English: idiom[{i}].transliterated must be empty"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
