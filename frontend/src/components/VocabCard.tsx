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
import { ListenButton } from "@/src/components/ListenButton";

export type VocabData = {
  word?: string;
  part_of_speech?: string;
  meaning_simple?: string;
  tricky_words?: string[];
  meaning_translated?: string;
  meaning_transliterated?: string;
  synonyms?: string[];
  antonyms?: string[];
  spoken_usage?: string;
  spoken_usage_translated?: string;
  spoken_usage_transliterated?: string;
  native_alternative?: string;
  native_alternative_why?: string;
  memory_tip?: string;
  tenses?: {
    past?: { english?: string; translated?: string; transliterated?: string };
    present?: { english?: string; translated?: string; transliterated?: string };
    future?: { english?: string; translated?: string; transliterated?: string };
  };
  idioms_phrases?: Array<{
    english?: string;
    translated?: string;
    transliterated?: string;
  }>;
};

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

// Label shown above the Latin-script transliteration (Hinglish for Hindi, Tanglish for Tamil, etc.)
export function romanLabel(lang: VocabLanguage): string {
  switch (lang) {
    case "Hindi":
    case "Sanskrit":
    case "Marathi":
      return "HINGLISH";
    case "Tamil":
      return "TANGLISH";
    case "Telugu":
      return "TENGLISH";
    case "Bengali":
      return "BANGLISH";
    case "Gujarati":
      return "GUJLISH";
    case "Kannada":
      return "KANGLISH";
    case "Malayalam":
      return "MANGLISH";
    case "Punjabi":
      return "PUNGLISH";
    case "Urdu":
      return "ROMAN URDU";
    case "Arabic":
      return "ROMAN ARABIC";
    case "Japanese":
      return "ROMAJI";
    case "Chinese":
      return "PINYIN";
    default:
      return "ROMAN";
  }
}

