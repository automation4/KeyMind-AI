import React, { useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { COLORS, FONT, SHADOW } from "@/src/lib/theme";
import { useTheme } from "@/src/contexts/ThemeContext";
import { useDictateLanguage } from "@/src/hooks/useDictateLanguage";
import { useStreamingSpeechRecognition } from "@/src/hooks/useStreamingSpeechRecognition";

type Props = {
  /** Receives every committed (final) chunk. Multiple chunks may stream during one session. */
  onFinal: (text: string) => void;
  /** Receives the live (uncommitted) partial transcript. Empty string when no interim. */
  onInterim?: (text: string) => void;
  /** Optional callback when listening starts / stops. */
  onListeningChange?: (listening: boolean) => void;
  /** Size of the circular button. */
  size?: number;
  /** Optional wrapper style. */
  style?: any;
};

/**
 * Streaming voice-input button (Google-Voice style).
 *  - Tap        -> toggle listening (start ↔ stop)
 *  - Long-press -> start listening (if idle)
 *  - Words stream into the text box as you speak.
 *  - Requires a development/production build (expo-speech-recognition native module).
 *
 * Language is read from the shared `useDictateLanguage` hook and selected
 * via the `<DictateLanguagePicker>` chip rendered above the input card.
 */
export function MicButton({
  onFinal,
  onInterim,
  onListeningChange,
  size = 44,
  style,
}: Props) {
  const { lang } = useDictateLanguage();
  const { accentColor } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  const { listening, interim, error, start, stop } =
    useStreamingSpeechRecognition({
      language: lang,
      onFinal: (t) => onFinal(t),
      onInterim: (t) => onInterim?.(t),
      onEnd: () => onInterim?.(""),
    });

  // Pulse while listening
  useEffect(() => {
    onListeningChange?.(listening);
    if (listening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulse, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ]),
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [listening, pulse, onListeningChange]);

  // Surface fatal errors in a one-shot alert
  useEffect(() => {
    if (!error) return;
    if (/permission|not-allowed|service-not-allowed/i.test(error)) {
      Alert.alert("Microphone access needed", error, [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
    } else if (/preview build|isn't available/i.test(error)) {
      Alert.alert("Build required", error, [{ text: "OK" }]);
    } else if (!/no-speech|didn't hear/i.test(error)) {
      Alert.alert("Voice input", error);
    }
  }, [error]);

  const hapticTick = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => undefined);
    }
  }, []);

  const toggle = useCallback(async () => {
    hapticTick();
    if (listening) await stop();
    else await start();
  }, [listening, start, stop, hapticTick]);

  const longStart = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
        () => undefined,
      );
    }
    if (!listening) await start();
  }, [listening, start]);

  return (
    <View style={[styles.wrap, style]} testID="mic-button-wrap">
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <TouchableOpacity
          onPress={toggle}
          onLongPress={longStart}
          delayLongPress={300}
          activeOpacity={0.75}
          style={[
            styles.btn,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: listening ? "#ff3b30" : accentColor,
            },
          ]}
          testID="mic-button"
          accessibilityLabel={
            listening ? "Stop voice input" : "Start voice input"
          }
        >
          <Ionicons
            name={listening ? "square" : "mic"}
            size={Math.round(size * 0.5)}
            color={listening ? COLORS.bg : COLORS.text}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Live indicator while listening */}
      {listening && (
        <View style={styles.liveBadge} pointerEvents="none">
          <View style={[styles.liveDot, !!interim && styles.liveDotActive]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOW.brutalSm,
  },
  liveBadge: {
    position: "absolute",
    top: -18,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ff3b30",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  liveDotActive: { backgroundColor: "#fff" },
  liveText: {
    fontSize: 9,
    fontWeight: FONT.black,
    color: "#fff",
    letterSpacing: 1,
  },
});
