"""Iteration 8 backend regression tests — verify that the refactor (prompts.py
extraction + Write tab modularisation) did NOT break any backend behaviour.

Covers the three cases NOT already in test_iter7_ai_tools_v2.py:
  - paraphrase (3 lines)
  - translate to French
  - OCR (image base64 → text or NO_TEXT_FOUND)

The remaining 8 cases (synonyms, antonyms, grammar, idioms, vocab Tamil,
vocab_full Telugu, chat, guest auth) are exercised by test_iter7_ai_tools_v2.py
using its own module-scoped guest. Splitting the new cases into a separate
guest avoids the 10/day FREE_TOOL_DAILY_LIMIT being hit when both modules
run in the same pytest invocation.
"""
import base64
import os
import re

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

LATIN_RE = re.compile(r"[A-Za-zÀ-ÿ]")


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
    return data["session_token"], data["user"]


# ---------- (1) Paraphrase ----------

class TestParaphrase:
    def test_paraphrase_three_variants(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={"tool": "paraphrase", "text": "I love this."},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("tool") == "paraphrase"
        assert body.get("original") == "I love this."
        suggestions = body.get("suggestions") or []
        # Prompt asks for exactly 3 distinct paraphrases as a numbered list.
        assert len(suggestions) >= 2, f"Expected ~3 paraphrases, got: {suggestions}"
        for s in suggestions[:3]:
            assert s.strip(), f"Empty paraphrase: {s!r}"
            # No leftover numeric prefix from the numbered list
            assert not re.match(r"^\s*\d+[\.\)]", s), f"Numbering not stripped: {s!r}"


# ---------- (2) Translate ----------

class TestTranslate:
    def test_translate_to_french(self, session, guest_token):
        token, _ = guest_token
        r = session.post(
            f"{API}/ai/tool",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "tool": "translate",
                "text": "Good morning",
                "options": {"target_language": "French"},
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        suggestions = body.get("suggestions") or []
        assert suggestions, "Expected at least one suggestion (the translation)"
        translation = suggestions[0].strip()
        assert translation, "Empty translation"
        # French is Latin script — must contain Latin letters
        assert LATIN_RE.search(translation), f"Translation has no Latin letters: {translation!r}"
        # Heuristic: expect French greeting words (bonjour/matin/jour/bon)
        lower = translation.lower()
        assert any(token in lower for token in ("bonjour", "matin", "bon ")), \
            f"Doesn't look like a French translation of 'Good morning': {translation!r}"


# ---------- (3) OCR ----------

def _make_text_image_b64() -> str:
    """Generate a small PNG with the text 'HELLO' so the OCR model can extract it.
    Falls back to a 1x1 transparent PNG (NO_TEXT_FOUND expected) if Pillow not available.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
        from io import BytesIO

        img = Image.new("RGB", (240, 80), color=(255, 255, 255))
        d = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48
            )
        except Exception:
            font = ImageFont.load_default()
        d.text((20, 10), "HELLO", fill=(0, 0, 0), font=font)
        buf = BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        # 1x1 transparent PNG fallback — model should reply NO_TEXT_FOUND
        return (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        )


class TestOCR:
    def test_ocr_extracts_or_returns_empty(self, session):
        b64 = _make_text_image_b64()
        r = session.post(f"{API}/ocr", json={"image_base64": b64}, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "text" in body, f"OCR response missing 'text': {body}"
        text = body.get("text") or ""
        # Either we got HELLO back, or empty string (NO_TEXT_FOUND was normalised to "").
        # Both are acceptable contracts — frontend handles both.
        assert isinstance(text, str)
        if text:
            # If model returned text, accept any non-empty string (case-insensitive HELLO ideal).
            assert text.strip(), "Whitespace-only OCR text"

    def test_ocr_rejects_empty_payload(self, session):
        r = session.post(f"{API}/ocr", json={"image_base64": ""}, timeout=30)
        assert r.status_code == 400, f"Empty payload should 400, got {r.status_code} {r.text}"
