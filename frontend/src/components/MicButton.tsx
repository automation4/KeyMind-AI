import React, { useEffect, useRef } from "react";
import {
  Animated,
  ActivityIndicator,
  Easing,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { COLORS, RADIUS } from "@/src/lib/theme";
import { useTheme } from "@/src/contexts/ThemeContext";
import { contrastOn } from "@/src/lib/colorUtils";
import {
  useVoiceTranscription,
  UseVoiceTranscription,
} from "@/src/hooks/useVoiceTranscription";

/**
 * Mic button for the Chat composer.
 *
 * Visual states:
 *   idle       — mic icon, accent background
 *   starting   — spinner (very brief — permission prompt / prepare)
 *   recording  — red circle + pulse + square "stop" glyph
 *   uploading  — spinner ("transcribing…")
 *
 * Anti-duplicate guarantees are upstream in `useVoiceTranscription` — the
 * button is *just* the trigger surface.
 */
type Props = {
  /** Called with the final transcript. Append to your composer state here. */
  onTranscript: (text: string) => void;
  /** Optional UI error sink (toast / snackbar). */
  onError?: (msg: string) => void;
  /** Size in pixels (default 40 — matches the chat send button). */
  size?: number;
  /** Test ID for automation. */
  testID?: string;
};

export const MicButton: React.FC<Props> = ({
  onTranscript,
  onError,
  size = 40,
  testID = "mic-button",
}) => {
  const { accentColor } = useTheme();

  const voice = useVoiceTranscription({ onTranscript, onError });

  // Pulse the recording indicator. Driven by native animations so it doesn't
  // hitch even while the JS thread is busy with FormData / fetch().
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (voice.isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 600,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 600,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulse.setValue(0);
    }
  }, [voice.isRecording, pulse]);

  const onPress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    if (voice.state === "idle") {
      void voice.start();
    } else if (voice.state === "recording") {
      void voice.stop();
    } else if (voice.state === "uploading" || voice.state === "starting") {
      // Mid-cycle re-tap → ignore (already going); long-press would cancel
      // but the simple flow keeps the contract obvious for users.
    }
  };

  // Long-press while recording = cancel (don't transcribe).
  const onLongPress = () => {
    if (voice.state === "recording") {
      void voice.cancel();
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        ).catch(() => {});
      }
    }
  };

  const baseSize = { width: size, height: size, borderRadius: size / 2 };
  const isUploading = voice.state === "uploading" || voice.state === "starting";

  if (voice.isRecording) {
    // Distinct "Recording" state — red, pulsing halo, square stop icon.
    const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
    const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
    return (
      <View style={baseSize} testID={`${testID}-recording`}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            baseSize,
            { backgroundColor: "#ff3b30", transform: [{ scale: haloScale }], opacity: haloOpacity },
          ]}
        />
        <TouchableOpacity
          accessibilityLabel="Stop recording"
          accessibilityHint="Long-press to cancel without sending"
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={400}
          activeOpacity={0.85}
          style={[styles.btn, baseSize, { backgroundColor: "#ff3b30" }]}
          testID={testID}
        >
          <Ionicons name="square" size={Math.round(size * 0.42)} color="#ffffff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      accessibilityLabel={isUploading ? "Transcribing" : "Dictate message"}
      onPress={onPress}
      disabled={isUploading}
      activeOpacity={0.85}
      style={[
        styles.btn,
        baseSize,
        { backgroundColor: accentColor },
        isUploading && { opacity: 0.7 },
      ]}
      testID={testID}
    >
      {isUploading ? (
        <ActivityIndicator size="small" color={contrastOn(accentColor)} />
      ) : (
        <Ionicons name="mic" size={Math.round(size * 0.5)} color={contrastOn(accentColor)} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
  },
  halo: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});

// Re-export the hook type for callers that want to drive the button from outside.
export type { UseVoiceTranscription };
