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
  const isReply = result.tool === "smart_reply";
  const isParaphrase = result.tool === "paraphrase";
  const hasTranslation = isReply || isParaphrase; // both may carry "| English: ..."
  let wordPart = suggestion;
  let meaningPart = "";
  if ((isWordList || hasTranslation) && suggestion.includes("|")) {
    const parts = suggestion.split("|");
    wordPart = (parts[0] || "").trim();
    meaningPart = parts.slice(1).join("|").trim();
    // Strip leading "English:" label if backend prefixed it
    meaningPart = meaningPart.replace(/^English\s*:\s*/i, "");
  }
  const applyValue = isWordList || hasTranslation ? wordPart : suggestion;
  const copyValue = isWordList || hasTranslation ? wordPart : suggestion;

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={styles.resultCard}
      onLongPress={() => onCopy(copyValue)}
      delayLongPress={350}
      testID={`result-card-${index}`}
    >
      {result.tool === "grammar" && index === 0 ? (
        result.data?.is_correct === true ? (
          <View style={styles.perfectBanner}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.text} />
            <Text style={styles.perfectText} selectable>
              {suggestion}
            </Text>
          </View>
        ) : (
          <DiffView original={result.original} corrected={suggestion} />
        )
      ) : isWordList ? (
        <View style={styles.wordCardHeader}>
          <Text style={styles.wordCardWord} selectable>
            {wordPart}
          </Text>
          <ListenButton text={wordPart} small testID={`listen-word-${index}`} />
        </View>
      ) : (
        <Text style={styles.resultText} selectable>
          {hasTranslation ? wordPart : suggestion}
        </Text>
      )}
      {(isWordList || hasTranslation) && meaningPart ? (
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
        {/* COPY button removed — long-press on the card already copies, the
            redundant button caused two-toast confusion (system + in-app). */}
        {result.tool === "idioms" ? (
          <ListenButton text={suggestion} small testID={`listen-idiom-${index}`} />
        ) : null}
        {isReply ? (
          <ListenButton
            text={wordPart}
            small
            compact
            testID={`listen-reply-${index}`}
          />
        ) : null}
        {isParaphrase ? (
          <ListenButton
            text={wordPart}
            small
            compact
            testID={`listen-paraphrase-${index}`}
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/** Grammar "WHY this change" + native-speaker examples block. */
export function GrammarMetaCard({ data }: { data: any }) {
  if (!data) return null;
  const isCorrect = data.is_correct === true;
  return (
    <View
      style={[
        styles.grammarMetaCard,
        isCorrect && styles.grammarMetaCardPerfect,
      ]}
      testID="grammar-meta-card"
    >
      {data.explanation ? (
        <View style={{ gap: 6 }}>
          <View style={styles.metaHeader}>
            {isCorrect ? (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.text} />
            ) : (
              <Ionicons name="information-circle" size={16} color={COLORS.text} />
            )}
            <Text style={styles.metaLabel}>
              {isCorrect ? "LOOKS PERFECT" : "WHY THIS CHANGE"}
            </Text>
          </View>
          <Text style={styles.metaText} selectable>
            {data.explanation}
          </Text>
        </View>
      ) : null}
      {Array.isArray(data.examples) && data.examples.length > 0 ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          <Text style={styles.metaLabel}>
            {isCorrect
              ? "OTHER WAYS NATIVE SPEAKERS SAY THIS"
              : "HOW NATIVE SPEAKERS USE IT"}
          </Text>
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

/** Idioms card — different layouts for idiom-input vs sentence-input. */
export function IdiomsCard({ data }: { data: any }) {
  const kind: string = data?.input_kind || "idiom";
  const items: Array<{
    idiom?: string;
    meaning?: string;
    examples?: string[];
  }> = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return null;
  const headerLabel =
    kind === "sentence" ? "RELATED IDIOMS" : "IDIOM MEANING & EXAMPLES";

  return (
    <View style={styles.idiomsCard} testID="idioms-card">
      <Text style={styles.idiomsHeader}>{headerLabel}</Text>
      {items.map((it, idx) => (
        <View key={idx} style={styles.idiomItem}>
          <View style={styles.idiomTitleRow}>
            <Text style={styles.idiomTitle} selectable>
              {it.idiom || ""}
            </Text>
            <ListenButton
              text={it.idiom || ""}
              small
              compact
              testID={`listen-idiom-title-${idx}`}
            />
          </View>
          {it.meaning ? (
            <Text style={styles.idiomMeaning} selectable>
              {it.meaning}
            </Text>
          ) : null}
          {Array.isArray(it.examples) && it.examples.length > 0 ? (
            <View style={{ gap: 6, marginTop: 6 }}>
              <Text style={styles.idiomExamplesLabel}>EXAMPLES</Text>
              {it.examples.map((ex, exIdx) => (
                <View key={exIdx} style={styles.exampleRow}>
                  <Text style={styles.exampleText} selectable>
                    {ex}
                  </Text>
                  <ListenButton
                    text={ex}
                    small
                    compact
                    testID={`listen-idiom-ex-${idx}-${exIdx}`}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Summary card — bullet list rendering with a single "Listen to all" button. */
export function SummaryCard({
  suggestions,
  onApply,
  onCopy,
}: {
  suggestions: string[];
  onApply: (s: string) => void;
  onCopy: (s: string) => void;
}) {
  const bullets = (suggestions || []).map((s) => s.trim()).filter(Boolean);
  if (!bullets.length) return null;
  const allText = bullets.join(". ");
  const combined = bullets.map((b) => `• ${b}`).join("\n");
  return (
    <View style={styles.idiomsCard} testID="summary-card">
      <View style={styles.summaryHeader}>
        <Text style={styles.idiomsHeader}>SUMMARY · KEY POINTS</Text>
        <ListenButton text={allText} small testID="listen-summary-all" />
      </View>
      <View style={{ gap: 8 }}>
        {bullets.map((b, idx) => (
          <View key={idx} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText} selectable>
              {b}
            </Text>
          </View>
        ))}
      </View>
      <View style={[styles.resultActions, { marginTop: 14 }]}>
        <TouchableOpacity
          style={styles.applyBtn}
          onPress={() => onApply(combined)}
          testID="apply-summary"
        >
          <Ionicons name="checkmark" size={16} color={COLORS.bg} />
          <Text style={styles.applyText}>APPLY</Text>
        </TouchableOpacity>
        {/* COPY button removed — long-press the card to copy. */}
      </View>
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
  grammarMetaCardPerfect: {
    backgroundColor: COLORS.mint,
  },
  metaHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  perfectBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.mint,
    marginBottom: 4,
  },
  perfectText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: FONT.bold,
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

  // Idioms / Summary cards
  idiomsCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    gap: 14,
    ...SHADOW.brutal,
  },
  idiomsHeader: {
    fontSize: 10,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  idiomItem: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft,
    paddingTop: 12,
    gap: 6,
  },
  idiomTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  idiomTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: FONT.black,
    color: COLORS.text,
  },
  idiomMeaning: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text,
    fontWeight: FONT.bold,
  },
  idiomExamplesLabel: {
    fontSize: 10,
    fontWeight: FONT.black,
    letterSpacing: 1.2,
    color: COLORS.textMuted,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bulletDot: {
    fontSize: 18,
    color: COLORS.text,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontWeight: FONT.bold,
  },
});
