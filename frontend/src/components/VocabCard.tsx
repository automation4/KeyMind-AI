import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";

export type VocabData = {
  word?: string;
  part_of_speech?: string;
  meaning_simple?: string;
  tricky_words?: string[];
  meaning_translated?: string;
  tenses?: {
    past?: { english?: string; translated?: string };
    present?: { english?: string; translated?: string };
    future?: { english?: string; translated?: string };
  };
};

// Curated list — covers Indian + popular international + Sanskrit (newly requested)
export const VOCAB_LANGUAGES = [
  "Hindi",
  "Sanskrit",
  "Bengali",
  "Tamil",
  "Telugu",
  "Marathi",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Urdu",
  "English",
  "Spanish",
  "French",
  "German",
  "Arabic",
  "Japanese",
  "Chinese",
] as const;
export type VocabLanguage = (typeof VOCAB_LANGUAGES)[number];

type Props = {
  data: VocabData;
  language: VocabLanguage;
  onChangeLanguage: (lang: VocabLanguage) => void;
  loading?: boolean;
  onTrickyWordPress?: (word: string) => void;
};

export function VocabCard({
  data,
  language,
  onChangeLanguage,
  loading = false,
  onTrickyWordPress,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={styles.card} testID="vocab-card">
      {/* Header: word + part of speech */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.word} testID="vocab-word">
            {data.word || "—"}
          </Text>
          {data.part_of_speech ? (
            <View style={styles.posPill}>
              <Text style={styles.posPillText}>{data.part_of_speech.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Meaning — simple English */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SIMPLE MEANING</Text>
        <Text style={styles.meaningEn} selectable>
          {data.meaning_simple || "—"}
        </Text>
        {data.tricky_words && data.tricky_words.length > 0 ? (
          <View style={styles.trickyRow}>
            <Text style={styles.trickyLabel}>Tricky words in meaning:</Text>
            {data.tricky_words.map((w) => (
              <TouchableOpacity
                key={w}
                onPress={() => onTrickyWordPress?.(w)}
                style={styles.trickyChip}
                testID={`tricky-chip-${w}`}
              >
                <Text style={styles.trickyChipText}>{w}</Text>
                <Ionicons name="search" size={11} color={COLORS.text} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      {/* Language switcher + translated meaning */}
      <View style={styles.section}>
        <View style={styles.translatedHeader}>
          <Text style={styles.sectionLabel}>IN {language.toUpperCase()}</Text>
          <TouchableOpacity
            style={styles.langBtn}
            onPress={() => setPickerOpen((v) => !v)}
            testID="vocab-language-btn"
          >
            <Ionicons name="language" size={13} color={COLORS.text} />
            <Text style={styles.langBtnText}>{language}</Text>
            <Ionicons
              name={pickerOpen ? "chevron-up" : "chevron-down"}
              size={13}
              color={COLORS.text}
            />
          </TouchableOpacity>
        </View>

        {pickerOpen ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.langPickerScroll}
            testID="vocab-language-picker"
          >
            {VOCAB_LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l}
                onPress={() => {
                  onChangeLanguage(l);
                  setPickerOpen(false);
                }}
                style={[
                  styles.langChip,
                  language === l && styles.langChipActive,
                ]}
                testID={`vocab-lang-${l.toLowerCase()}`}
              >
                <Text
                  style={[
                    styles.langChipText,
                    language === l && styles.langChipTextActive,
                  ]}
                >
                  {l}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={COLORS.text} />
            <Text style={styles.loadingText}>Translating to {language}…</Text>
          </View>
        ) : (
          <Text style={styles.meaningNative} selectable testID="vocab-translated">
            {data.meaning_translated || "—"}
          </Text>
        )}
      </View>

      {/* Tense table */}
      {data.tenses ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>USAGE IN TENSES</Text>
          {(["past", "present", "future"] as const).map((t) => {
            const row = data.tenses?.[t];
            if (!row) return null;
            return (
              <View key={t} style={styles.tenseRow} testID={`vocab-tense-${t}`}>
                <View style={styles.tenseBadge}>
                  <Text style={styles.tenseBadgeText}>{t.toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {row.english ? (
                    <Text style={styles.tenseEn} selectable>
                      {row.english}
                    </Text>
                  ) : null}
                  {row.translated && !loading ? (
                    <Text style={styles.tenseNative} selectable>
                      {row.translated}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    padding: 16,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 14,
    ...SHADOW.brutalSm,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  word: { fontSize: 26, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -0.5 },
  posPill: {
    alignSelf: "flex-start", marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.sky,
  },
  posPillText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  meaningEn: { fontSize: 15, color: COLORS.text, lineHeight: 22, fontWeight: FONT.bold },
  trickyRow: {
    marginTop: 4, flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center",
  },
  trickyLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: FONT.bold },
  trickyChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.peach,
  },
  trickyChipText: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text },
  translatedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  langBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: RADIUS.pill, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  langBtnText: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },
  langPickerScroll: { gap: 6, paddingVertical: 4 },
  langChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: RADIUS.pill, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  langChipActive: { backgroundColor: COLORS.text },
  langChipText: { fontSize: 11, fontWeight: FONT.bold, color: COLORS.text },
  langChipTextActive: { color: COLORS.bg },
  loadingRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 6 },
  loadingText: { fontSize: 12, fontWeight: FONT.bold, color: COLORS.textMuted },
  meaningNative: { fontSize: 16, color: COLORS.text, lineHeight: 24, fontWeight: FONT.bold },
  tenseRow: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.borderSoft,
  },
  tenseBadge: {
    minWidth: 70, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.mint,
    alignItems: "center",
  },
  tenseBadgeText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1 },
  tenseEn: { fontSize: 13, color: COLORS.text, fontWeight: FONT.bold, lineHeight: 19 },
  tenseNative: { marginTop: 4, fontSize: 14, color: COLORS.text, fontWeight: FONT.bold, lineHeight: 21, opacity: 0.85 },
});
