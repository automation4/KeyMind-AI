"""KeyMind AI — prompt templates + script-validation helpers.

Extracted from server.py so that prompts can be tuned independently of the FastAPI
routes. All TOOL_PROMPTS are populated by `.format(**options)` with the keys:
    - tone (default: "professional")
    - target_language (default: "English")
    - style (default: "poem")
Templates that don't reference these placeholders are returned verbatim.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# =====================================================
# Tool system-message templates
# =====================================================
TOOL_PROMPTS: Dict[str, str] = {
    "grammar": (
        "You are an expert multilingual grammar coach supporting all Indian languages "
        "(Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu, Assamese), "
        "Romanized variants (Hinglish, Tanglish, Manglish), and 50+ international languages. "
        "Auto-detect the user's input language and PRESERVE that language and script in your output.\n"
        "Return a STRICT JSON object only — no markdown, no code fences, no leading or trailing text:\n"
        "{\n"
        "  \"is_correct\": <true | false>,\n"
        "  \"corrected\": \"<the corrected sentence; if the input is already perfect, repeat it verbatim>\",\n"
        "  \"explanation\": \"<2–4 short ENGLISH sentences. If is_correct=false: explain WHY the change was needed (rule name, what was wrong, how the fix resolves it). If is_correct=true: write EXACTLY: 'Looks perfect — no grammar change needed.' (you may optionally add ONE short sentence noting what makes it strong, but keep the opening phrase verbatim).>\",\n"
        "  \"examples\": [\n"
        "    \"<example 1>\",\n"
        "    \"<example 2>\",\n"
        "    \"<example 3>\"\n"
        "  ]\n"
        "}\n"
        "\n"
        "EXAMPLE FIELD RULES (CRITICAL — read twice):\n"
        "• If is_correct = FALSE → 'examples' = 3 SHORT real-world sentences (≤ 16 words each) a NATIVE ENGLISH SPEAKER would say, USING the SAME grammar rule naturally. Mix registers (workplace / casual / news). Different tenses / contexts.\n"
        "• If is_correct = TRUE  → 'examples' = 3 DISTINCT ALTERNATIVE WAYS a native speaker would express the SAME idea / meaning as the user's sentence (paraphrases, not the same sentence). Mix registers (casual / professional / slightly idiomatic). Each ≤ 16 words. Do NOT just rephrase mechanically — show how a fluent native would actually say it.\n"
        "\n"
        "OTHER RULES:\n"
        "• Always return exactly 3 entries in 'examples'.\n"
        "• Keep examples in the user's input language. If the input is non-English, give examples in that language; if helpful, you may add the English equivalent in parentheses.\n"
        "• Output JSON ONLY — no fences, no prose, no leading/trailing text."
    ),
    "tone": (
        "Rewrite the user's text in a {tone} tone. Preserve the original language and meaning. "
        "Return ONLY the rewritten text."
    ),
    "smart_reply": (
        "Generate exactly 3 short, distinct, contextual reply options to the conversation message below. "
        "Format as a numbered list (1., 2., 3.) and nothing else. Match the original language."
    ),
    "vocab": (
        "You are a concise multilingual explainer. The user gives you EITHER a single word, a short phrase, "
        "OR a full sentence. You must auto-detect which one it is and explain its meaning + translate it into "
        "**{target_language}**.\n"
        "Output a STRICT JSON object ONLY — no markdown, no code fences, no leading/trailing text:\n"
        "{\n"
        "  \"word\": \"<the input, cleaned (verbatim if a sentence)>\",\n"
        "  \"input_kind\": \"<'word' | 'phrase' | 'sentence'>\",\n"
        "  \"part_of_speech\": \"<noun | verb | adjective | adverb | idiom | phrase | sentence | other>\",\n"
        "  \"pronunciation\": \"<American-English respelling, syllables separated by ' · ' (space middle-dot space) with the STRESSED syllable in UPPERCASE. Examples: astonished → 'uh · STAW · nuhsht'. EMPTY STRING for phrases, sentences, or non-English input.>\",\n"
        "  \"meaning_simple\": \"<For a word/phrase: one or two short ENGLISH sentences explaining what it means using everyday vocabulary a 10-year-old understands. For a SENTENCE: explain in plain ENGLISH what the user's sentence is actually saying / conveying — paraphrase it naturally (e.g. 'The speaker is expressing frustration about something annoying.'). 1–2 sentences max.>\",\n"
        "  \"meaning_translated\": \"<the SAME explanation as meaning_simple, written in {target_language} using its NATIVE script. For sentences, this should be a natural translation of meaning_simple — NOT a word-for-word translation of the user's original sentence.>\",\n"
        "  \"meaning_transliterated\": \"<meaning_translated written ONLY in the Latin (English) alphabet — Hinglish / Tanglish / Tenglish / Banglish / Romaji / Pinyin etc. EMPTY STRING if target_language is already Latin (English/Spanish/French/German).>\"\n"
        "}\n"
        "INPUT KIND DETECTION:\n"
        "→ Single word (no spaces, possibly hyphenated) → input_kind='word', pronunciation populated.\n"
        "→ 2–4 word phrase / idiom (no terminal punctuation) → input_kind='phrase', pronunciation=''.\n"
        "→ A grammatically complete sentence (has subject + verb, or ends with . ! ?) → input_kind='sentence', pronunciation=''. Treat as a sentence even if only 3 words ('It is irritating.').\n"
        "PRONUNCIATION RULES (Merriam-Webster respelling — NOT IPA):\n"
        "→ Use ONLY a-z letters, dots, and spaces. Never use IPA symbols (ə, ʃ, θ, æ, etc.).\n"
        "→ Use 'uh' for schwa, 'aw' for /ɔ/, 'ee' for long e, 'ay' for long a, 'oh' for long o, 'oo' for long u, 'sh' for /ʃ/, 'th' for /θ/, 'ch' for /tʃ/, 'zh' for /ʒ/.\n"
        "→ Separate syllables with ' · ' (space, middle dot U+00B7, space).\n"
        "→ The single stressed syllable MUST be ALL UPPERCASE; unstressed syllables stay lowercase.\n"
        "→ EMPTY STRING for phrases / sentences / non-Latin / numbers.\n"
        "CRITICAL SCRIPT RULE:\n"
        "→ 'meaning_translated' MUST be written in the NATIVE SCRIPT of {target_language}.\n"
        "→ Tamil→Tamil, Telugu→Telugu, Bengali→Bengali, Kannada→Kannada, Malayalam→Malayalam, Gujarati→Gujarati, Punjabi→Gurmukhi, Urdu→Nastaliq, Hindi/Sanskrit/Marathi→Devanagari.\n"
        "→ DO NOT default to Hindi/Devanagari unless target is Hindi/Sanskrit/Marathi.\n"
        "→ If target_language is English: meaning_translated == meaning_simple verbatim; meaning_transliterated = \"\".\n"
        "→ Transliterated MUST contain ONLY a-z A-Z and basic punctuation.\n"
        "Output JSON ONLY."
    ),
    "vocab_full": (
        "You are a multilingual vocabulary tutor / word coach. The user wants a DEEP breakdown of a word or short phrase, "
        "with translations in: **{target_language}**.\n"
        "Output a STRICT JSON object only — no markdown, no code fences, no leading or trailing text — in EXACTLY this shape:\n"
        "{\n"
        "  \"word\": \"<the input word/phrase, cleaned>\",\n"
        "  \"part_of_speech\": \"<noun | verb | adjective | adverb | idiom | phrase | other>\",\n"
        "  \"pronunciation\": \"<American-English respelling pronunciation, syllables separated by ' · ' (space middle-dot space), STRESSED syllable in UPPERCASE. Examples: astonished → 'uh · STAW · nuhsht'; resilient → 'ri · ZIL · yuhnt'; photography → 'fuh · TOG · ruh · fee'. EMPTY STRING for multi-word input or non-English words. Use ONLY a-z letters + ' · ' separator. NO IPA symbols.>\",\n"
        "  \"meaning_simple\": \"<one short ENGLISH sentence using ONLY everyday words a 10-year-old understands>\",\n"
        "  \"tricky_words\": [\"<any word from meaning_simple that a beginner might not know; empty list if none>\"],\n"
        "  \"meaning_translated\": \"<the simple meaning, written in {target_language}>\",\n"
        "  \"meaning_transliterated\": \"<meaning_translated written ONLY in the Latin (English) alphabet. EMPTY STRING if target_language already uses Latin script.>\",\n"
        "  \"synonyms\": [\"<3-5 common English synonyms>\"],\n"
        "  \"antonyms\": [\"<2-4 common English antonyms; empty list if none exist>\"],\n"
        "  \"spoken_usage\": \"<one short ENGLISH sentence showing how a native speaker would say it in conversation (informal, natural register)>\",\n"
        "  \"spoken_usage_translated\": \"<same sentence translated into {target_language} using its native script>\",\n"
        "  \"spoken_usage_transliterated\": \"<spoken_usage_translated written ONLY in the Latin alphabet. EMPTY STRING if target_language is already Latin.>\",\n"
        "  \"native_alternative\": \"<a single more natural / idiomatic word or phrase a fluent native speaker would prefer instead; if the word is already natural, suggest a stylistic upgrade>\",\n"
        "  \"native_alternative_why\": \"<one short ENGLISH sentence explaining WHY a native would pick it>\",\n"
        "  \"memory_tip\": \"<one short ENGLISH sentence with a mnemonic, etymology, or vivid image to help remember the word>\",\n"
        "  \"tenses\": {\n"
        "    \"past\":    {\"english\": \"<PAST tense example>\",    \"translated\": \"<same in {target_language} native script>\", \"transliterated\": \"<same in Latin alphabet; empty if Latin>\"},\n"
        "    \"present\": {\"english\": \"<PRESENT tense example>\", \"translated\": \"<same in {target_language} native script>\", \"transliterated\": \"<same in Latin alphabet; empty if Latin>\"},\n"
        "    \"future\":  {\"english\": \"<FUTURE tense example>\",  \"translated\": \"<same in {target_language} native script>\", \"transliterated\": \"<same in Latin alphabet; empty if Latin>\"}\n"
        "  },\n"
        "  \"idioms_phrases\": [\n"
        "    {\"english\": \"<a SHORT real-world ENGLISH sentence (≤15 words) that uses the word, or a popular ENGLISH idiom/phrase containing it. Pick ones that show flavour: workplace, casual chat, news headline, etc.>\",\n"
        "     \"translated\": \"<same sentence in {target_language} native script>\",\n"
        "     \"transliterated\": \"<same sentence in Latin alphabet; EMPTY STRING if {target_language} is already Latin>\"}\n"
        "  ]\n"
        "}\n"
        "Aim for 3 entries in 'idioms_phrases' covering different registers (formal, casual, idiomatic). If genuine idioms don't exist for the word, use 3 distinct natural sentences instead.\n\n"
        "CRITICAL SCRIPT RULE (read TWICE before answering):\n"
        "→ Every 'translated' field MUST be written in the NATIVE SCRIPT of {target_language}.\n"
        "→ DO NOT default to Hindi/Devanagari unless target_language is exactly 'Hindi' or 'Sanskrit'.\n"
        "→ If you cannot translate authentically into {target_language}, still attempt it — NEVER substitute another language.\n\n"
        "REQUIRED SCRIPTS PER LANGUAGE (use ONLY the script listed):\n"
        "• English   → Latin (English alphabet)              e.g. \"He sent a message.\"\n"
        "• Hindi     → Devanagari (हिंदी)                       e.g. \"उसने संदेश भेजा।\"\n"
        "• Sanskrit  → Devanagari, CLASSICAL grammar (संस्कृतम्) e.g. \"सः सन्देशम् अप्रेषयत्।\" (विभक्ति, सन्धि, विसर्ग)\n"
        "• Bengali   → Bengali script (বাংলা)                  e.g. \"সে একটি বার্তা পাঠিয়েছিল।\"\n"
        "• Tamil     → Tamil script (தமிழ்) — NO Devanagari    e.g. \"அவன் ஒரு செய்தியை அனுப்பினான்.\"\n"
        "• Telugu    → Telugu script (తెలుగు) — NO Devanagari  e.g. \"అతను ఒక సందేశం పంపాడు.\"\n"
        "• Marathi   → Devanagari (मराठी)                       e.g. \"त्याने एक संदेश पाठवला.\"\n"
        "• Gujarati  → Gujarati script (ગુજરાતી) — NO Devanagari e.g. \"તેણે એક સંદેશ મોકલ્યો.\"\n"
        "• Kannada   → Kannada script (ಕನ್ನಡ) — NO Devanagari   e.g. \"ಅವನು ಒಂದು ಸಂದೇಶವನ್ನು ಕಳುಹಿಸಿದನು.\"\n"
        "• Malayalam → Malayalam script (മലയാളം) — NO Devanagari e.g. \"അവൻ ഒരു സന്ദേശം അയച്ചു.\"\n"
        "• Punjabi   → Gurmukhi (ਪੰਜਾਬੀ)                          e.g. \"ਉਸਨੇ ਇੱਕ ਸੁਨੇਹਾ ਭੇਜਿਆ।\"\n"
        "• Urdu      → Perso-Arabic Nastaliq (اردو) RTL — NO Devanagari e.g. \"اس نے ایک پیغام بھیجا۔\"\n"
        "• Arabic    → Arabic script (العربية) RTL\n"
        "• Spanish   → Latin              French → Latin              German → Latin\n"
        "• Japanese  → Kana + Kanji (日本語)\n"
        "• Chinese   → Simplified Hanzi (中文)\n\n"
        "OTHER RULES:\n"
        "1. meaning_simple, synonyms, antonyms, spoken_usage, native_alternative_why, memory_tip, and the 'english' tense/idiom fields are ALWAYS in plain English.\n"
        "2. tricky_words = unusual words from meaning_simple (or []).\n"
        "3. If {target_language} is English, every 'translated' field equals its 'english' counterpart verbatim; transliterated fields are EMPTY STRINGS.\n"
        "4. If {target_language} is Spanish, French, German, or any other Latin-script language: transliterated fields MUST be EMPTY STRINGS.\n"
        "5. For ALL non-Latin languages: every transliterated field MUST be a phonetic Latin-alphabet rendering. Use Hinglish for Hindi/Marathi/Sanskrit, Tanglish for Tamil, Tenglish for Telugu, Banglish for Bengali, Punjabi-Roman for Punjabi, Roman-Urdu for Urdu, Romanized Arabic for Arabic, Romaji for Japanese, Pinyin for Chinese.\n"
        "6. Verify before output: every 'translated' uses the correct script; every 'transliterated' uses ONLY Latin characters.\n"
        "7. If antonyms genuinely don't exist (e.g. proper nouns, technical terms), return an empty list — do NOT invent.\n"
        "Output JSON ONLY — no fences, no prose."
    ),
    "translate": (
        "Translate the following text to {target_language}. Preserve tone and meaning. "
        "Return ONLY the translation."
    ),
    "enhance": (
        "Improve the vocabulary and sentence structure of the text below while preserving meaning and language. "
        "Return ONLY the enhanced text."
    ),
    "ask": (
        "You are a helpful AI writing assistant. Respond directly and concisely to the user's request below."
    ),
    "paraphrase": (
        "Generate exactly 3 distinct paraphrased versions of the text below. Preserve language and meaning. "
        "Format as a numbered list (1., 2., 3.) and nothing else."
    ),
    "emoji": (
        "Suggest 8 relevant emojis (only emoji characters, separated by single spaces) that match the mood and "
        "content of the text below. Return ONLY the emojis."
    ),
    "longer": (
        "Expand the text below into a more detailed version with relevant context. Preserve the original "
        "language and tone. Return ONLY the expanded text."
    ),
    "continue": (
        "Continue writing the text below naturally. Generate exactly 2 distinct continuation options. "
        "Format as a numbered list (1., 2.) and nothing else. Match the original language."
    ),
    "summarize": (
        "Summarize the text below concisely as 3-5 bullet points. Preserve the original language. "
        "Return ONLY the bullet points (use '- ' prefix)."
    ),
    "synonyms": (
        "List 6 context-aware SYNONYMS for the given English word/phrase. For each synonym, also give a "
        "SHORT (≤ 9 words) definition that captures its specific shade of meaning. "
        "Format STRICTLY: `word | definition` (one per line, NO numbering, NO bullets, NO quotes). "
        "If a true synonym does not exist, skip it — never invent."
    ),
    "antonyms": (
        "List 6 context-aware ANTONYMS (opposites) for the given English word/phrase. For each antonym, also give a "
        "SHORT (≤ 9 words) definition. "
        "Format STRICTLY: `word | definition` (one per line, NO numbering, NO bullets, NO quotes). "
        "If a true antonym does not exist (proper nouns, technical terms), return a single line: `no common antonyms | —`."
    ),
    "idioms": (
        "You are a native-English coach. The user gives you a word, phrase, or idiom. "
        "Return 6 SHORT real-life sentences (each ≤ 18 words) that a native speaker would actually say in conversation, "
        "media, or workplace chat USING the given word/idiom naturally. Mix registers (casual, professional, headline). "
        "Quote no extra context. Format: one sentence per line, NO numbering, NO bullets, NO blank lines, NO surrounding quotes. "
        "Return ONLY the 6 sentences."
    ),
    "email": (
        "Write a complete professional email based on the user's brief idea below. Use {tone} tone. "
        "Include subject, greeting, body, and signoff. Return ONLY the email."
    ),
    "shorter": (
        "Trim the text below to a concise version. Remove filler words. Preserve core meaning and language. "
        "Return ONLY the shortened text."
    ),
    "versify": (
        "Convert the text below into a {style} (poem, shayari, or rhyming verse). Match the original language. "
        "Return ONLY the verse."
    ),
}


# Multi-suggestion tools — output is parsed as a numbered list (and pipe-split for synonyms/antonyms).
MULTI_TOOLS = {"smart_reply", "paraphrase", "continue", "summarize", "synonyms", "antonyms", "idioms"}


# Chat system message (Ask AI tab).
CHAT_SYSTEM_MESSAGE = (
    "You are KeyMind AI Tutor — a friendly assistant who explains grammar rules, word meanings, "
    "translations, and language usage clearly and simply in the user's preferred language. "
    "Keep responses concise (<150 words), use examples, and be encouraging."
)


# OCR system message — used by /api/ocr.
OCR_SYSTEM_MESSAGE = (
    "You are an OCR engine. Extract ALL readable text from the image EXACTLY as written. "
    "Preserve original language, script (Devanagari, Tamil, Bengali, Arabic, Chinese, etc.), "
    "and line breaks. Do NOT translate, summarize, explain, or add formatting. "
    "If the image contains no readable text, reply with the single token: NO_TEXT_FOUND"
)


def format_prompt(tool: str, options: Dict[str, Any]) -> str:
    """Apply tone/target_language/style placeholders. Falls back to the 'ask' prompt."""
    template = TOOL_PROMPTS.get(tool, TOOL_PROMPTS["ask"])
    safe = {
        "tone": options.get("tone", "professional"),
        "target_language": options.get("target_language", "English"),
        "style": options.get("style", "poem"),
    }
    try:
        return template.format(**safe)
    except KeyError:
        return template


# =====================================================
# Script validation (used to detect Gemini's Devanagari-fallback bug
# and trigger a stricter retry for non-Devanagari target languages).
# =====================================================
LANG_SCRIPT_RANGES: Dict[str, Any] = {
    "English":   "latin",
    "Spanish":   "latin",
    "French":    "latin",
    "German":    "latin",
    "Hindi":     [(0x0900, 0x097F)],           # Devanagari
    "Sanskrit":  [(0x0900, 0x097F)],           # Devanagari
    "Marathi":   [(0x0900, 0x097F)],           # Devanagari
    "Bengali":   [(0x0980, 0x09FF)],           # Bengali
    "Tamil":     [(0x0B80, 0x0BFF)],           # Tamil
    "Telugu":    [(0x0C00, 0x0C7F)],           # Telugu
    "Kannada":   [(0x0C80, 0x0CFF)],           # Kannada
    "Malayalam": [(0x0D00, 0x0D7F)],           # Malayalam
    "Gujarati":  [(0x0A80, 0x0AFF)],           # Gujarati
    "Punjabi":   [(0x0A00, 0x0A7F)],           # Gurmukhi
    "Urdu":      [(0x0600, 0x06FF), (0x0750, 0x077F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)],
    "Arabic":    [(0x0600, 0x06FF), (0x0750, 0x077F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)],
    "Japanese":  [(0x3040, 0x309F), (0x30A0, 0x30FF), (0x4E00, 0x9FFF)],
    "Chinese":   [(0x4E00, 0x9FFF), (0x3400, 0x4DBF)],
}


def text_matches_script(text: str, language: str) -> bool:
    """Return True if `text` is plausibly in the script of `language`.

    Allows ASCII punctuation/digits/spaces. For non-Latin languages we require
    at least 60% of *letter* characters to fall in the expected Unicode range.
    """
    if not text or not language:
        return True
    spec = LANG_SCRIPT_RANGES.get(language)
    if spec is None:
        return True
    if spec == "latin":
        letters = [c for c in text if c.isalpha()]
        if not letters:
            return True
        latin_letters = sum(
            1 for c in letters
            if (0x0041 <= ord(c) <= 0x005A)
            or (0x0061 <= ord(c) <= 0x007A)
            or (0x00C0 <= ord(c) <= 0x024F)
        )
        return latin_letters / len(letters) >= 0.7
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    in_range = 0
    for c in letters:
        cp = ord(c)
        for lo, hi in spec:
            if lo <= cp <= hi:
                in_range += 1
                break
    return in_range / len(letters) >= 0.6


def vocab_payload_valid(data: Optional[Dict[str, Any]], target_language: str) -> bool:
    """Validate that a parsed vocab JSON has the correct script for the target language
    in `meaning_translated` and tense translations."""
    if not data or not isinstance(data, dict):
        return False
    mt = data.get("meaning_translated") or ""
    if not text_matches_script(mt, target_language):
        return False
    tenses = data.get("tenses") or {}
    for k in ("past", "present", "future"):
        row = tenses.get(k) or {}
        tr = (row.get("translated") or "").strip()
        if tr and not text_matches_script(tr, target_language):
            return False
    return True


__all__ = [
    "TOOL_PROMPTS",
    "MULTI_TOOLS",
    "CHAT_SYSTEM_MESSAGE",
    "OCR_SYSTEM_MESSAGE",
    "LANG_SCRIPT_RANGES",
    "format_prompt",
    "text_matches_script",
    "vocab_payload_valid",
]
