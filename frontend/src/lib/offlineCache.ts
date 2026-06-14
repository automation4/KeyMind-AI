import { storage } from "@/src/utils/storage";

/**
 * Ring buffer of the last N AI tool results, persisted to AsyncStorage so the
 * user can re-open recent answers offline (no network round-trip).
 *
 * Each entry is the raw response body from `/api/ai/tool` plus the input that
 * produced it so we can match on lookup.
 */
const KEY = "keymind_offline_results";
const MAX_ENTRIES = 10;

export type CachedResult = {
  toolId: string;
  text: string;
  options: Record<string, any>;
  result: any;
  createdAt: string;
};

export async function cacheResult(entry: Omit<CachedResult, "createdAt">): Promise<void> {
  try {
    const list = (await storage.getItem<CachedResult[]>(KEY, [])) || [];
    const next: CachedResult[] = [
      { ...entry, createdAt: new Date().toISOString() },
      ...list.filter(
        (r) => !(r.toolId === entry.toolId && r.text === entry.text),
      ),
    ].slice(0, MAX_ENTRIES);
    await storage.setItem(KEY, next);
  } catch {
    /* never throw — cache is best-effort */
  }
}

export async function lookupResult(
  toolId: string,
  text: string,
): Promise<CachedResult | null> {
  try {
    const list = (await storage.getItem<CachedResult[]>(KEY, [])) || [];
    return list.find((r) => r.toolId === toolId && r.text === text) || null;
  } catch {
    return null;
  }
}

export async function listCached(): Promise<CachedResult[]> {
  try {
    return (await storage.getItem<CachedResult[]>(KEY, [])) || [];
  } catch {
    return [];
  }
}
