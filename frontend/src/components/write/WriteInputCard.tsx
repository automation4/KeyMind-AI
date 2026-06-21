import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { getWritePlaceholder } from "@/src/lib/localePlaceholder";
import { MicButton } from "@/src/components/MicButton";

type Props = {
  text: string;
  onChangeText: (v: string) => void;
  onError?: (msg: string) => void;
  onClearError?: () => void;
  onToast?: () => void;
};

/**
 * Multiline text input card with image-OCR helpers.
 *
 * - The mic / live dictation feature has been removed app-wide (user request).
 * - The image-picker button lets the user pick an existing photo from their
 *   gallery; the new camera button takes a fresh photo. Both feed the same
 *   `/api/ai/ocr` route for text extraction.
 */
export function WriteInputCard({
  text,
  onChangeText,
  onError,
  onClearError,
  onToast,
}: Props) {
  const [ocrBusy, setOcrBusy] = React.useState(false);

  const wordCount = React.useMemo(
    () => (text.trim() ? text.trim().split(/\s+/).length : 0),
    [text],
  );

  const copy = async (s: string) => {
    await Clipboard.setStringAsync(s);
    onToast?.();
  };

  const extractFromBase64 = React.useCallback(
    async (b64: string) => {
      setOcrBusy(true);
      try {
        const res = await api.ocr(b64);
        if (!res.text) {
          onError?.("No readable text found in the image.");
          return;
        }
        onChangeText(text ? text.trimEnd() + "\n" + res.text : res.text);
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          ).catch(() => {});
        }
      } catch (e: any) {
        onError?.(e?.message || "Image extraction failed");
      } finally {
        setOcrBusy(false);
      }
    },
    [text, onChangeText, onError],
  );

  const assetToBase64 = async (asset: ImagePicker.ImagePickerAsset) => {
    if (asset.base64) return asset.base64;
    if (!asset.uri) return "";
    const resp = await fetch(asset.uri);
    const blob = await resp.blob();
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
      r.readAsDataURL(blob);
    });
  };

  const handleUpload = async () => {
    onClearError?.();
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          // Permanently-denied path: offer Settings deep-link instead of
          // silently failing.
          if (perm.canAskAgain === false) {
            Alert.alert(
              "Photo access blocked",
              "Enable photo access in Settings to extract text from images.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ],
            );
          } else {
            onError?.("Photo library permission needed to upload an image.");
          }
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
      const b64 = await assetToBase64(picked.assets[0]);
      if (!b64) {
        onError?.("Could not read the selected image.");
        return;
      }
      await extractFromBase64(b64);
    } catch (e: any) {
      onError?.(e?.message || "Image extraction failed");
    }
  };

  const handleCamera = async () => {
    onClearError?.();
    // Web has no native camera capture path — fall back to file picker.
    if (Platform.OS === "web") {
      return handleUpload();
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        if (perm.canAskAgain === false) {
          Alert.alert(
            "Camera access blocked",
            "Enable camera access in Settings to capture text from photos.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          onError?.("Camera permission needed to capture text.");
        }
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (shot.canceled || !shot.assets?.length) return;
      const b64 = await assetToBase64(shot.assets[0]);
      if (!b64) {
        onError?.("Could not read the captured photo.");
        return;
      }
      await extractFromBase64(b64);
    } catch (e: any) {
      onError?.(e?.message || "Camera capture failed");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputCard}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            onChangeText(v);
            onClearError?.();
          }}
          multiline
          placeholder={getWritePlaceholder()}
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          testID="writer-textinput"
        />
        <View style={styles.inputFooter}>
          <Text style={styles.meta}>{wordCount} WORDS</Text>
          <View style={styles.actionRow}>
            {/* Mic — live native dictation (real-time interim + final text).
                MicButton owns the text-merge logic, so the host just plumbs
                value/setter and gets the anti-duplicate guarantee for free. */}
            <MicButton
              size={40}
              value={text}
              onChangeText={onChangeText}
              onError={(msg) => onError?.(msg)}
              testID="home-mic-btn"
            />
            {/* Camera — capture a fresh photo and extract its text. */}
            <TouchableOpacity
              onPress={handleCamera}
              disabled={ocrBusy}
              style={styles.iconBtn}
              testID="camera-capture-btn"
              accessibilityLabel="Take a photo to extract text"
            >
              <Ionicons name="camera-outline" size={20} color={COLORS.text} />
            </TouchableOpacity>
            {/* Gallery — pick an existing image and extract its text. */}
            <TouchableOpacity
              onPress={handleUpload}
              disabled={ocrBusy}
              style={styles.iconBtn}
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
              style={[styles.iconBtn, text ? { backgroundColor: "#ff3b30" } : null]}
              testID="clear-input-btn"
              accessibilityLabel="Clear text"
            >
              <Ionicons name="close" size={22} color={text ? "#fff" : COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  inputCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    ...SHADOW.brutal,
  },
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
