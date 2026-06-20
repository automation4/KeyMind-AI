import React from "react";
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
import { PronunciationBadge } from "@/src/components/PronunciationBadge";
import {
  VocabData,
  VOCAB_LANGUAGES,
  VocabLanguage,
  romanLabel,
  needsRoman,
} from "@/src/components/VocabCard";

/**
 * Slim Describe card used by the "Describe" tool on the Write tab.
 *
 * Renders ONLY:
 *  - Word + part-of-speech pill
 *  - Simple English explanation (with LISTEN)
 *  - Native-script translation in the picked language (with LISTEN)
 *  - Latin transliteration (Hinglish / Tanglish / Tenglish / Banglish / Romaji / Pinyin / etc.)
 *
 * The deeper breakdown (synonyms / antonyms / native alt / memory tip / tenses / idioms)
 * now lives in the Chat tab via the rich VocabCard.
 */
type Props = {
  data: VocabData;
  language: VocabLanguage;
  onLanguageChange?: (lang: VocabLanguage) => void;
  loading?: boolean;
  testID?: string;
};

export const SimpleDescribeCard: React.FC<Props> = ({
  data,
  language,
  onLanguageChange,
  loading,
  testID,
}) => {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const hasSentenceSection = !!(data.sentence_translated && data.input_kind !== "word");

  const langToggle = onLanguageChange ? (
    <TouchableOpacity
      onPress={() => setPickerOpen((v) => !v)}
      style={styles.langPickerBtn}
      testID="describe-lang-toggle"
    >
      <Ionicons
        name={pickerOpen ? "chevron-up" : "chevron-down"}
        size={14}
        color={COLORS.text}
      />
    </TouchableOpacity>
  ) : null;

  const langChips =
    pickerOpen && onLanguageChange ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
      >
        {VOCAB_LANGUAGES.map((l) => {
          const active = l === language;
          return (
            <TouchableOpacity
              key={l}
              onPress={() => {
                onLanguageChange(l);
                setPickerOpen(false);
              }}
              style={[
                styles.langChip,
                active && {
                  backgroundColor: COLORS.text,
                  borderColor: COLORS.text,
                },
              ]}
            >
              <Text
                style={[
                  styles.langChipText,
                  active && { color: COLORS.surface },
                ]}
              >
                {l}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    ) : null;

  return (
    <View style={styles.card} testID={testID || "describe-card"}>
      {/* Header — word + LISTEN + pos pill */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.wordRow}>
            <Text style={styles.word} selectable testID="describe-word">
              {data.word || "—"}
            </Text>
            {data.word ? (
              <ListenButton text={data.word} small testID="listen-word" />
            ) : null}
          </View>
          {data.part_of_speech ? (
            <View style={styles.posPill}>
              <Text style={styles.posPillText}>
                {data.part_of_speech.toUpperCase()}
              </Text>
            </View>
          ) : null}
          <PronunciationBadge
            word={data.word || ""}
            pronunciation={data.pronunciation}
          />
        </View>
      </View>

      {/* HOW TO SAY IT — direct translation of the user's sentence/phrase (with language selector) */}
      {hasSentenceSection ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.languageHeader}>
              <Text style={styles.sectionLabel}>
                HOW TO SAY IT IN {language.toUpperCase()}
              </Text>
              {langToggle}
            </View>
            {/* Listen button removed for translated text — English source only. */}
          </View>
          {langChips}
          <Text
            style={styles.meaningNative}
            selectable
            testID="describe-sentence-translated"
          >
            {data.sentence_translated}
          </Text>
          {data.sentence_transliterated && needsRoman(language) ? (
            <View style={styles.translitWrap}>
              <Text style={styles.translitLabel}>{romanLabel(language)}</Text>
              <Text
                style={styles.translitText}
                selectable
                testID="describe-sentence-transliterated"
              >
                {data.sentence_transliterated}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Simple English explanation */}
      {data.meaning_simple ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>SIMPLE EXPLANATION</Text>
            <ListenButton
              text={data.meaning_simple}
              small
              testID="listen-meaning"
            />
          </View>
          <Text style={styles.meaningEn} selectable>
            {data.meaning_simple}
          </Text>
        </View>
      ) : null}

      {/* Translated meaning + Hinglish — shown last */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.languageHeader}>
            <Text style={styles.sectionLabel}>IN {language.toUpperCase()}</Text>
            {!hasSentenceSection ? langToggle : null}
          </View>
          {/* Listen button removed for translated content. */}
        </View>

        {!hasSentenceSection ? langChips : null}

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={COLORS.text} />
            <Text style={styles.loadingText}>Translating to {language}…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.meaningNative} selectable testID="describe-translated">
              {data.meaning_translated || "—"}
            </Text>
            {data.meaning_transliterated && needsRoman(language) ? (
              <View style={styles.translitWrap}>
                <Text style={styles.translitLabel}>{romanLabel(language)}</Text>
                <Text style={styles.translitText} selectable testID="describe-transliterated">
                  {data.meaning_transliterated}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
};

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
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.sky,
  },
  posPillText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1 },

  section: { gap: 8 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
  },

  meaningEn: {
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 24,
    fontWeight: FONT.bold,
  },
  meaningNative: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 24,
    fontWeight: FONT.bold,
  },

  languageHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  langPickerBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  langChipText: {
    fontSize: 12,
    fontWeight: FONT.black,
    color: COLORS.text,
  },

  translatedLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
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

  loadingRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: FONT.bold,
    color: COLORS.textMuted,
  },
});
