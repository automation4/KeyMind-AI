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
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { TOOLS, TOOL_BY_ID } from "@/src/lib/tools";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
import { DiffView } from "@/src/components/DiffView";
import { AdBanner } from "@/src/components/AdBanner";
import { UpgradePrompt } from "@/src/components/UpgradePrompt";
import { VocabCard, VocabLanguage, VOCAB_LANGUAGES } from "@/src/components/VocabCard";
import { storage } from "@/src/utils/storage";

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
  data?: any;
};

const VOCAB_LANG_KEY = "keymind_vocab_lang";

export default function WriteScreen() {
  const { user, refreshUser } = useAuth();
  const { accentColor } = useTheme();
  const [text, setText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [optionsOpen, setOptionsOpen] = useState<string | null>(null);
  const [appliedToast, setAppliedToast] = useState(false);
  const [pendingOptions, setPendingOptions] = useState<Record<string, string>>({});
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | undefined>();
  const [vocabLang, setVocabLang] = useState<VocabLanguage>("Hindi");
  const [vocabReloading, setVocabReloading] = useState(false);

  // Load preferred vocab translation language (saved selection > first non-English language from setup > Hindi)
  React.useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(VOCAB_LANG_KEY, "");
      if (saved && (VOCAB_LANGUAGES as readonly string[]).includes(saved)) {
        setVocabLang(saved as VocabLanguage);
        return;
      }
      try {
        const langsRaw = await storage.getItem<string>("keymind_languages", "");
        if (langsRaw) {
          const list = JSON.parse(langsRaw) as string[];
          // Prefer the first non-English language so the "second line" is genuinely a translation.
          const preferred =
            list.find(
              (l) =>
                l !== "English" &&
                (VOCAB_LANGUAGES as readonly string[]).includes(l),
            ) ||
            list.find((l) => (VOCAB_LANGUAGES as readonly string[]).includes(l));
          if (preferred) setVocabLang(preferred as VocabLanguage);
        }
      } catch {}
    })();
  }, []);

  const isPremium = !!(user?.is_premium || user?.is_admin);
  const usesToday = user?.tool_uses_today ?? 0;
  const usesLimit = user?.tool_uses_limit ?? 5;
  const usesLeft = isPremium ? Infinity : Math.max(0, usesLimit - usesToday);
  const limitReached = !isPremium && usesLeft <= 0;

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/).length : 0),
    [text],
  );

  const runTool = async (toolId: string, options: Record<string, any> = {}) => {
    if (!text.trim()) {
      setError("Type something first ✍️");
      return;
    }
    if (limitReached) {
      setUpgradeMessage(
        `You've hit today's free limit of ${usesLimit} AI uses. Upgrade for unlimited writing.`,
      );
      setUpgradeOpen(true);
      return;
    }
    // Vocab tool auto-injects the target_language from user's preference.
    const finalOptions =
      toolId === "vocab" && !options.target_language
        ? { ...options, target_language: vocabLang }
        : options;
    setLoading(true);
    setActiveTool(toolId);
    setError(null);
    setResult(null);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    try {
      const data = await api.tool(toolId, text, finalOptions);
      setResult({
        tool: toolId,
        original: text,
        suggestions: data.suggestions,
        data: (data as any).data,
      });
      refreshUser();
    } catch (e: any) {
      if (e?.status === 429) {
        setUpgradeMessage(
          e?.detail ||
            `Daily free limit reached (${usesLimit}/day). Upgrade for unlimited AI tool uses.`,
        );
        setUpgradeOpen(true);
        refreshUser();
      } else {
        setError(e?.detail || e?.message || "Something went wrong");
      }
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

  const handleUpload = async () => {
    setError(null);
    try {
      // Permission (no-op on web)
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError("Photo library permission needed to upload an image.");
          return;
        }
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      let b64 = asset.base64;
      if (!b64 && asset.uri) {
        // Fallback fetch as data URL
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        b64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
          r.readAsDataURL(blob);
        });
      }
      if (!b64) {
        setError("Could not read the selected image.");
        return;
      }
      setOcrBusy(true);
      const res = await api.ocr(b64);
      if (!res.text) {
        setError("No readable text found in the image.");
        return;
      }
      setText((prev) => (prev ? prev.trimEnd() + "\n" + res.text : res.text));
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message || "Image extraction failed");
    } finally {
      setOcrBusy(false);
    }
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
        {/* Ad banner (free-tier only) */}
        <AdBanner placement="top" />

        {/* Free-tier usage chip */}
        {!isPremium && (
          <View style={styles.usageChip} testID="write-usage-chip">
            <Ionicons name="flash-outline" size={14} color={COLORS.text} />
            <Text style={styles.usageChipText}>
              {usesToday}/{usesLimit} AI uses today
            </Text>
            <Text style={styles.usageChipSub}>· Resets daily</Text>
          </View>
        )}

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
            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={handleUpload}
                disabled={ocrBusy}
                style={[styles.smallBtn, { backgroundColor: COLORS.mint }]}
                testID="upload-image-btn"
              >
                {ocrBusy ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <Ionicons name="image-outline" size={14} color={COLORS.text} />
                )}
                <Text style={styles.smallBtnText} numberOfLines={1}>
                  {ocrBusy ? "READING…" : "UPLOAD"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => copy(text)}
                disabled={!text}
                style={styles.smallBtn}
                testID="copy-input-btn"
              >
                <Ionicons name="copy-outline" size={14} color={COLORS.text} />
                <Text style={styles.smallBtnText} numberOfLines={1}>COPY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setText("")}
                disabled={!text}
                style={styles.smallBtn}
                testID="clear-input-btn"
              >
                <Ionicons name="close" size={14} color={COLORS.text} />
                <Text style={styles.smallBtnText} numberOfLines={1}>CLEAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {error ? (
          <Text style={styles.error} testID="writer-error">
            {error}
          </Text>
        ) : null}

        {/* Tools selector (dropdown) */}
        <Text style={styles.section}>AI WRITING TOOLS</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setToolPickerOpen(true)}
          disabled={loading}
          testID="tools-dropdown"
        >
          <View style={styles.dropdownLeft}>
            <View
              style={[
                styles.dropdownIcon,
                {
                  backgroundColor: activeTool
                    ? accentBg[TOOL_BY_ID[activeTool]?.accent || "orange"]
                    : COLORS.secondary,
                },
              ]}
            >
              <Ionicons
                name={activeTool ? TOOL_BY_ID[activeTool]?.icon ?? "sparkles" : "sparkles"}
                size={20}
                color={COLORS.text}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dropdownLabel}>
                {activeTool ? TOOL_BY_ID[activeTool]?.label : "Choose a tool"}
              </Text>
              <Text style={styles.dropdownSub} numberOfLines={1}>
                {activeTool
                  ? TOOL_BY_ID[activeTool]?.description
                  : "16 tools — grammar, translate, paraphrase & more"}
              </Text>
            </View>
          </View>
          {loading && activeTool ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Ionicons name="chevron-down" size={20} color={COLORS.text} />
          )}
        </TouchableOpacity>

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
            {result.tool === "vocab" && result.data ? (
              <VocabCard
                data={result.data}
                language={vocabLang}
                loading={vocabReloading}
                onChangeLanguage={async (lang) => {
                  setVocabLang(lang);
                  await storage.setItem(VOCAB_LANG_KEY, lang);
                  if (!text.trim() || vocabReloading) return;
                  setVocabReloading(true);
                  try {
                    const data = await api.tool("vocab", result.original, { target_language: lang });
                    setResult({
                      tool: "vocab",
                      original: result.original,
                      suggestions: data.suggestions,
                      data: (data as any).data,
                    });
                    refreshUser();
                  } catch (e: any) {
                    if (e?.status === 429) {
                      setUpgradeMessage(e?.detail || "Daily free limit reached. Upgrade for unlimited.");
                      setUpgradeOpen(true);
                      refreshUser();
                    } else {
                      setError(e?.detail || e?.message || "Could not translate. Try again.");
                    }
                  } finally {
                    setVocabReloading(false);
                  }
                }}
                onTrickyWordPress={(w) => {
                  setText(w);
                  runTool("vocab", { target_language: vocabLang });
                }}
              />
            ) : (
              result.suggestions.map((sug, idx) => (
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
                </View>
              </View>
              ))
            )}

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

      {/* Tool picker dropdown modal */}
      <Modal
        visible={toolPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setToolPickerOpen(false)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.sheet, { maxHeight: "80%" }]}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.section, { marginTop: 4 }]}>SELECT A TOOL</Text>
            <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
              {TOOLS.map((t) => {
                const selected = activeTool === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.toolRow, selected && styles.toolRowActive]}
                    onPress={() => {
                      setToolPickerOpen(false);
                      onPressTool(t.id);
                    }}
                    testID={`tool-${t.id}`}
                  >
                    <View style={[styles.toolRowIcon, { backgroundColor: accentBg[t.accent] }]}>
                      <Ionicons name={t.icon} size={18} color={COLORS.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toolRowLabel}>{t.label}</Text>
                      <Text style={styles.toolRowSub} numberOfLines={1}>
                        {t.description}
                      </Text>
                    </View>
                    {selected && <Ionicons name="checkmark" size={20} color={COLORS.text} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[
                styles.sheetBtn,
                { backgroundColor: COLORS.surface, marginTop: 12, flex: 0 },
              ]}
              onPress={() => setToolPickerOpen(false)}
              testID="tool-picker-close-btn"
            >
              <Text style={[styles.sheetBtnText, { color: COLORS.text }]}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      <UpgradePrompt
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Daily limit reached"
        message={upgradeMessage}
      />
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
  inputFooter: { marginTop: 12, gap: 10 },
  actionRow: { flexDirection: "row", gap: 8 },
  smallBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  smallBtnText: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.4 },
  meta: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },

  section: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text, marginTop: 24, marginBottom: 12 },
  dropdown: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 14, gap: 12, ...SHADOW.brutalSm,
  },
  dropdownLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  dropdownIcon: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  dropdownLabel: { fontSize: 15, fontWeight: FONT.black, color: COLORS.text },
  dropdownSub: { marginTop: 2, fontSize: 12, color: COLORS.textMuted, fontWeight: FONT.regular },
  toolRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderColor: COLORS.borderSoft,
  },
  toolRowActive: { backgroundColor: COLORS.bg },
  toolRowIcon: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  toolRowLabel: { fontSize: 14, fontWeight: FONT.black, color: COLORS.text },
  toolRowSub: { marginTop: 2, fontSize: 11, color: COLORS.textMuted, fontWeight: FONT.regular },
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
    flex: 1, paddingVertical: 14, borderRadius: RADIUS.lg,
    alignItems: "center", justifyContent: "center",
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
  usageChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.peach,
    marginBottom: 10,
  },
  usageChipText: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },
  usageChipSub: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.text, opacity: 0.6 },
});
