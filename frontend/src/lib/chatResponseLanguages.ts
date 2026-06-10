/**
 * Languages the AI can RESPOND in inside the Chat tab.
 * Independent from the voice-input (dictation) language — this controls how
 * the AI writes back, including which SCRIPT (Devanagari vs Roman, etc.).
 *
 * `code` is what we persist + send to the backend. The backend uses this
 * to inject a language-directive block into the chat system prompt.
 */

export type ChatResponseLanguage = {
  /** Stable code we persist and pass to /api/ai/chat. */
  code: string;
  /** Human label shown in the picker chip + sheet. */
  label: string;
  /** Short code shown inside the chip (e.g. "EN", "KO-RO"). */
  short: string;
  /** Emoji shown on the chip + in the sheet. */
  flag: string;
  /** Sample native-script phrase shown as a hint. */
  nativeSample: string;
  /** Optional sub-label shown under the main label in the sheet. */
  hint?: string;
};

export const CHAT_RESPONSE_LANGUAGES: ChatResponseLanguage[] = [
  { code: "auto",          label: "Auto",                   short: "AUTO",  flag: "✨", nativeSample: "Match the user", hint: "Default — replies in English unless asked otherwise" },
  { code: "english",       label: "English",                short: "EN",    flag: "🇬🇧", nativeSample: "Hello, how are you?" },
  { code: "hindi",         label: "Hindi (Devanagari)",     short: "HI",    flag: "🇮🇳", nativeSample: "नमस्ते, आप कैसे हैं?" },
  { code: "hinglish",      label: "Hinglish (Roman)",       short: "HING",  flag: "🇮🇳", nativeSample: "Namaste, aap kaise hain?", hint: "Hindi in Roman / Latin script" },
  { code: "konkani-deva",  label: "Konkani (Devanagari)",   short: "KO-DV", flag: "🇮🇳", nativeSample: "नमस्कार, तुं कसो आसा?" },
  { code: "konkani-romi",  label: "Konkani (Romi)",         short: "KO-RO", flag: "🇮🇳", nativeSample: "Namaskar, tum koso asa?", hint: "Goan Konkani in Roman / Latin script" },
  { code: "marathi",       label: "Marathi",                short: "MR",    flag: "🇮🇳", nativeSample: "नमस्कार, तुम्ही कसे आहात?" },
  { code: "tamil",         label: "Tamil",                  short: "TA",    flag: "🇮🇳", nativeSample: "வணக்கம், எப்படி இருக்கீங்க?" },
  { code: "telugu",        label: "Telugu",                 short: "TE",    flag: "🇮🇳", nativeSample: "నమస్తే, మీరు ఎలా ఉన్నారు?" },
  { code: "kannada",       label: "Kannada",                short: "KN",    flag: "🇮🇳", nativeSample: "ನಮಸ್ಕಾರ, ಹೇಗಿದ್ದೀರಾ?" },
  { code: "malayalam",     label: "Malayalam",              short: "ML",    flag: "🇮🇳", nativeSample: "നമസ്കാരം, സുഖമാണോ?" },
  { code: "bengali",       label: "Bengali",                short: "BN",    flag: "🇮🇳", nativeSample: "নমস্কার, কেমন আছেন?" },
  { code: "gujarati",      label: "Gujarati",               short: "GU",    flag: "🇮🇳", nativeSample: "નમસ્તે, કેમ છો?" },
  { code: "punjabi",       label: "Punjabi (Gurmukhi)",     short: "PA",    flag: "🇮🇳", nativeSample: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ?" },
  { code: "urdu",          label: "Urdu",                   short: "UR",    flag: "🇵🇰", nativeSample: "السلام علیکم، آپ کیسے ہیں؟" },
  { code: "sanskrit",      label: "Sanskrit",               short: "SA",    flag: "🇮🇳", nativeSample: "नमस्ते, भवान् कथम् अस्ति?" },
  { code: "spanish",       label: "Spanish",                short: "ES",    flag: "🇪🇸", nativeSample: "Hola, ¿cómo estás?" },
  { code: "french",        label: "French",                 short: "FR",    flag: "🇫🇷", nativeSample: "Bonjour, comment ça va ?" },
  { code: "german",        label: "German",                 short: "DE",    flag: "🇩🇪", nativeSample: "Hallo, wie geht es dir?" },
  { code: "arabic",        label: "Arabic",                 short: "AR",    flag: "🇸🇦", nativeSample: "مرحباً، كيف حالك؟" },
  { code: "japanese",      label: "Japanese",               short: "JA",    flag: "🇯🇵", nativeSample: "こんにちは、お元気ですか？" },
  { code: "chinese",       label: "Chinese (Simplified)",   short: "ZH",    flag: "🇨🇳", nativeSample: "你好，最近怎么样？" },
];

export const DEFAULT_CHAT_RESPONSE_LANG = "auto";

export function findChatResponseLang(code: string): ChatResponseLanguage | undefined {
  return CHAT_RESPONSE_LANGUAGES.find((l) => l.code === code);
}
