import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { DiffView } from "@/src/components/DiffView";
import { ListenButton } from "@/src/components/ListenButton";

export type ResultPayload = {
  tool: string;
  original: string;
  suggestions: string[];
  data?: any;
};

type Props = {
  result: ResultPayload;
  index: number;
  suggestion: string;
  onApply: (s: string) => void;
  onCopy: (s: string) => void;
};

/** Renders ONE suggestion within a result (grammar diff, synonym/antonym word card,
 *  idiom sentence, or plain text result). */
export function ResultSuggestion({
  result,
  index,
  suggestion,
  onApply,
  onCopy,
}: Props) {
  const isWordList = result.tool === "synonyms" || result.tool === "antonyms";
  let wordPart = suggestion;
  let meaningPart = "";
  if (isWordList && suggestion.includes("|")) {
    const parts = suggestion.split("|");
    wordPart = (parts[0] || "").trim();
    meaningPart = parts.slice(1).join("|").trim();
  }
  const applyValue = isWordList ? wordPart : suggestion;
  const copyValue = isWordList ? wordPart : suggestion;

  return (
    <View style={styles.resultCard}>
      {result.tool === "grammar" && index === 0 ? (
        <DiffView original={result.original} corrected={suggestion} />
      ) : isWordList ? (
        <View style={styles.wordCardHeader}>
          <Text style={styles.wordCardWord} selectable>
            {wordPart}
          </Text>
          <ListenButton text={wordPart} small testID={`listen-word-${index}`} />
        </View>
      ) : (
        <Text style={styles.resultText} selectable>
          {suggestion}
        </Text>
      )}
      {isWordList && meaningPart ? (
        <Text style={styles.wordCardMeaning} selectable>
          {meaningPart}
        </Text>
      ) : null}
      <View style={styles.resultActions}>
        <TouchableOpacity
          style={styles.applyBtn}
          onPress={() => onApply(applyValue)}
          testID={`apply-btn-${index}`}
        >
          <Ionicons name="checkmark" size={16} color={COLORS.bg} />
          <Text style={styles.applyText}>APPLY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={() => onCopy(copyValue)}
          testID={`copy-btn-${index}`}
        >
          <Ionicons name="copy-outline" size={14} color={COLORS.text} />
          <Text style={styles.dismissText}>COPY</Text>
        </TouchableOpacity>
        {result.tool === "idioms" ? (
          <ListenButton text={suggestion} small testID={`listen-idiom-${index}`} />
        ) : null}
      </View>
    </View>
  );
}

/** Grammar "WHY this change" + native-speaker examples block. */
export function GrammarMetaCard({ data }: { data: any }) {
  if (!data) return null;
  return (
    <View style={styles.grammarMetaCard}>
      {data.explanation ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.metaLabel}>WHY THIS CHANGE</Text>
          <Text style={styles.metaText} selectable>
            {data.explanation}
          </Text>
        </View>
      ) : null}
      {Array.isArray(data.examples) && data.examples.length > 0 ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          <Text style={styles.metaLabel}>HOW NATIVE SPEAKERS USE IT</Text>
          {(data.examples as string[]).map((ex, exIdx) => (
            <View key={exIdx} style={styles.exampleRow}>
              <Text style={styles.exampleText} selectable>
                {ex}
              </Text>
              <ListenButton
                text={ex}
                small
                compact
                testID={`listen-grammar-ex-${exIdx}`}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  resultCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 10,
    ...SHADOW.brutal,
  },
  resultText: {
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.text,
    paddingHorizontal: 2,
  },
  resultActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
  wordCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wordCardWord: {
    flex: 1,
    fontSize: 20,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  wordCardMeaning: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
    fontWeight: FONT.bold,
    marginTop: 8,
  },
  grammarMetaCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.lilac,
    gap: 6,
    ...SHADOW.brutalSm,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
  },
  metaText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text,
    fontWeight: FONT.bold,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.surface,
  },
  exampleText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text,
    fontWeight: FONT.bold,
    fontStyle: "italic",
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.text,
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOW.brutalSm,
  },
  applyText: {
    fontSize: 12,
    fontWeight: FONT.black,
    color: COLORS.bg,
    letterSpacing: 1,
  },
  dismissBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  dismissText: {
    fontSize: 12,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
});
