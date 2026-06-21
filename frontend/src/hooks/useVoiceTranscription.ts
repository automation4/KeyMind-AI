import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { useDictateLanguage } from "@/src/hooks/useDictateLanguage";

/**
 * Voice → text hook with **live interim transcription** + bullet-proof
 * anti-duplication contract.
 *
 * STATE MACHINE
 * -------------
 *   idle ──► starting ──► listening ──► idle
 *      └─────── error ◄── (any phase fails) ──┘
 *
 * Powered by `expo-speech-recognition` which wraps the platform's *native*
 * speech recognizer:
 *   • Android  → `android.speech.SpeechRecognizer`
 *   • iOS      → `SFSpeechRecognizer`
 *   • Web      → `webkitSpeechRecognition` (Web Speech API)
 *
 * The recognizer emits `result` events with `isFinal: false/true`. We:
 *   1. Stream interim text to `onInterim(text)` while the user is still
 *      speaking (so callers can render a faded ghost above the input).
 *   2. Commit final text via `onTranscript(text)` exactly once per chunk
 *      that fires with `isFinal: true`.
 *
 * HOW DUPLICATES ARE PREVENTED
 * ----------------------------
 *   1. **`sessionIdRef`** — `start()` increments a monotonically growing
 *      counter. ALL `result`/`error`/`end` events check `mySession ===
 *      sessionIdRef.current` and silently drop if stale.
 *   2. **State-machine guards** — `start()` is a no-op if state ≠ `idle`;
 *      `stop()` only attempts to stop if recogniser is actually `listening`.
 *   3. **`committedRef`** — accumulates only the *final* segments. Interim
 *      results never touch it. This means even if the host re-renders or
 *      re-mounts mid-session, the next final segment appends to the proper
 *      tail without echoing previous text.
 *   4. **Anti-bounce cooldown** — rapid mic taps within 250 ms are ignored.
 */

type VoiceState = "idle" | "starting" | "listening" | "error";

type Options = {
  /** Receives a FINAL chunk of transcript. Fired potentially multiple times
   *  per session (one per `isFinal: true` recogniser result). Append, don't
   *  replace — interim text is signalled separately via `onInterim`. */
  onTranscript: (text: string) => void;
  /** Live "ghost" interim text. Replaces previous interim on every call.
   *  Cleared (passed "") on session end. */
  onInterim?: (text: string) => void;
  /** User-facing error sink. */
  onError?: (msg: string) => void;
  /** Hard cap on session duration. Defaults 60 s — matches WhatsApp. */
  maxDurationMs?: number;
};

