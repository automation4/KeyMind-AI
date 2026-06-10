import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, FONT, RADIUS } from "@/src/lib/theme";
import {
  CHAT_RESPONSE_LANGUAGES,
  findChatResponseLang,
} from "@/src/lib/chatResponseLanguages";
import { useChatResponseLanguage } from "@/src/hooks/useChatResponseLanguage";

type Props = {
  style?: any;
  compact?: boolean;
};

/**
 * Standalone chip + bottom-sheet picker for the AI RESPONSE language.
 * Independent from the voice-input (dictation) language chip.
 */
export function ChatResponseLanguagePicker({ style, compact }: Props) {
  const { lang, setLang } = useChatResponseLanguage();
  const [open, setOpen] = useState(false);
  const meta = findChatResponseLang(lang);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={[styles.chip, compact && styles.chipCompact, style]}
        testID="chat-response-lang-chip"
        accessibilityLabel={`AI reply language: ${meta?.label ?? lang}`}
      >
        <Ionicons name="chatbubble-ellipses" size={12} color={COLORS.text} />
        <Text style={styles.chipFlag}>{meta?.flag ?? "✨"}</Text>
        <Text style={styles.chipText} numberOfLines={1}>
          {(meta?.short || lang).toUpperCase()}
        </Text>
        <Ionicons
          name="chevron-down"
          size={12}
          color={COLORS.text}
          style={{ marginLeft: 2 }}
        />
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>AI reply language</Text>
            <Text style={styles.sheetSubtitle}>
              Pick the language & script the AI should reply in. Works for both
              general questions and translations.
            </Text>
            <FlatList
              data={CHAT_RESPONSE_LANGUAGES}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.code === lang;
                return (
                  <TouchableOpacity
                    style={[styles.langRow, selected && styles.langRowSel]}
                    onPress={async () => {
                      await setLang(item.code);
                      setOpen(false);
                    }}
                    testID={`chat-response-lang-${item.code}`}
                  >
                    <Text style={styles.langFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.langLabel}>{item.label}</Text>
                      <Text style={styles.langNative} numberOfLines={1}>
                        {item.hint || item.nativeSample}
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
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.secondary,
    alignSelf: "flex-start",
  },
  chipCompact: { paddingHorizontal: 8, paddingVertical: 3 },
  chipFlag: { fontSize: 14 },
  chipText: {
    fontSize: 11,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
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
    maxHeight: "82%",
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
  langLabel: { fontSize: 15, fontWeight: FONT.bold, color: COLORS.text },
  langNative: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
