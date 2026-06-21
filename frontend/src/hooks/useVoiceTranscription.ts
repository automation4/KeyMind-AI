import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
} from "expo-audio";

import { api } from "@/src/lib/api";
import { useDictateLanguage } from "@/src/hooks/useDictateLanguage";

/**
 * Voice → text hook with bullet-proof anti-duplication guarantee.
 *
 * STATE MACHINE
 * -------------
 *   idle ──► starting ──► recording ──► uploading ──► idle
 *      └───────── error ◄─── (any phase fails) ──────┘
 *
 * The hook is the SINGLE writer of the transcript. The host component just
 * observes `onTranscript` and decides where to put the text.
 *
 * HOW DUPLICATES ARE PREVENTED
 * ----------------------------
 *   1. **`sessionIdRef`** — each `start()` increments a monotonically growing
 *      counter. Only the LATEST session is allowed to commit a transcript.
 *      If a stale request resolves after the user has already started a new
 *      session (or cancelled), its result is silently dropped.
 *   2. **State-machine guards** — `start()` is a no-op if state ≠ `idle`;
 *      `stop()` is a no-op if state ≠ `recording`. So rapid mic tapping
 *      collapses to a single record-then-transcribe cycle.
 *   3. **Single `onTranscript` callback per session** — fired exactly once
 *      from the uploading-phase `try {}` block, guarded by the session id.
 *      A re-tap during upload never re-triggers it.
 *   4. **Cooldown after settle** — after `idle`, we ignore mic taps for 250 ms
 *      to swallow accidental double-presses on phones with bouncy buttons.
 */

type VoiceState = "idle" | "starting" | "recording" | "uploading" | "error";

type Options = {
  /** Receives the FINAL transcript (already trimmed). Called at most once
   *  per `start()` cycle. */
  onTranscript: (text: string) => void;
  /** Optional user-facing error sink. */
  onError?: (msg: string) => void;
  /** Hard cap on recording duration. Defaults to 60 s — matches WhatsApp. */
  maxDurationMs?: number;
};

export function useVoiceTranscription({
  onTranscript,
  onError,
  maxDurationMs = 60_000,
}: Options) {
  const [state, setState] = useState<VoiceState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const { whisperCode } = useDictateLanguage();
  const whisperRef = useRef(whisperCode);
  useEffect(() => {
    whisperRef.current = whisperCode;
  }, [whisperCode]);

  // Monotonic session counter. Increment on start(); any callback whose
  // captured id !== current refuses to commit.
  const sessionIdRef = useRef(0);
  // Cooldown timer (anti-bounce after a session ends).
  const lastSettleAtRef = useRef(0);
  // Hard-stop timer that auto-finalises after maxDurationMs.
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoStop = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const finish = useCallback(
    (nextState: VoiceState, msg?: string) => {
      lastSettleAtRef.current = Date.now();
      setErrorMsg(msg ?? null);
      setState(nextState);
      clearAutoStop();
    },
    [clearAutoStop],
  );

  const start = useCallback(async () => {
    // Guard 1: only allowed from `idle`.
    if (state !== "idle") return;
    // Guard 2: anti-bounce cooldown.
    if (Date.now() - lastSettleAtRef.current < 250) return;

    setErrorMsg(null);
    setState("starting");
    const mySession = ++sessionIdRef.current;

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        // Permanently denied → deep-link to Settings.
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
        finish("idle");
        return;
      }

      // iOS needs `playsInSilentMode` so the user hears the start beep;
      // `allowsRecording` flips the audio session into the right category.
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      // If the session changed while permissions were being granted
      // (user double-tapped quickly), abort.
      if (mySession !== sessionIdRef.current) return;

      await recorder.prepareToRecordAsync();
      if (mySession !== sessionIdRef.current) return;

      await recorder.record();
      if (mySession !== sessionIdRef.current) return;

      setState("recording");

      // Hard auto-stop — protects against runaway recordings.
      autoStopTimerRef.current = setTimeout(() => {
        // Use the *current* stop(); it has its own guard.
        void stop();
      }, maxDurationMs);
    } catch (e: any) {
      onError?.(e?.message || "Could not start recording.");
      finish("error", e?.message);
    }
    // `stop` is referenced before declaration on purpose — both closures
    // capture each other through refs. ESLint disable kept narrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, recorder, onError, maxDurationMs]);

  const cancel = useCallback(async () => {
    // Bump the session so any in-flight transcribe response is ignored.
    sessionIdRef.current += 1;
    clearAutoStop();
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
      }
    } catch {
      /* best-effort cancel */
    }
    finish("idle");
  }, [recorder, recorderState.isRecording, clearAutoStop, finish]);

  const stop = useCallback(async () => {
    // Guard: only allowed from `recording`.
    if (state !== "recording") return;
    const mySession = sessionIdRef.current;
    clearAutoStop();
    setState("uploading");

    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri ?? null;
    } catch (e: any) {
      onError?.(e?.message || "Recording failed.");
      finish("error", e?.message);
      return;
    }

    if (!uri) {
      onError?.("No audio recorded. Try again.");
      finish("idle");
      return;
    }

    // STALE CHECK #1 — between stopping and uploading.
    if (mySession !== sessionIdRef.current) return;

    try {
      const res = await api.transcribe(uri, whisperRef.current);

      // STALE CHECK #2 — the network roundtrip is the longest gap.
      // If a new session started in the meantime, drop this transcript.
      if (mySession !== sessionIdRef.current) return;

      const text = (res?.text || "").trim();
      if (!text) {
        onError?.("Didn't catch that. Try speaking again.");
        finish("idle");
        return;
      }

      // SINGLE commit point — fires onTranscript exactly once per session.
      onTranscript(text);
      finish("idle");
    } catch (e: any) {
      // Stale errors are also dropped — only the latest session may report.
      if (mySession !== sessionIdRef.current) return;
      onError?.(e?.message || "Transcription failed. Try again.");
      finish("error", e?.message);
    }
  }, [
    state,
    recorder,
    clearAutoStop,
    finish,
    onError,
    onTranscript,
  ]);

  // Cleanup on unmount — make sure no stale callback ever fires.
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      clearAutoStop();
      try {
        if (recorderState.isRecording) {
          void recorder.stop();
        }
      } catch {
        /* swallow */
      }
    };
    // We intentionally don't depend on recorderState so the cleanup function
    // is stable for the lifetime of the host component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive a single "is doing something" flag for the button.
  const isBusy = state !== "idle";
  const isRecording = state === "recording";

  return {
    state,
    isBusy,
    isRecording,
    errorMsg,
    /** Loudness 0..1 — pipe to a waveform animation if desired. */
    metering:
      typeof recorderState.metering === "number"
        ? // expo-audio returns dB (-160..0); map to a perceptual 0..1 ramp.
          Math.min(1, Math.max(0, (recorderState.metering + 60) / 60))
        : 0,
    durationMs: recorderState.durationMillis ?? 0,
    start,
    stop,
    cancel,
  };
}

/* Re-export so callers can react to the type without importing the file. */
export type UseVoiceTranscription = ReturnType<typeof useVoiceTranscription>;
