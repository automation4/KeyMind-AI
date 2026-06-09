import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";
import {
  DICTATE_LANGUAGES,
  DEFAULT_DICTATE_LANG,
  findDictateLanguage,
} from "@/src/lib/dictateLanguages";
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

const LANG_STORAGE_KEY = "keymind:dictate_lang";

/**
 * Streaming voice-input button (Google-Voice style).
 *  - Tap once  -> start listening; words stream into the text box as you speak.
 *  - Tap again -> stop. Long-press (or tap chip) -> language picker.
 *  - Requires a development/production build (expo-speech-recognition native module).
 */
export function MicButton({
  onFinal,
  onInterim,
  onListeningChange,
  size = 44,
  style,
}: Props) {
  const [lang, setLang] = useState<string>(DEFAULT_DICTATE_LANG);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  // Restore last-used language
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
        if (stored && findDictateLanguage(stored)) setLang(stored);
      } catch {
        // ignore
      }
    })();
  }, []);

  const persistLang = useCallback(async (code: string) => {
    setLang(code);
    try {
      await AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // ignore
    }
  }, []);

  const { listening, interim, error, supported, start, stop } =
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
      // Silently ignore "no-speech" — common and noisy.
      Alert.alert("Voice input", error);
    }
  }, [error]);

  const toggle = useCallback(async () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => undefined);
    }
    if (listening) {
      await stop();
    } else {
      await start();
    }
  }, [listening, start, stop]);

  const meta = findDictateLanguage(lang);

  return (
    <View style={[styles.wrap, style]} testID="mic-button-wrap">
      {/* Language chip — tap to change */}
      <TouchableOpacity
        onPress={() => setPickerOpen(true)}
        style={styles.langChip}
        activeOpacity={0.7}
        testID="mic-lang-chip"
        accessibilityLabel={`Voice input language: ${meta?.label ?? lang}`}
      >
        <Text style={styles.langChipText} numberOfLines={1}>
          {meta?.flag ?? ""} {(meta?.code || lang).toUpperCase()}
        </Text>
      </TouchableOpacity>

      {/* Mic button */}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <TouchableOpacity
          onPress={toggle}
          onLongPress={() => setPickerOpen(true)}
          delayLongPress={350}
          activeOpacity={0.75}
          style={[
            styles.btn,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: listening ? "#ff3b30" : COLORS.surface,
            },
          ]}
          testID="mic-button"
          accessibilityLabel={listening ? "Stop voice input" : "Start voice input"}
        >
          <Ionicons
            name={listening ? "square" : "mic"}
            size={Math.round(size * 0.5)}
            color={listening ? COLORS.bg : COLORS.text}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Live interim indicator (small dot + waveform-ish bars while we hear something) */}
      {listening && (
        <View style={styles.liveBadge} pointerEvents="none">
          <View style={[styles.liveDot, !!interim && styles.liveDotActive]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}

      {/* Language picker modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.sheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Voice input language</Text>
            <Text style={styles.sheetSubtitle}>
              {supported
                ? "Speak in this language — words appear in real time."
                : "Native voice typing isn't available in this preview build."}
            </Text>
            <FlatList
              data={DICTATE_LANGUAGES}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.code === lang;
                return (
                  <TouchableOpacity
                    style={[styles.langRow, selected && styles.langRowSel]}
                    onPress={async () => {
                      await persistLang(item.code);
                      setPickerOpen(false);
                    }}
                  >
                    <Text style={styles.langFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.langLabel}>{item.label}</Text>
                      <Text style={styles.langNative} numberOfLines={1}>
                        {item.nativeName} · {item.code}
                      </Text>
                    </View>
                    {selected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={COLORS.text}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  langChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    maxWidth: 78,
  },
  langChipText: {
    fontSize: 10,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
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

  // Picker modal styles
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: "78%",
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: FONT.black,
    color: COLORS.text,
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  langRowSel: { backgroundColor: COLORS.bg },
  langFlag: { fontSize: 22 },
  langLabel: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  langNative: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