// Some languages already use the Latin alphabet — no transliteration line needed.
export function needsRoman(lang: VocabLanguage): boolean {
  return !["English", "Spanish", "French", "German"].includes(lang);
}

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
      {/* Header: word + listen + part of speech */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.wordRow}>
            <Text style={styles.word} testID="vocab-word">
              {data.word || "—"}
            </Text>
            {data.word ? <ListenButton text={data.word} small testID="listen-word" /> : null}
          </View>
          {data.part_of_speech ? (
            <View style={styles.posPill}>
              <Text style={styles.posPillText}>{data.part_of_speech.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Simple meaning */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>SIMPLE MEANING</Text>
          {data.meaning_simple ? (
            <ListenButton text={data.meaning_simple} small testID="listen-meaning" />
          ) : null}
        </View>
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

      {/* Synonyms */}
      {data.synonyms && data.synonyms.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SYNONYMS</Text>
          <View style={styles.chipRow}>
            {data.synonyms.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => onTrickyWordPress?.(s)}
                style={[styles.wordChip, { backgroundColor: COLORS.mint }]}
                testID={`synonym-${s}`}
              >
                <Text style={styles.wordChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Antonyms */}
      {data.antonyms && data.antonyms.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ANTONYMS</Text>
          <View style={styles.chipRow}>
            {data.antonyms.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => onTrickyWordPress?.(a)}
                style={[styles.wordChip, { backgroundColor: COLORS.peach }]}
                testID={`antonym-${a}`}
              >
                <Text style={styles.wordChipText}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {/* Spoken usage */}
      {data.spoken_usage ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>WHEN SPEAKING</Text>
            <ListenButton text={data.spoken_usage} small testID="listen-spoken" />
          </View>
          <Text style={styles.spokenEn} selectable>
            “{data.spoken_usage}”
          </Text>
          {data.spoken_usage_translated && !loading ? (
            <View style={styles.translatedLine}>
              <Text style={styles.spokenNative} selectable>
                {data.spoken_usage_translated}
              </Text>
              <ListenButton
                text={data.spoken_usage_translated}
                small
                compact
                testID="listen-spoken-translated"
              />
            </View>
          ) : null}
          {data.spoken_usage_transliterated && needsRoman(language) && !loading ? (
            <View style={styles.translitWrap}>
              <Text style={styles.translitLabel}>{romanLabel(language)}</Text>
              <Text style={styles.translitText} selectable>
                {data.spoken_usage_transliterated}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Native-speaker alternative */}
      {data.native_alternative ? (
        <View style={[styles.section, styles.altCard]}>
          <Text style={styles.sectionLabel}>NATIVE SPEAKER WOULD SAY</Text>
          <View style={styles.altWordRow}>
            <Text style={styles.altWord} selectable>
              {data.native_alternative}
            </Text>
            <ListenButton text={data.native_alternative} small testID="listen-native" />
          </View>
          {data.native_alternative_why ? (
            <Text style={styles.altWhy} selectable>
              Why: {data.native_alternative_why}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Memory tip */}
      {data.memory_tip ? (
        <View style={[styles.section, styles.memCard]}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="bulb" size={14} color={COLORS.text} />
              <Text style={styles.sectionLabel}>HOW TO REMEMBER</Text>
            </View>
            <ListenButton text={data.memory_tip} small testID="listen-mem" />
          </View>
          <Text style={styles.memText} selectable>
            {data.memory_tip}
          </Text>
        </View>
      ) : null}

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
          <>
            <View style={styles.translatedLine}>
              <Text style={styles.meaningNative} selectable testID="vocab-translated">
                {data.meaning_translated || "—"}
              </Text>
              {data.meaning_translated ? (
                <ListenButton text={data.meaning_translated} small compact testID="listen-translated" />
              ) : null}
            </View>
            {data.meaning_transliterated && needsRoman(language) ? (
              <View style={styles.translitWrap}>
                <Text style={styles.translitLabel}>{romanLabel(language)}</Text>
                <Text style={styles.translitText} selectable testID="vocab-transliterated">
                  {data.meaning_transliterated}
                </Text>
              </View>
            ) : null}
          </>
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
                <View style={{ flex: 1, gap: 6 }}>
                  {row.english ? (
                    <View style={styles.translatedLine}>
                      <Text style={styles.tenseEn} selectable>
                        {row.english}
                      </Text>
                      <ListenButton
                        text={row.english}
                        small
                        compact
                        testID={`listen-tense-${t}-en`}
                      />
                    </View>
                  ) : null}
                  {row.translated && !loading ? (
                    <View style={styles.translatedLine}>
                      <Text style={styles.tenseNative} selectable>
                        {row.translated}
                      </Text>
                      <ListenButton
                        text={row.translated}
                        small
                        compact
                        testID={`listen-tense-${t}-tr`}
                      />
                    </View>
                  ) : null}
                  {row.transliterated && needsRoman(language) && !loading ? (
                    <Text style={styles.tenseTranslit} selectable>
                      {row.transliterated}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Idioms & phrases */}
      {Array.isArray(data.idioms_phrases) && data.idioms_phrases.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>IDIOMS &amp; PHRASES</Text>
          {data.idioms_phrases.slice(0, 5).map((item, idx) => {
            if (!item || (!item.english && !item.translated)) return null;
            return (
              <View key={idx} style={styles.idiomCard} testID={`vocab-idiom-${idx}`}>
                {item.english ? (
                  <View style={styles.translatedLine}>
                    <Text style={styles.idiomEn} selectable>
                      “{item.english}”
                    </Text>
                    <ListenButton
                      text={item.english}
                      small
                      compact
                      testID={`listen-idiom-${idx}-en`}
                    />
                  </View>
                ) : null}
                {item.translated && !loading ? (
                  <View style={styles.translatedLine}>
                    <Text style={styles.idiomNative} selectable>
                      {item.translated}
                    </Text>
                    <ListenButton
                      text={item.translated}
                      small
                      compact
                      testID={`listen-idiom-${idx}-tr`}
                    />
                  </View>
                ) : null}
                {item.transliterated && needsRoman(language) && !loading ? (
                  <Text style={styles.idiomTranslit} selectable>
                    {item.transliterated}
                  </Text>
                ) : null}
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
  wordRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  word: { fontSize: 26, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -0.5 },
  posPill: {
    alignSelf: "flex-start", marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.sky,
  },
  posPillText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1 },

  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  wordChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border,
  },
  wordChipText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.text },

  spokenEn: { fontSize: 14, color: COLORS.text, lineHeight: 22, fontWeight: FONT.bold, fontStyle: "italic" },
  spokenNative: { flex: 1, minWidth: 0, fontSize: 14, color: COLORS.text, lineHeight: 22, fontWeight: FONT.bold, opacity: 0.85 },

  // Shared row for "native-script text + compact LISTEN" — text flexes, icon stays small on the right.
  translatedLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  // Latin-script transliteration block (Hinglish / Tanglish / Tenglish / Romaji / Pinyin etc.)
  translitWrap: {
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.bg,
    gap: 2,
  },
  translitLabel: {
    fontSize: 9,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
  },
  translitText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
    fontWeight: FONT.bold,
    fontStyle: "italic",
  },

  altCard: {
    padding: 12, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.lilac,
  },
  altWordRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  altWord: { fontSize: 17, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -0.3 },
  altWhy: { marginTop: 4, fontSize: 12, color: COLORS.text, lineHeight: 18, fontWeight: FONT.bold, opacity: 0.85 },

  memCard: {
    padding: 12, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.secondary,
  },
  memText: { fontSize: 13, color: COLORS.text, lineHeight: 20, fontWeight: FONT.bold },

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
  meaningNative: { flex: 1, minWidth: 0, fontSize: 16, color: COLORS.text, lineHeight: 24, fontWeight: FONT.bold },

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
  tenseEn: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.text, fontWeight: FONT.bold, lineHeight: 19 },
  tenseNative: { flex: 1, minWidth: 0, fontSize: 14, color: COLORS.text, fontWeight: FONT.bold, lineHeight: 21, opacity: 0.85 },
  tenseTranslit: { fontSize: 12, color: COLORS.textMuted, fontWeight: FONT.bold, lineHeight: 18, fontStyle: "italic" },

  idiomCard: {
    padding: 10,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.sky,
    gap: 6,
  },
  idiomEn: { flex: 1, minWidth: 0, fontSize: 14, color: COLORS.text, fontWeight: FONT.bold, lineHeight: 21, fontStyle: "italic" },
  idiomNative: { flex: 1, minWidth: 0, fontSize: 14, color: COLORS.text, fontWeight: FONT.bold, lineHeight: 21, opacity: 0.9 },
  idiomTranslit: { fontSize: 12, color: COLORS.textMuted, fontWeight: FONT.bold, lineHeight: 18, fontStyle: "italic" },
});
