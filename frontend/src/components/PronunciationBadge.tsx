import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { COLORS, FONT, RADIUS } from "@/src/lib/theme";
import { ListenButton } from "@/src/components/ListenButton";

type Props = {
  /** The original word — what gets spoken when the user taps the speaker. */
  word: string;
  /** Respelling pronunciation, e.g. "uh · STAW · nuhsht". */
  pronunciation?: string;
  testID?: string;
};

/**
 * Renders a Merriam-Webster–style respelling pronunciation.
 * Each syllable becomes its own pill; the stressed (UPPERCASE) syllable is
 * rendered with extra weight + accent background so it stands out.
 *
 * Renders nothing if `pronunciation` is empty / non-string.
 */
export const PronunciationBadge: React.FC<Props> = ({ word, pronunciation, testID }) => {
  if (!pronunciation || typeof pronunciation !== "string") return null;
  const cleaned = pronunciation.trim();
  if (!cleaned) return null;

  // Split on the middle dot (with optional surrounding whitespace) OR a regular dot
  // as a robust fallback (some models drop the U+00B7).
  const syllables = cleaned
    .split(/\s*[·•·.]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (syllables.length === 0) return null;

  const isStressed = (s: string) => {
    const letters = s.replace(/[^A-Za-z]/g, "");
    return letters.length > 0 && letters === letters.toUpperCase();
  };

  return (
    <View style={styles.wrap} testID={testID || "pronunciation-badge"}>
      <Text style={styles.label}>HOW TO SAY IT</Text>
      <View style={styles.row}>
        <View style={styles.syllableRow}>
          {syllables.map((syl, idx) => {
            const stressed = isStressed(syl);
            return (
              <React.Fragment key={idx}>
                <View
                  style={[
                    styles.pill,
                    stressed && styles.pillStressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.syllable,
                      stressed && styles.syllableStressed,
                    ]}
                    selectable
                  >
                    {syl.toLowerCase()}
                  </Text>
                </View>
                {idx < syllables.length - 1 ? (
                  <Text style={styles.dot}>·</Text>
                ) : null}
              </React.Fragment>
            );
          })}
        </View>
        <ListenButton text={word} small compact testID="listen-pronunciation" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  syllableRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    minWidth: 0,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.bg,
  },
  pillStressed: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.border,
  },
  syllable: {
    fontSize: 14,
    fontWeight: FONT.bold,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  syllableStressed: {
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: 1,
  },
  dot: {
    fontSize: 18,
    fontWeight: FONT.black,
    color: COLORS.textMuted,
    marginHorizontal: -2,
  },
});
