import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_DICTATE_LANG,
  findDictateLanguage,
} from "@/src/lib/dictateLanguages";

const STORAGE_KEY = "keymind:dictate_lang";

/**
 * Persisted dictation language (BCP-47). Returns {lang, setLang}.
 * Hydration is async; while hydrating we use DEFAULT_DICTATE_LANG.
 *
 * NOTE: This intentionally does not use Context — each consumer reads
 * from AsyncStorage independently. To keep them in sync we broadcast
 * changes via a simple in-memory pub/sub.
 */
const listeners = new Set<(code: string) => void>();
let memoryLang: string = DEFAULT_DICTATE_LANG;
let hydrated = false;

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && findDictateLanguage(stored)) {
      memoryLang = stored;
      listeners.forEach((l) => l(memoryLang));
    }
  } catch {
    // ignore
  }
}

export function useDictateLanguage() {
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
