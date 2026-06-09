// BCP-47 language codes for streaming speech recognition.
// Each entry has a code, a display label and a flag emoji for quick visual ID.

export type DictateLanguage = {
  code: string;
  label: string;
  flag: string;
  nativeName: string;
};

export const DICTATE_LANGUAGES: DictateLanguage[] = [
  { code: "en-US", label: "English (US)",   flag: "🇺🇸", nativeName: "English" },
  { code: "en-IN", label: "English (India)",flag: "🇮🇳", nativeName: "English" },
  { code: "en-GB", label: "English (UK)",   flag: "🇬🇧", nativeName: "English" },
  { code: "hi-IN", label: "Hindi",          flag: "🇮🇳", nativeName: "हिन्दी" },
  { code: "ta-IN", label: "Tamil",          flag: "🇮🇳", nativeName: "தமிழ்" },
  { code: "te-IN", label: "Telugu",         flag: "🇮🇳", nativeName: "తెలుగు" },
  { code: "bn-IN", label: "Bengali",        flag: "🇮🇳", nativeName: "বাংলা" },
  { code: "mr-IN", label: "Marathi",        flag: "🇮🇳", nativeName: "मराठी" },
  { code: "gu-IN", label: "Gujarati",       flag: "🇮🇳", nativeName: "ગુજરાતી" },
  { code: "kn-IN", label: "Kannada",        flag: "🇮🇳", nativeName: "ಕನ್ನಡ" },
  { code: "ml-IN", label: "Malayalam",      flag: "🇮🇳", nativeName: "മലയാളം" },
  { code: "pa-IN", label: "Punjabi",        flag: "🇮🇳", nativeName: "ਪੰਜਾਬੀ" },
  { code: "ur-IN", label: "Urdu",           flag: "🇮🇳", nativeName: "اُردو" },
  { code: "es-ES", label: "Spanish (Spain)", flag: "🇪🇸", nativeName: "Español" },
  { code: "es-MX", label: "Spanish (Mexico)",flag: "🇲🇽", nativeName: "Español" },
  { code: "fr-FR", label: "French",         flag: "🇫🇷", nativeName: "Français" },
  { code: "de-DE", label: "German",         flag: "🇩🇪", nativeName: "Deutsch" },
  { code: "it-IT", label: "Italian",        flag: "🇮🇹", nativeName: "Italiano" },
  { code: "pt-BR", label: "Portuguese (BR)", flag: "🇧🇷", nativeName: "Português" },
  { code: "ru-RU", label: "Russian",        flag: "🇷🇺", nativeName: "Русский" },
  { code: "ar-SA", label: "Arabic",         flag: "🇸🇦", nativeName: "العربية" },
  { code: "ja-JP", label: "Japanese",       flag: "🇯🇵", nativeName: "日本語" },
  { code: "ko-KR", label: "Korean",         flag: "🇰🇷", nativeName: "한국어" },
  { code: "zh-CN", label: "Chinese (Simp.)", flag: "🇨🇳", nativeName: "中文" },
  { code: "id-ID", label: "Indonesian",     flag: "🇮🇩", nativeName: "Indonesia" },
  { code: "tr-TR", label: "Turkish",        flag: "🇹🇷", nativeName: "Türkçe" },
  { code: "nl-NL", label: "Dutch",          flag: "🇳🇱", nativeName: "Nederlands" },
  { code: "pl-PL", label: "Polish",         flag: "🇵🇱", nativeName: "Polski" },
  { code: "vi-VN", label: "Vietnamese",     flag: "🇻🇳", nativeName: "Tiếng Việt" },
  { code: "th-TH", label: "Thai",           flag: "🇹🇭", nativeName: "ไทย" },
];

export const DEFAULT_DICTATE_LANG = "en-US";

export function findDictateLanguage(code: string): DictateLanguage | undefined {
  return DICTATE_LANGUAGES.find((l) => l.code === code);
}
