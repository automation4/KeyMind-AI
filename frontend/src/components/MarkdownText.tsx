import React from "react";
import { Text, StyleProp, TextStyle } from "react-native";
import { FONT } from "@/src/lib/theme";

/**
 * Strip basic markdown markers so the output reads cleanly (for TTS, etc.).
 *  - **bold**  → bold
 *  -  *italic* → italic
 *  - `code`    → code
 *  - ### Head  → Head
 */
export function stripMarkdown(input: string): string {
  if (!input) return "";
  return input
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2") // italic
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*]\s+/gm, "• ") // bullets
    .replace(/\*+/g, ""); // any stray asterisks
}

type Props = {
  text: string;
  style?: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
  italicStyle?: StyleProp<TextStyle>;
  selectable?: boolean;
  testID?: string;
};

type Token = { type: "text" | "bold" | "italic" | "code"; value: string };

/**
 * Lightweight inline-markdown tokenizer.
 * Supported: **bold**, *italic*, `code`. Anything else flows through as plain text.
 * Multi-line text is preserved (newlines render naturally inside <Text>).
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  // Order matters: bold (**) before italic (*) so they don't collide.
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*\n]+)\*)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", value: input.slice(lastIndex, m.index) });
    }
    if (m[2] !== undefined) tokens.push({ type: "bold", value: m[2] });
    else if (m[4] !== undefined) tokens.push({ type: "code", value: m[4] });
    else if (m[6] !== undefined) tokens.push({ type: "italic", value: m[6] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < input.length) {
    tokens.push({ type: "text", value: input.slice(lastIndex) });
  }
  // Sweep any unpaired stray '*' from plain-text tokens (LLM sometimes emits dangling markers).
  return tokens.map((t) =>
    t.type === "text" ? { ...t, value: t.value.replace(/\*+/g, "") } : t,
  );
}

export const MarkdownText: React.FC<Props> = ({
  text,
  style,
  boldStyle,
  italicStyle,
  selectable,
  testID,
}) => {
  if (!text) return null;
  const tokens = tokenize(text);
  return (
    <Text style={style} selectable={selectable} testID={testID}>
      {tokens.map((t, i) => {
        if (t.type === "bold") {
          return (
            <Text key={i} style={[{ fontWeight: FONT.black }, boldStyle]}>
              {t.value}
            </Text>
          );
        }
        if (t.type === "italic") {
          return (
            <Text key={i} style={[{ fontStyle: "italic" }, italicStyle]}>
              {t.value}
            </Text>
          );
        }
        if (t.type === "code") {
          return (
            <Text
              key={i}
              style={{
                fontFamily: Platform_select_mono(),
                backgroundColor: "rgba(0,0,0,0.06)",
              }}
            >
              {t.value}
            </Text>
          );
        }
        return <Text key={i}>{t.value}</Text>;
      })}
    </Text>
  );
};

// Avoid importing Platform here for tree-shake; small helper inline.
function Platform_select_mono() {
  // RN web + native both understand these.
  return "Courier";
}
