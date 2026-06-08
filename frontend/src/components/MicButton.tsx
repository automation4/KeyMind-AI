import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Animated, Easing, Alert, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
} from "expo-audio";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

type Props = {
  /** Receives the recognized text. Called once per successful transcription. */
  onTranscribe: (text: string) => void;
  /** Optional: tell Whisper which language to expect (e.g. "hi", "en"). Otherwise auto-detect. */
  language?: string;
  /** Size of the round button. */
  size?: number;
  /** Optional custom style for the wrapper. */
  style?: any;
};

const MAX_RECORD_SECONDS = 60;

/**
 * Tap to start recording, tap again to stop & transcribe via Whisper-1.
 * Handles permissions, displays a pulsing red mic + timer while recording,
 * and shows a spinner during transcription.
 */
export function MicButton({ onTranscribe, language, size = 44, style }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  const isRecording = !!state?.isRecording;

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.25, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulse, { toValue: 1.0,  duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]),
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [isRecording, pulse]);

  // Elapsed-seconds counter
  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      tickRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= MAX_RECORD_SECONDS) {
            stop().catch(() => undefined);
          }
          return s + 1;
        });
      }, 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const ensurePermission = async (): Promise<boolean> => {
    let perm = await getRecordingPermissionsAsync();
    if (perm.status === "granted") return true;
    if (perm.canAskAgain) {
      perm = await requestRecordingPermissionsAsync();
      if (perm.status === "granted") return true;
    }
    Alert.alert(
      "Microphone access needed",
      "KeyMind needs the microphone to dictate text. Enable it in Settings to continue.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  };

  const start = async () => {
    try {
      const ok = await ensurePermission();
      if (!ok) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e: any) {
      console.warn("Recording start failed:", e?.message || e);
      Alert.alert("Couldn't start recording", e?.message || "Try again.");
    }
  };

  const stop = async () => {
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        Alert.alert("Empty recording", "Didn't catch anything. Try again.");
        return;
      }
      if (elapsed < 1) {
        // Too short to send to Whisper
        Alert.alert("Hold a bit longer", "Recording was too short. Try speaking for at least a second.");
        return;
      }
      setBusy(true);
      const res = await api.transcribe(uri, language);
      const text = (res.text || "").trim();
      if (!text) {
        Alert.alert("Nothing heard", "We couldn't make out any speech. Try again in a quieter spot.");
        return;
      }
      onTranscribe(text);
    } catch (e: any) {
      Alert.alert("Transcription failed", e?.detail || e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onPress = () => {
    if (busy) return;
    if (isRecording) stop();
    else start();
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <View style={[styles.wrap, style]} testID="mic-button-wrap">
      {isRecording && (
        <View style={styles.timerPill}>
          <View style={styles.recDot} />
          <Text style={styles.timerText}>{mm}:{ss}</Text>
        </View>
      )}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.75}
          disabled={busy}
          style={[
            styles.btn,
            {
              width: size, height: size, borderRadius: size / 2,
              backgroundColor: isRecording ? "#ff3b30" : COLORS.surface,
            },
          ]}
          testID="mic-button"
          accessibilityLabel={isRecording ? "Stop recording" : "Start voice input"}
        >
          {busy ? (
            <ActivityIndicator color={isRecording ? COLORS.bg : COLORS.text} />
          ) : (
            <Ionicons
              name={isRecording ? "square" : "mic"}
              size={Math.round(size * 0.5)}
              color={isRecording ? COLORS.bg : COLORS.text}
            />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  btn: {
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  timerPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.bg, borderWidth: 2, borderColor: COLORS.border,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ff3b30" },
  timerText: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1 },
});
