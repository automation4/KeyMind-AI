import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS, FONT, RADIUS } from "@/src/lib/theme";

// Simple word-level diff renderer for grammar suggestions
export const DiffView: React.FC<{ original: string; corrected: string }> = ({
  original,
  corrected,
}) => {
  const oWords = original.split(/(\s+)/);
  const cWords = corrected.split(/(\s+)/);

  // Use longest common subsequence (word level) — short text only
  const lcs = computeLcs(oWords, cWords);
  const oNodes: { text: string; type: "same" | "del" }[] = [];
  const cNodes: { text: string; type: "same" | "add" }[] = [];

  let i = 0,
    j = 0,
    k = 0;
  while (i < oWords.length || j < cWords.length) {
    const m = lcs[k];
    if (m && i === m.a && j === m.b) {
      oNodes.push({ text: oWords[i], type: "same" });
      cNodes.push({ text: cWords[j], type: "same" });
      i++;
      j++;
      k++;
      continue;
    }
    if (i < oWords.length && (!m || i < m.a)) {
      oNodes.push({ text: oWords[i], type: "del" });
      i++;
    }
    if (j < cWords.length && (!m || j < m.b)) {
      cNodes.push({ text: cWords[j], type: "add" });
      j++;
    }
  }

  return (
    <View>
      <Text style={styles.label}>ORIGINAL</Text>
      <Text style={styles.body}>
        {oNodes.map((n, idx) =>
          n.type === "del" ? (
            <Text key={idx} style={styles.del}>
              {n.text}
            </Text>
          ) : (
            <Text key={idx}>{n.text}</Text>
          ),
        )}
      </Text>
      <Text style={[styles.label, { marginTop: 12 }]}>SUGGESTION</Text>
      <Text style={styles.body}>
        {cNodes.map((n, idx) =>
          n.type === "add" ? (
            <Text key={idx} style={styles.add}>
              {n.text}
            </Text>
          ) : (
            <Text key={idx}>{n.text}</Text>
          ),
        )}
      </Text>
    </View>
  );
};

function computeLcs<T>(a: T[], b: T[]): { a: number; b: number }[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { a: number; b: number }[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ a: i, b: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return out;
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  body: { fontSize: 15, lineHeight: 22, color: COLORS.text, fontWeight: FONT.regular },
  del: {
    backgroundColor: COLORS.diffDelBg,
    color: COLORS.text,
    textDecorationLine: "line-through",
    borderRadius: 3,
  },
  add: {
    backgroundColor: COLORS.diffAddBg,
    color: COLORS.text,
    fontWeight: FONT.bold,
    borderRadius: 3,
  },
});
