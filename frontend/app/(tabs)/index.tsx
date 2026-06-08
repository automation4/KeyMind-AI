import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { TOOLS, TOOL_BY_ID } from "@/src/lib/tools";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
import { ListenButton } from "@/src/components/ListenButton";
import { DiffView } from "@/src/components/DiffView";

const accentBg: Record<string, string> = {
  orange: COLORS.primary,
  yellow: COLORS.secondary,
  mint: COLORS.mint,
  peach: COLORS.peach,
  sky: COLORS.sky,
  lilac: COLORS.lilac,
};

type Result = {
  tool: string;
  original: string;
  suggestions: string[];
};

export default function WriteScreen() {
  const { user } = useAuth();
  const { accentColor } = useTheme();
  const [text, setText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [optionsOpen, setOptionsOpen] = useState<string | null>(null);
  const [appliedToast, setAppliedToast] = useState(false);
  const [pendingOptions, setPendingOptions] = useState<Record<string, string>>({});

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/).length : 0),
    [text],
  );

  const runTool = async (toolId: string, options: Record<string, any> = {}) => {
    if (!text.trim()) {
      setError("Type something first ✍️");
      return;
    }
    setLoading(true);
    setActiveTool(toolId);
    setError(null);
    setResult(null);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    try {
      const data = await api.tool(toolId, text, options);
      setResult({ tool: toolId, original: text, suggestions: data.suggestions });
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const onPressTool = (toolId: string) => {
    const def = TOOL_BY_ID[toolId];
    if (def.options && def.options.length) {
      setOptionsOpen(toolId);
      setPendingOptions({ [def.options[0].key]: def.options[0].choices[0] });
      return;
    }
    runTool(toolId);
  };

  const apply = async (suggestion: string) => {
    setText(suggestion);
    setResult(null);
    setAppliedToast(true);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setTimeout(() => setAppliedToast(false), 1500);
    if (user && activeTool) {
      try {
        await api.saveHistory(activeTool, result?.original || "", suggestion);
      } catch {}
    }
  };

  const copy = async (s: string) => {
    await Clipboard.setStringAsync(s);
    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 1200);
  };

  const dismiss = () => setResult(null);

  const retry = () => {
    if (activeTool) runTool(activeTool, pendingOptions);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>HELLO, {(user?.name || "WRITER").toUpperCase()}</Text>
          <Text style={styles.title}>What are{"\n"}we writing?</Text>
        </View>
        <View style={[styles.avatar, { backgroundColor: accentColor }]}>
          <Text style={styles.avatarText}>
            {(user?.name || "U").trim()[0]?.toUpperCase() || "U"}
          </Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Text input card */}
        <View style={styles.inputCard}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (error) setError(null);
            }}
            multiline
            placeholder="Paste or type your text in any language…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            testID="writer-textinput"
          />
          <View style={styles.inputFooter}>
            <Text style={styles.meta}>{wordCount} WORDS</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => copy(text)}
                disabled={!text}
                style={styles.smallBtn}
                testID="copy-input-btn"
              >
                <Ionicons name="copy-outline" size={14} color={COLORS.text} />
                <Text style={styles.smallBtnText}>COPY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setText("")}
                disabled={!text}
                style={styles.smallBtn}
                testID="clear-input-btn"
              >
                <Ionicons name="close-circle-outline" size={14} color={COLORS.text} />
                <Text style={styles.smallBtnText}>CLEAR</Text>
              </TouchableOpacity>
              <ListenButton text={text} small testID="listen-input-btn" />
            </View>
          </View>
        </View>

        {error ? (
          <Text style={styles.error} testID="writer-error">
            {error}
          </Text>
        ) : null}

        {/* Tools toolbar */}
        <Text style={styles.section}>AI WRITING TOOLS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolsRow}
        >
          {TOOLS.map((t) => {
            const isActive = activeTool === t.id && loading;
            return (
              <TouchableOpacity
                key={t.id}
                onPress={() => onPressTool(t.id)}
                disabled={loading}
                style={[styles.toolChip, { backgroundColor: accentBg[t.accent] }]}
                testID={`tool-${t.id}`}
              >
                {isActive ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <Ionicons name={t.icon} size={20} color={COLORS.text} />
                )}
                <Text style={styles.toolLabel}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Result */}
        {loading && !result && (
          <View style={styles.resultCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <ActivityIndicator color={COLORS.text} />
              <Text style={styles.thinking}>Thinking in {wordCount > 30 ? "any language" : "your language"}…</Text>
            </View>
          </View>
        )}

        {result && (
          <View testID="result-card">
            <Text style={styles.section}>
              {TOOL_BY_ID[result.tool]?.label?.toUpperCase() || "RESULT"}
            </Text>
            {result.suggestions.map((sug, idx) => (
              <View key={idx} style={styles.resultCard}>
                {result.tool === "grammar" && idx === 0 ? (
                  <DiffView original={result.original} corrected={sug} />
                ) : (
                  <Text style={styles.resultText} selectable>
                    {sug}
                  </Text>
                )}
                <View style={styles.resultActions}>
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => apply(sug)}
                    testID={`apply-btn-${idx}`}
                  >
                    <Ionicons name="checkmark" size={16} color={COLORS.bg} />
                    <Text style={styles.applyText}>APPLY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dismissBtn}
                    onPress={() => copy(sug)}
                    testID={`copy-btn-${idx}`}
                  >
                    <Ionicons name="copy-outline" size={14} color={COLORS.text} />
                    <Text style={styles.dismissText}>COPY</Text>
                  </TouchableOpacity>
                  <ListenButton text={sug} small testID={`listen-suggestion-${idx}`} />
                </View>
              </View>
            ))}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={styles.ghostBtn} onPress={retry} testID="retry-btn">
                <Ionicons name="refresh" size={14} color={COLORS.text} />
                <Text style={styles.ghostBtnText}>RETRY</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={dismiss} testID="dismiss-btn">
                <Ionicons name="close" size={14} color={COLORS.text} />
                <Text style={styles.ghostBtnText}>DISMISS</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Options modal */}
      <Modal visible={!!optionsOpen} transparent animationType="slide" onRequestClose={() => setOptionsOpen(null)}>
        <View style={styles.modalBg}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {optionsOpen && TOOL_BY_ID[optionsOpen]?.options?.map((opt) => (
              <View key={opt.key} style={{ marginBottom: 16 }}>
                <Text style={styles.section}>{opt.label.toUpperCase()}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {opt.choices.map((c) => {
                    const active = pendingOptions[opt.key] === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setPendingOptions((p) => ({ ...p, [opt.key]: c }))}
                        style={[styles.optChip, active && styles.optChipActive]}
                        testID={`opt-${opt.key}-${c.toLowerCase()}`}
                      >
                        <Text style={[styles.optChipText, active && styles.optChipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.sheetBtn, { backgroundColor: COLORS.surface }]}
                onPress={() => setOptionsOpen(null)}
                testID="opt-cancel-btn"
              >
                <Text style={[styles.sheetBtnText, { color: COLORS.text }]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, { backgroundColor: COLORS.text, flex: 2 }]}
                onPress={() => {
                  const tool = optionsOpen;
                  const opts = { ...pendingOptions, target_language: pendingOptions.target_language?.toLowerCase() };
                  setOptionsOpen(null);
                  if (tool) runTool(tool, pendingOptions);
                }}
                testID="opt-run-btn"
              >
                <Text style={[styles.sheetBtnText, { color: COLORS.bg }]}>RUN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {appliedToast && (
        <View style={styles.toast} testID="applied-toast">
          <Ionicons name="checkmark-circle" size={18} color={COLORS.bg} />
          <Text style={styles.toastText}>Done</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 8, paddingBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  title: { fontSize: 32, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.2, lineHeight: 34 },
  avatar: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", ...SHADOW.brutalSm,
  },
  avatarText: { fontSize: 18, fontWeight: FONT.black, color: COLORS.text },

  inputCard: {
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: 16, ...SHADOW.brutal,
  },
  input: { minHeight: 140, fontSize: 16, lineHeight: 22, color: COLORS.text, fontWeight: FONT.regular, textAlignVertical: "top" },
  inputFooter: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 },
  meta: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  smallBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  smallBtnText: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },

  section: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text, marginTop: 24, marginBottom: 12 },
  toolsRow: { paddingRight: 24, gap: 8 },
  toolChip: {
    height: 80, width: 92, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", padding: 8, gap: 6, flexShrink: 0, ...SHADOW.brutalSm,
  },
  toolLabel: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, textAlign: "center", letterSpacing: 0.5 },

  resultCard: {
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: 16, marginBottom: 10, ...SHADOW.brutal,
  },
  resultText: { fontSize: 15, lineHeight: 22, color: COLORS.text },
  resultActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" },
  applyBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.text, borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  applyText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.bg, letterSpacing: 1 },
  dismissBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.bg, borderWidth: 2, borderColor: COLORS.border,
  },
  dismissText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },
  ghostBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  ghostBtnText: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },
  thinking: { fontSize: 13, color: COLORS.text, fontWeight: FONT.bold },
  error: { marginTop: 12, color: "#B91C1C", fontWeight: FONT.bold, fontSize: 13 },

  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 3, borderColor: COLORS.border, padding: 20, paddingBottom: 36,
  },
  sheetHandle: { alignSelf: "center", width: 56, height: 5, borderRadius: 3, backgroundColor: COLORS.text, marginBottom: 8 },
  optChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  optChipActive: { backgroundColor: COLORS.text },
  optChipText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },
  optChipTextActive: { color: COLORS.bg },
  sheetBtn: {
    flex: 1, paddingVertical: 14, borderRadius: RADIUS.lg, alignItems: "center",
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  sheetBtnText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5 },

  toast: {
    position: "absolute", bottom: 24, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.text, paddingHorizontal: 16, paddingVertical: 12, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  toastText: { color: COLORS.bg, fontWeight: FONT.black, fontSize: 13, letterSpacing: 1 },
});