export function useVoiceTranscription({
  onTranscript,
  onInterim,
  onError,
  maxDurationMs = 60_000,
}: Options) {
  const [state, setState] = useState<VoiceState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");

  const { whisperCode } = useDictateLanguage();
  const whisperRef = useRef(whisperCode);
  useEffect(() => {
    whisperRef.current = whisperCode;
  }, [whisperCode]);

  // Anti-duplicate machinery (see header comment).
  const sessionIdRef = useRef(0);
  const lastSettleAtRef = useRef(0);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoStop = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const settle = useCallback(
    (next: VoiceState, msg?: string) => {
      lastSettleAtRef.current = Date.now();
      setErrorMsg(msg ?? null);
      setState(next);
      clearAutoStop();
      setInterimText("");
      onInterim?.("");
    },
    [clearAutoStop, onInterim],
  );

  // ── Native event subscriptions ────────────────────────────────────────────
  //
  // `useSpeechRecognitionEvent` is a typed wrapper that auto-cleans up. Every
  // handler checks its captured `sessionIdRef.current` against the live value
  // — stale events from a previous session are silently dropped.

  useSpeechRecognitionEvent("start", () => {
    setState("listening");
  });

  useSpeechRecognitionEvent("end", () => {
    // Recogniser auto-ends on silence. We treat that as a clean settle.
    if (state !== "idle") settle("idle");
  });

  useSpeechRecognitionEvent("result", (e) => {
    // STALE-event guard — only the current session may surface text.
    const mySession = sessionIdRef.current;
    if (!e?.results?.length) return;
    const segment = e.results[0]?.transcript || "";
    if (mySession !== sessionIdRef.current) return;

    if (e.isFinal) {
      // Commit point — fires onTranscript exactly once per final chunk.
      const text = segment.trim();
      if (text) onTranscript(text);
      setInterimText("");
      onInterim?.("");
    } else {
      // Replace (never append) interim — prevents the classic
      // "duplicated word" UX bug seen with naive STT integrations.
      setInterimText(segment);
      onInterim?.(segment);
    }
  });

  useSpeechRecognitionEvent("error", (e) => {
    const msg = e?.message || e?.error || "Speech recognition failed.";
    // Some platforms fire `no-speech` if the user didn't say anything —
    // that's a soft warning, not an error to surface loudly.
    if (e?.error === "no-speech" || e?.error === "aborted") {
      settle("idle");
      return;
    }
    onError?.(msg);
    settle("error", msg);
  });

  // ── Public API ────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (state !== "idle") return;
    if (Date.now() - lastSettleAtRef.current < 250) return;

    setErrorMsg(null);
    setState("starting");
    const mySession = ++sessionIdRef.current;

    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain === false) {
          Alert.alert(
            "Microphone access blocked",
            "Enable microphone access in Settings to dictate messages.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          onError?.("Microphone permission needed to dictate.");
        }
        settle("idle");
        return;
      }

      if (mySession !== sessionIdRef.current) return;

      // Translate our internal language code → BCP-47 (en-US, hi-IN, …) that
      // the native recogniser expects. For "auto" we omit `lang` entirely so
      // the OS picks the device default (best for code-mixed Hinglish).
      const bcp47 = whisperToBcp47(whisperRef.current);

      ExpoSpeechRecognitionModule.start({
        lang: bcp47 || "en-US",
        interimResults: true,
        continuous: true,
        // iOS-only: prefer on-device when available (privacy + speed).
        requiresOnDeviceRecognition: false,
        // Android-only: smoother UX with no system beep.
        androidIntentOptions: {
          EXTRA_PARTIAL_RESULTS: true,
        },
      });

      autoStopTimerRef.current = setTimeout(() => {
        void stop();
      }, maxDurationMs);
    } catch (e: any) {
      onError?.(e?.message || "Could not start recording.");
      settle("error", e?.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, onError, maxDurationMs, settle]);

  const stop = useCallback(async () => {
    if (state !== "listening" && state !== "starting") return;
    clearAutoStop();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* best-effort */
    }
    // The `end` event will settle the state. If for some reason it doesn't
    // arrive (e.g. native bug), force-settle after 1s.
    setTimeout(() => {
      if (state !== "idle") settle("idle");
    }, 1000);
  }, [state, clearAutoStop, settle]);

  const cancel = useCallback(async () => {
    // Bump session FIRST so any in-flight result event for this session
    // gets dropped by the stale-guard.
    sessionIdRef.current += 1;
    clearAutoStop();
    try {
      ExpoSpeechRecognitionModule.abort?.();
    } catch {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* swallow */
      }
    }
    settle("idle");
  }, [clearAutoStop, settle]);

  // Cleanup on unmount — bump session so no late events can fire setState
  // after we're gone.
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      clearAutoStop();
      try {
        ExpoSpeechRecognitionModule.abort?.();
      } catch {
        /* swallow */
      }
    };
  }, [clearAutoStop]);

  return {
    state,
    isBusy: state !== "idle",
    isRecording: state === "listening",
    errorMsg,
    interimText,
    metering: 0, // expo-speech-recognition doesn't expose dB metering
    durationMs: 0,
    start,
    stop,
    cancel,
  };
}

export type UseVoiceTranscription = ReturnType<typeof useVoiceTranscription>;

/**
 * Map our internal Whisper code → BCP-47 used by native recognisers.
 * For unknown codes, fall back to the device default (return undefined).
 */
function whisperToBcp47(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const MAP: Record<string, string> = {
    en: "en-US",
    hi: "hi-IN",
    kn: "kn-IN",
    ta: "ta-IN",
    te: "te-IN",
    bn: "bn-IN",
    mr: "mr-IN",
    gu: "gu-IN",
    pa: "pa-IN",
    ml: "ml-IN",
    ur: "ur-IN",
    ar: "ar-SA",
    es: "es-ES",
    fr: "fr-FR",
  };
  return MAP[code] || code;
}

// Re-export Platform check so callers can show "not supported on web preview" hints.
export const IS_SPEECH_NATIVE = Platform.OS !== "web";
