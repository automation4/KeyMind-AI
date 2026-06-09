"""
Iteration 7 — KeyMind tools regression
  • Synonyms/Antonyms format: `word | short definition`
  • Grammar tool now JSON-shaped: suggestions=[corrected] + data={explanation, examples}
  • Idioms still produce ≥ 5 natural sentences
  • vocab (slim) regression: no synonyms/antonyms/tenses/idioms
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set in frontend/.env"

TOOL_URL = f"{BASE_URL}/api/ai/tool"
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 60


def _post(payload):
    r = requests.post(TOOL_URL, json=payload, headers=HEADERS, timeout=TIMEOUT)
    return r


# ---------- Synonyms / Antonyms ----------
def test_B1_synonyms_word_pipe_definition():
    r = _post({"tool": "synonyms", "text": "resilient"})
    assert r.status_code == 200, r.text
    body = r.json()
    sugg = body.get("suggestions") or []
    assert isinstance(sugg, list)
    assert len(sugg) >= 5, f"expected >=5 synonyms got {len(sugg)}: {sugg}"
    for s in sugg:
        assert " | " in s, f"line missing pipe: {s!r}"
        word, defn = [p.strip() for p in s.split(" | ", 1)]
        # word part: single token (allow hyphen)
        assert re.fullmatch(r"[A-Za-z][A-Za-z\-']*", word), f"word part not a single token: {word!r}"
        assert defn, "definition empty"
        assert len(defn.split()) <= 12, f"definition too long ({len(defn.split())} words): {defn!r}"


def test_B2_antonyms_word_pipe_definition():
    r = _post({"tool": "antonyms", "text": "resilient"})
    assert r.status_code == 200, r.text
    sugg = r.json().get("suggestions") or []
    assert len(sugg) >= 5, f"expected >=5 antonyms got {len(sugg)}: {sugg}"
    for s in sugg:
        assert " | " in s, f"line missing pipe: {s!r}"
        word, defn = [p.strip() for p in s.split(" | ", 1)]
        assert re.fullmatch(r"[A-Za-z][A-Za-z\-']*", word), f"word part not single token: {word!r}"
        assert len(defn.split()) <= 12


def test_B3_antonyms_proper_noun_returns_no_common_or_empty():
    r = _post({"tool": "antonyms", "text": "Mumbai"})
    assert r.status_code == 200, r.text
    sugg = r.json().get("suggestions") or []
    if len(sugg) == 0:
        return
    joined = " ".join(sugg).lower()
    assert "no common antonyms" in joined, (
        f"Expected empty list OR literal 'no common antonyms'; got: {sugg}"
    )


# ---------- Idioms ----------
def test_B4_idioms_full_sentences_containing_phrase():
    r = _post({"tool": "idioms", "text": "piece of cake"})
    assert r.status_code == 200, r.text
    sugg = r.json().get("suggestions") or []
    assert len(sugg) >= 5, f"expected >=5 idiom sentences got {len(sugg)}: {sugg}"
    for s in sugg:
        assert "piece of cake" in s.lower(), f"line missing phrase: {s!r}"
        # natural sentence — has a space and reasonable length
        assert len(s.split()) >= 3, f"too short to be a sentence: {s!r}"


# ---------- Grammar ----------
def test_B5_grammar_incorrect_json_shape():
    r = _post({"tool": "grammar", "text": "She dont knows the answer."})
    assert r.status_code == 200, r.text
    body = r.json()
    sugg = body.get("suggestions") or []
    data = body.get("data") or {}
    assert len(sugg) == 1, f"expected exactly 1 suggestion got {len(sugg)}: {sugg}"
    corrected = sugg[0].lower()
    # Should fix dont→doesn't and remove the -s on 'knows'
    assert ("doesn't" in corrected) or ("does not" in corrected), (
        f"corrected should use doesn't/does not: {sugg[0]!r}"
    )
    assert "know" in corrected and "knows" not in corrected, (
        f"verb form not normalized: {sugg[0]!r}"
    )
    assert isinstance(data, dict), f"data missing: {body}"
    assert data.get("explanation"), f"explanation empty: {data}"
    examples = data.get("examples") or []
    assert isinstance(examples, list)
    assert len(examples) == 3, f"expected 3 examples got {len(examples)}: {examples}"
    for ex in examples:
        assert isinstance(ex, str) and ex.strip()


def test_B6_grammar_already_correct_json_shape():
    r = _post({"tool": "grammar", "text": "I went to the store yesterday."})
    assert r.status_code == 200, r.text
    body = r.json()
    sugg = body.get("suggestions") or []
    data = body.get("data") or {}
    assert len(sugg) == 1
    # Should be ≈ same sentence
    out = sugg[0].strip().lower().rstrip(".")
    assert "went to the store yesterday" in out, f"expected verbatim, got: {sugg[0]!r}"
    assert data.get("explanation"), f"explanation empty: {data}"
    examples = data.get("examples") or []
    assert len(examples) == 3, examples


# ---------- Regression: slim vocab ----------
def test_B7_vocab_slim_payload_no_deep_keys():
    r = _post({
        "tool": "vocab",
        "text": "resilient",
        "options": {"target_language": "Hindi"},
    })
    assert r.status_code == 200, r.text
    body = r.json()
    data = body.get("data") or {}
    assert data.get("meaning_simple"), f"meaning_simple missing: {data}"
    assert data.get("meaning_translated"), f"meaning_translated missing: {data}"
    # transliteration MAY be present for Hindi (Hinglish)
    assert "meaning_transliterated" in data
    # Slim vocab must NOT carry the deep keys
    for forbidden in ("synonyms", "antonyms", "tenses", "idioms_phrases"):
        assert forbidden not in data, (
            f"slim vocab leaked key {forbidden!r}: {data}"
        )
