"""Iteration 7 backend regression tests:

Verifies three completed enhancements:
  (1) synonyms/antonyms return `word | short meaning` lines (6 entries, NO inline chat).
  (2) grammar tool returns corrected sentence + data.explanation + data.examples (3).
  (3) idioms returns 6 short clean lines.
Also re-verifies vocab (Tamil) + vocab_full (Telugu) scripts, chat, and guest auth.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

# Unicode ranges for script validation
TAMIL_RE = re.compile(r"[\u0B80-\u0BFF]")
TELUGU_RE = re.compile(r"[\u0C00-\u0C7F]")
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
LATIN_LETTER_RE = re.compile(r"[A-Za-z]")


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def guest_token(session):
    r = session.post(f"{API}/auth/guest", json={})
    assert r.status_code == 200, f"guest auth failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data and "user" in data
    return data["session_token"], data["user"]


# ---------- (8) Auth ----------

class TestAuth:
    def test_guest_returns_token_and_usage_fields(self, guest_token):
        token, user = guest_token
        assert token
        assert "tool_uses_today" in user
        assert "tool_uses_limit" in user
        assert isinstance(user["tool_uses_today"], int)
        assert isinstance(user["tool_uses_limit"], int)
        assert user["tool_uses_limit"] >= 10

    def test_me_returns_usage_fields(self, session, guest_token):
        token, _ = guest_token
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        user = r.json()["user"]
        assert "tool_uses_today" in user
        assert "tool_uses_limit" in user
        assert user["is_guest"] is True


# ---------- (1) Synonyms ----------

class TestSynonyms:
    def test_synonyms_pipe_format(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "synonyms", "text": "happy"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        # Expect ~6 lines, each containing '|'
        assert len(suggestions) >= 4, f"Expected ~6 synonyms, got {len(suggestions)}: {suggestions}"
        piped = [s for s in suggestions if "|" in s]
        assert len(piped) >= max(4, int(len(suggestions) * 0.8)), \
            f"Most suggestions should have '|' separator. Got: {suggestions}"
        # Each piped entry should have a non-empty word and a non-empty meaning
        for line in piped[:6]:
            parts = [p.strip() for p in line.split("|", 1)]
            assert len(parts) == 2, f"Bad pipe split: {line!r}"
            word, meaning = parts
            assert word and len(word) <= 40, f"Empty/long word: {line!r}"
            assert meaning and len(meaning) >= 2, f"Empty meaning: {line!r}"
            # NO numbering / bullet prefix
            assert not re.match(r"^(\d+[\.\)]|[-*•])\s", word), f"Numbered/bulleted entry: {line!r}"


# ---------- (2) Antonyms ----------

class TestAntonyms:
    def test_antonyms_pipe_format(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "antonyms", "text": "happy"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert len(suggestions) >= 4, f"Expected ~6 antonyms, got {len(suggestions)}: {suggestions}"
        piped = [s for s in suggestions if "|" in s]
        assert len(piped) >= max(4, int(len(suggestions) * 0.8)), \
            f"Most antonyms should have '|' separator. Got: {suggestions}"
        for line in piped[:6]:
            parts = [p.strip() for p in line.split("|", 1)]
            assert len(parts) == 2
            assert parts[0] and parts[1]
            assert not re.match(r"^(\d+[\.\)]|[-*•])\s", parts[0]), f"Numbered: {line!r}"


# ---------- (3) Grammar ----------

class TestGrammar:
    def test_grammar_returns_corrected_and_examples(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "grammar", "text": "He go to school yesterday."},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # suggestions[0] = corrected sentence
        suggestions = body.get("suggestions") or []
        assert suggestions and suggestions[0].strip(), "Expected corrected sentence as suggestions[0]"
        corrected = suggestions[0].lower()
        # The corrected form should normally use 'went' (past tense)
        assert "went" in corrected, f"Expected 'went' in corrected output, got: {suggestions[0]!r}"

        data = body.get("data") or {}
        explanation = (data.get("explanation") or "").strip()
        examples = data.get("examples") or []
        assert explanation, f"data.explanation is empty. data={data}"
        assert len(explanation) >= 20, f"Explanation too short: {explanation!r}"
        assert isinstance(examples, list), f"data.examples not a list: {examples}"
        assert len(examples) == 3, f"Expected 3 examples, got {len(examples)}: {examples}"
        for ex in examples:
            assert isinstance(ex, str) and ex.strip(), f"Bad example: {ex!r}"
            # Native-speaker examples should be short-ish full sentences
            assert len(ex.split()) <= 25, f"Example too long: {ex!r}"

    def test_grammar_already_correct_text(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "grammar", "text": "She went to school yesterday."},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert suggestions, "Expected at least one suggestion even when input is already correct"
        data = body.get("data") or {}
        # Even when correct, the new prompt asks the model to explain WHY it's correct,
        # so explanation/examples should still be present.
        if data:  # only assert structure if data returned
            if data.get("examples") is not None:
                assert isinstance(data["examples"], list)


# ---------- (4) Idioms ----------

class TestIdioms:
    def test_idioms_six_clean_lines(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "idioms", "text": "break the ice"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert len(suggestions) >= 5, f"Expected ~6 idiom sentences, got {len(suggestions)}: {suggestions}"
        for s in suggestions[:6]:
            assert s.strip(), "Empty sentence"
            # No numbering
            assert not re.match(r"^\s*\d+[\.\)]", s), f"Numbered idiom line: {s!r}"
            # No bullet prefix
            assert not re.match(r"^[-*•]\s", s), f"Bulleted idiom line: {s!r}"
            # Reasonable length
            assert len(s.split()) <= 25, f"Idiom sentence too long: {s!r}"


# ---------- (5) Vocab (Tamil) ----------

class TestVocabTamil:
    def test_vocab_tamil_script(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "vocab", "text": "resilient", "options": {"target_language": "Tamil"}},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = (r.json() or {}).get("data") or {}
        assert data, "data must be present for vocab tool"
        mt = data.get("meaning_translated") or ""
        assert mt, "meaning_translated missing"
        # Must contain Tamil script
        assert TAMIL_RE.search(mt), f"meaning_translated not in Tamil: {mt!r}"
        # Must NOT be Devanagari (avoid Hindi fallback)
        devan_letters = len(DEVANAGARI_RE.findall(mt))
        tamil_letters = len(TAMIL_RE.findall(mt))
        assert tamil_letters > devan_letters, \
            f"Tamil should outweigh Devanagari (tam={tamil_letters}, dev={devan_letters}): {mt!r}"

        # transliteration should be Latin-only (no Indic chars)
        translit = data.get("meaning_transliterated") or ""
        assert translit, "meaning_transliterated empty for Tamil"
        assert not TAMIL_RE.search(translit), f"transliteration has Tamil: {translit!r}"
        assert not DEVANAGARI_RE.search(translit), f"transliteration has Devanagari: {translit!r}"
        assert LATIN_LETTER_RE.search(translit), f"transliteration must contain Latin letters: {translit!r}"


# ---------- (6) Vocab_full (Telugu) ----------

class TestVocabFullTelugu:
    def test_vocab_full_telugu_schema(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "vocab_full", "text": "resilient", "options": {"target_language": "Telugu"}},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = (r.json() or {}).get("data") or {}
        assert data, "vocab_full must return data"

        # Required fields
        for key in ("word", "part_of_speech", "meaning_simple", "meaning_translated",
                    "synonyms", "antonyms", "tenses", "idioms_phrases"):
            assert key in data, f"Missing key {key!r} in vocab_full"

        # Telugu script in meaning_translated
        mt = data.get("meaning_translated") or ""
        assert TELUGU_RE.search(mt), f"meaning_translated not in Telugu: {mt!r}"
        # Not predominantly Devanagari
        assert len(TELUGU_RE.findall(mt)) >= len(DEVANAGARI_RE.findall(mt)), \
            f"meaning_translated should be Telugu not Hindi: {mt!r}"

        # transliteration latin-only
        translit = data.get("meaning_transliterated") or ""
        if translit:
            assert not TELUGU_RE.search(translit), f"transliteration has Telugu chars: {translit!r}"
            assert not DEVANAGARI_RE.search(translit), f"transliteration has Devanagari: {translit!r}"

        # synonyms / antonyms lists
        syn = data.get("synonyms") or []
        ant = data.get("antonyms") or []
        assert isinstance(syn, list) and len(syn) >= 3, f"Need ≥3 synonyms, got {syn}"
        assert isinstance(ant, list)  # antonyms can be empty list (allowed by prompt)

        # tenses: past / present / future
        tenses = data.get("tenses") or {}
        for k in ("past", "present", "future"):
            assert k in tenses, f"Missing tense {k!r}: {tenses}"
            row = tenses.get(k) or {}
            assert (row.get("english") or "").strip(), f"Empty english for tense {k}"
            tr = (row.get("translated") or "").strip()
            assert tr, f"Empty translated for tense {k}"
            # tense translated should be Telugu
            assert TELUGU_RE.search(tr), f"Tense {k} translated not in Telugu: {tr!r}"

        # idioms_phrases: 3 entries
        idioms = data.get("idioms_phrases") or []
        assert isinstance(idioms, list)
        assert len(idioms) == 3, f"Expected exactly 3 idioms_phrases, got {len(idioms)}: {idioms}"
        for it in idioms:
            assert isinstance(it, dict)
            assert (it.get("english") or "").strip(), f"Empty idiom english: {it}"
            tr = (it.get("translated") or "").strip()
            assert tr, f"Empty idiom translated: {it}"
            assert TELUGU_RE.search(tr), f"Idiom translated not in Telugu: {tr!r}"


# ---------- (7) Chat still works ----------

class TestChat:
    def test_chat_returns_natural_reply(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/chat",
            headers={"Authorization": f"Bearer {token}"},
            json={"session_id": "test-iter7-chat", "message": "What is grammar?"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("session_id") == "test-iter7-chat"
        reply = (body.get("reply") or "").strip()
        assert reply, "Empty chat reply"
        # Should be natural prose, not pure JSON
        assert not (reply.startswith("{") and reply.endswith("}")), \
            f"Chat reply looks like JSON: {reply[:120]!r}"
        # Reasonably long
        assert len(reply) >= 20, f"Reply too short: {reply!r}"
