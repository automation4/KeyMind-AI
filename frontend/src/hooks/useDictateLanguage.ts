import { useEffect, useState, useCallback } from "react";

import { storage } from "@/src/utils/storage";

/**
 * Persisted "what language am I dictating in?" choice.
 *
 * Why this matters for Hindi/Hinglish:
 *   • Whisper auto-detects language when you omit the hint — perfect for
 *     code-mixed Hinglish ("aaj meeting cancel hai bro").
 *   • For PURE Hindi (Devanagari output) you usually want `hi` so Whisper
 *     doesn't romanise it.
 *   • For other Indic languages (Kannada, Tamil, …) hint them explicitly,
 *     otherwise Whisper may transliterate to English.
 *
 * The selected language is sent as the optional `language` form-field on
 * `/api/transcribe`. `auto` means "send nothing → let Whisper decide" — the
 * best default for everyday chat in mixed-language households.
 */
export const DICTATE_LANGUAGES = [
  { code: "auto", label: "Auto (mixed)" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  // For Hinglish we use `auto` under the hood — Whisper handles the
  // code-switching better with no hint than with a forced Hindi/English
  // bias. The label still says "Hinglish" so users find it intuitively.
  { code: "auto", label: "Hinglish", uiKey: "hinglish" },
  { code: "kn", label: "Kannada" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "pa", label: "Punjabi" },
  { code: "ml", label: "Malayalam" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
] as const;

export type DictateLanguageOption = (typeof DICTATE_LANGUAGES)[number];

const STORAGE_KEY = "@dictation.language.v2";

export function useDictateLanguage() {
  // We persist the *UI* key (which can differentiate "Hinglish" from "Auto")
  // even though both share the same Whisper code internally. This keeps the
  // user's intent visible across app restarts.
  const [uiKey, setUiKey] = useState<string>("auto");

  useEffect(() => {
    let alive = true;
    storage.getItem(STORAGE_KEY).then((v) => {
      if (alive && v) setUiKey(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: string) => {
    setUiKey(next);
    try {
      await storage.setItem(STORAGE_KEY, next);
    } catch {
      /* best-effort persistence */
    }
  }, []);

  const current =
    DICTATE_LANGUAGES.find((l) => (l.uiKey ?? l.code) === uiKey) ??
    DICTATE_LANGUAGES[0];

  return {
    uiKey,
    setLanguage,
    /** ISO-639-1 code to send to Whisper, or undefined for auto-detect. */
    whisperCode: current.code === "auto" ? undefined : current.code,
    label: current.label,
    options: DICTATE_LANGUAGES,
  };
}
