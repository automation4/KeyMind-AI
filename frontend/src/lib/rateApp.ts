import * as StoreReview from "expo-store-review";
import { storage } from "@/src/utils/storage";

/**
 * In-app rate-prompt manager.
 *
 * Strategy:
 *   • Track number of successful APPLY actions in AsyncStorage.
 *   • Once the user crosses an APPLY threshold (default 5) AND we haven't
 *     asked them in the last 60 days, gently request the OS-level review
 *     dialog. The OS itself rate-limits this to ~3 prompts per year so we
 *     don't risk annoying users.
 */
const KEY_COUNT = "keymind_apply_count";
const KEY_LAST_PROMPT = "keymind_rate_last_prompt";
const THRESHOLD = 5;
const COOLDOWN_DAYS = 60;

export async function recordApply(): Promise<void> {
  try {
    const prev = (await storage.getItem<number>(KEY_COUNT, 0)) || 0;
    await storage.setItem(KEY_COUNT, prev + 1);
  } catch {
    /* best-effort */
  }
}

export async function maybeAskForReview(): Promise<void> {
  try {
    const count = (await storage.getItem<number>(KEY_COUNT, 0)) || 0;
    if (count < THRESHOLD) return;

    const lastPromptIso = (await storage.getItem<string>(KEY_LAST_PROMPT, "")) || "";
    if (lastPromptIso) {
      const last = new Date(lastPromptIso).getTime();
      if (!Number.isNaN(last)) {
        const days = (Date.now() - last) / 86_400_000;
        if (days < COOLDOWN_DAYS) return;
      }
    }

    const available = await StoreReview.hasAction();
    if (!available) return;
    await StoreReview.requestReview();
    await storage.setItem(KEY_LAST_PROMPT, new Date().toISOString());
  } catch {
    /* never throw — review prompt is best-effort */
  }
}
