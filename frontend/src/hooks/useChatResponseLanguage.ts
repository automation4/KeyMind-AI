import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_CHAT_RESPONSE_LANG,
  findChatResponseLang,
} from "@/src/lib/chatResponseLanguages";

const STORAGE_KEY = "keymind:chat_response_lang";

/**
 * Persisted chat-response language (independent of voice-input language).
 *
 * Uses an in-memory pub/sub so all consumers stay in sync without Context.
 */
const listeners = new Set<(code: string) => void>();
let memoryLang: string = DEFAULT_CHAT_RESPONSE_LANG;
let hydrated = false;

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && findChatResponseLang(stored)) {
      memoryLang = stored;
      listeners.forEach((l) => l(memoryLang));
    }
  } catch {
    // ignore
  }
}

export function useChatResponseLanguage() {
  const [lang, setLangState] = useState<string>(memoryLang);

  useEffect(() => {
    hydrate();
    const cb = (code: string) => setLangState(code);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const setLang = useCallback(async (code: string) => {
    memoryLang = code;
    listeners.forEach((l) => l(code));
    try {
      await AsyncStorage.setItem(STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }, []);

  return { lang, setLang };
}
