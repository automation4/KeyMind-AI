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
  /**
   * The text currently in the composer. The MicButton uses this as a "base"
   * to which interim + final segments are appended. Host passes the live
   * value of the input.
   */
  value: string;
  /** Setter that mirrors `value`. Called with the merged text on every
   *  interim update and final commit. */
  onChangeText: (text: string) => void;
  /** Optional UI error sink (toast / snackbar). */
  onError?: (msg: string) => void;
  /** Size in pixels (default 40 — matches the chat send button). */
  size?: number;
  /** Test ID for automation. */
  testID?: string;
};

export const MicButton: React.FC<Props> = ({
  value,
  onChangeText,
  onError,
  size = 40,
  testID = "mic-button",
}) => {
  const { accentColor } = useTheme();

  // The "frozen" base text captured at the moment recording started.
  // Interim/final segments are appended *to this base* — never to the live
  // value (which itself contains the interim from previous events). This is
  // the foundation of the anti-duplicate guarantee: the merge function is
  // pure and idempotent — calling it multiple times with the same interim
  // produces the same output every time.
  const baseRef = useRef("");
  // Last-final-text — committed text from the recogniser since this session
  // began. Each new final segment appends here; interim text is rendered on
  // top of it as a preview.
  const committedRef = useRef("");

  const merge = (base: string, addition: string) => {
    if (!addition) return base;
    if (!base) return addition;
    return /\s$/.test(base) ? base + addition : base + " " + addition;
  };

  const voice = useVoiceTranscription({
    onTranscript: (finalSeg) => {
      // Promote the committed prefix → this final chunk becomes part of base.
      committedRef.current = merge(committedRef.current, finalSeg);
      onChangeText(merge(baseRef.current, committedRef.current));
    },
    onInterim: (interim) => {
      // Replace the rolling tail with the new interim text.
      // base + committed-so-far + interim — all three are pure projections,
      // so we never duplicate.
      const next = merge(merge(baseRef.current, committedRef.current), interim);
      onChangeText(next);
    },
    onError,
  });

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
      // Snapshot the current input as the immutable "base" for this session.
      // Any further mutation to `value` from outside (e.g. user typing while
      // we're recording — unlikely but possible) is intentionally ignored:
      // the merge function is only allowed to read this frozen base, which
      // is what prevents duplicates if React schedules re-renders out of order.
      baseRef.current = value;
      committedRef.current = "";
      void voice.start();
    } else if (voice.state === "listening") {
      void voice.stop();
    }
  };

  // Long-press while recording = cancel (don't transcribe).
  const onLongPress = () => {
    if (voice.state === "listening") {
      void voice.cancel();
      // Roll back any interim text we already streamed into the input.
      onChangeText(baseRef.current);
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
