import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

// Lazy import so that the bundle still builds in environments where the
// native module is missing (we surface a clear error at runtime instead).
let ESR: any = null;
let useSREvent: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("expo-speech-recognition");
  ESR = mod.ExpoSpeechRecognitionModule;
  useSREvent = mod.useSpeechRecognitionEvent;
} catch (e) {
  // Module not linked (e.g. running in Expo Go) — hook will return an error.
  ESR = null;
  useSREvent = null;
}

export type StreamingSTTOptions = {
  language: string;
  /** Called once for each "final" utterance (sentence-ish chunk). */
  onFinal?: (text: string) => void;
  /** Called every time the live interim transcript updates. */
  onInterim?: (text: string) => void;
  /** Called when recognition fully stops (graceful or error). */
  onEnd?: () => void;
};

export type StreamingSTTState = {
  /** True while engine is actively transcribing. */
  listening: boolean;
  /** Current uncommitted partial transcript. */
  interim: string;
  /** Last error message (cleared on next start()). */
  error: string | null;
  /** True if the native module is available on this platform/build. */
  supported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  abort: () => Promise<void>;
};

/**
 * useStreamingSpeechRecognition
 *
 * Google-Voice-style streaming STT via expo-speech-recognition.
 *  - iOS  -> SFSpeechRecognizer (interim + final)
 *  - Android -> SpeechRecognizer (interim + final)
 *  - Web  -> Web Speech API (Chrome/Edge only)
 *
 * NOTE: requires a development/production build. Will NOT work in Expo Go.
 */
export function useStreamingSpeechRecognition(
  opts: StreamingSTTOptions,
): StreamingSTTState {
  const { language, onFinal, onInterim, onEnd } = opts;

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onFinalRef = useRef(onFinal);
  const onInterimRef = useRef(onInterim);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onFinalRef.current = onFinal;
    onInterimRef.current = onInterim;
    onEndRef.current = onEnd;
  }, [onFinal, onInterim, onEnd]);

  const supported = !!ESR && !!useSREvent;

  // Track which final results we've already emitted to avoid duplicates.
  // Reset on every new start() call AND whenever the results array shrinks
  // (which indicates the native engine restarted mid-session on Android).
  const emittedFinalCountRef = useRef(0);
  const lastResultsLenRef = useRef(0);

  // Subscribe to native/web speech events (no-op if module missing).
  if (useSREvent) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSREvent("result", (event: any) => {
      try {
        const results = event?.results ?? [];
        if (!results.length) return;

        // Safety: if the array shrunk vs. last event, the native engine
        // restarted mid-session (Android). Reset our dedup counter.
        if (results.length < lastResultsLenRef.current) {
          emittedFinalCountRef.current = 0;
        }
        lastResultsLenRef.current = results.length;

        // Walk every result. Each result has `isFinal` and an array of
        // alternatives (best at index 0). We emit each *new* final result
        // exactly once (using emittedFinalCountRef) and recompute the
        // current interim from any non-final tail.
        let finalsSeen = 0;
        let interimText = "";

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (!r) continue;
          const alt = Array.isArray(r) ? r[0] : r[0] ?? r;
          const transcript: string =
            (alt && (alt.transcript || alt[0]?.transcript)) ||
            (typeof r?.transcript === "string" ? r.transcript : "") ||
            "";
          const isFinal: boolean = !!(r?.isFinal ?? event?.isFinal);

          if (isFinal) {
            finalsSeen += 1;
            // Only emit if we haven't already emitted this index.
            if (finalsSeen > emittedFinalCountRef.current && transcript) {
              emittedFinalCountRef.current = finalsSeen;
              onFinalRef.current?.(transcript);
            }
          } else if (transcript) {
            interimText = interimText
              ? `${interimText} ${transcript}`
              : transcript;
          }
        }

        // Always update interim (may become empty when an utterance finalizes).
        setInterim(interimText);
        if (interimText) onInterimRef.current?.(interimText);
      } catch (e) {
        // swallow — don't crash on weird event payloads
      }
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSREvent("end", () => {
      setListening(false);
      setInterim("");
      onEndRef.current?.();
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSREvent("error", (event: any) => {
      const code = event?.error || "unknown";
      const msg =
        event?.message ||
        (code === "no-speech"
          ? "Didn't hear anything. Try again."
          : code === "not-allowed"
          ? "Microphone permission denied."
          : code === "audio-capture"
          ? "Couldn't access the microphone."
          : code === "service-not-allowed"
          ? "Speech recognition not available on this device."
          : `Recognition error: ${code}`);
      setError(msg);
      setListening(false);
      setInterim("");
    });
  }

  const ensurePermissions = useCallback(async (): Promise<boolean> => {
    if (!ESR) return false;
    try {
      const status = await ESR.requestPermissionsAsync?.();
      // Newer versions return { granted, canAskAgain, expires, status }.
      if (status && typeof status === "object") {
        if (status.granted === true) return true;
        if (status.status === "granted") return true;
      } else if (status === true) {
        return true;
      }
      // Fallback: try start anyway — native side will surface a permission error.
      return true;
    } catch {
      return true;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setInterim("");
    emittedFinalCountRef.current = 0;
    lastResultsLenRef.current = 0;
    if (!ESR) {
      setError(
        "Voice typing isn't available in this preview build. Publish & install the app to use streaming dictation.",
      );
      return;
    }
    try {
      const ok = await ensurePermissions();
      if (!ok) {
        setError("Microphone or speech permission denied.");
        return;
      }
      // Cross-platform start options modeled after the Web Speech API.
      const startOpts: any = {
        lang: language,
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
      };
      // Android-specific tweak: extra timeout so it doesn't cut off after 2s of silence.
      if (Platform.OS === "android") {
        startOpts.androidIntentOptions = {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 0,
        };
      }
      await ESR.start(startOpts);
      setListening(true);
    } catch (e: any) {
      setError(e?.message || "Failed to start voice input");
      setListening(false);
    }
  }, [language, ensurePermissions]);

  const stop = useCallback(async () => {
    if (!ESR) return;
    try {
      await ESR.stop();
    } catch {
      // ignore
    } finally {
      setListening(false);
      setInterim("");
    }
  }, []);

  const abort = useCallback(async () => {
    if (!ESR) return;
    try {
      await ESR.abort();
    } catch {
      // ignore
    } finally {
      setListening(false);
      setInterim("");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ESR && listening) {
        ESR.abort?.().catch?.(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { listening, interim, error, supported, start, stop, abort };
}
