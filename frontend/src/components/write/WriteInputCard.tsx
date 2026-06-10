import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { MicButton } from "@/src/components/MicButton";
import { DictateLanguagePicker } from "@/src/components/DictateLanguagePicker";
import { api } from "@/src/lib/api";

type Props = {
  text: string;
  onChangeText: (v: string) => void;
  onError?: (msg: string) => void;
  onClearError?: () => void;
  onToast?: () => void;
};

export function WriteInputCard({
  text,
  onChangeText,
  onError,
  onClearError,
  onToast,
}: Props) {
  const [ocrBusy, setOcrBusy] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [listening, setListening] = React.useState(false);

  // While listening we display: committed text + " " + interim (read-only feel).
  const displayedText = React.useMemo(() => {
    if (!interim) return text;
    if (!text) return interim;
    const needsSpace = !/\s$/.test(text);
    return text + (needsSpace ? " " : "") + interim;
  }, [text, interim]);

  const wordCount = React.useMemo(
    () =>
      displayedText.trim()
        ? displayedText.trim().split(/\s+/).length
        : 0,
    [displayedText],
  );

  const appendFinal = React.useCallback(
    (spoken: string) => {
      const clean = spoken.trim();
      if (!clean) return;
      const prev = text;
      const merged = !prev
        ? clean
        : prev +
          (/[.!?…\n]\s*$/.test(prev)
            ? " "
            : prev.endsWith(" ")
            ? ""
            : " ") +
          clean;
      onChangeText(merged);
      onClearError?.();
    },
    [text, onChangeText, onClearError],
  );

  const copy = async (s: string) => {
    await Clipboard.setStringAsync(s);
    onToast?.();
  };

  const handleUpload = async () => {
    onClearError?.();
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          onError?.("Photo library permission needed to upload an image.");
          return;
        }
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      let b64 = asset.base64;
      if (!b64 && asset.uri) {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        b64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
          r.readAsDataURL(blob);
        });
      }
      if (!b64) {
        onError?.("Could not read the selected image.");
        return;
      }
      setOcrBusy(true);
      const res = await api.ocr(b64);
      if (!res.text) {
        onError?.("No readable text found in the image.");
        return;
      }
      onChangeText(text ? text.trimEnd() + "\n" + res.text : res.text);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {},
        );
      }
    } catch (e: any) {
      onError?.(e?.message || "Image extraction failed");
    } finally {
      setOcrBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Language chip above the card (top-right) */}
      <View style={styles.langRow}>
        <DictateLanguagePicker compact />
      </View>
      <View style={styles.inputCard}>
      <TextInput
        value={displayedText}
        onChangeText={(v) => {
          if (listening) {
            // Ignore manual edits while voice is active; they would conflict
            // with the incoming interim stream. Re-route as final-text update
            // by stopping listening implicitly: just write to committed text
            // if user is appending after the existing committed portion.
            return;
          }
          onChangeText(v);
          onClearError?.();
        }}
        multiline
        editable={!listening}
        placeholder="Paste, type, or hold the mic to dictate…"
        placeholderTextColor={COLORS.textMuted}
        style={[
          styles.input,
          { paddingRight: 52 },
          listening && styles.inputListening,
        ]}
        testID="writer-textinput"
      />
      <View style={styles.micFloater} pointerEvents="box-none">
        <MicButton
          size={40}
          onFinal={appendFinal}
          onInterim={setInterim}
          onListeningChange={setListening}
        />
      </View>
      <View style={styles.inputFooter}>
        <Text style={styles.meta}>{wordCount} WORDS</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={handleUpload}
            disabled={ocrBusy}
            style={[styles.iconBtn, { backgroundColor: COLORS.mint }]}
            testID="upload-image-btn"
            accessibilityLabel={ocrBusy ? "Reading image" : "Upload image"}
          >
            {ocrBusy ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Ionicons name="image-outline" size={20} color={COLORS.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => copy(text)}
            disabled={!text}
            style={styles.iconBtn}
            testID="copy-input-btn"
            accessibilityLabel="Copy text"
          >
            <Ionicons name="copy-outline" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onChangeText("")}
            disabled={!text}
            style={styles.iconBtn}
            testID="clear-input-btn"
            accessibilityLabel="Clear text"
          >
            <Ionicons name="close" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  langRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 2,
  },
  inputCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    ...SHADOW.brutal,
    position: "relative",
  },
  micFloater: { position: "absolute", top: 10, right: 10 },
  input: {
    minHeight: 140,
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.text,
    fontWeight: FONT.regular,
    textAlignVertical: "top",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inputFooter: { marginTop: 12, gap: 10 },
  inputListening: {
    color: COLORS.text,
  },
  actionRow: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  meta: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
  },
});
