import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { TOOL_BY_ID, TOOLS } from "@/src/lib/tools";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme } from "@/src/contexts/ThemeContext";
import { AdBanner } from "@/src/components/AdBanner";
import { UpgradePrompt } from "@/src/components/UpgradePrompt";
import { VocabLanguage, VOCAB_LANGUAGES } from "@/src/components/VocabCard";
import { SimpleDescribeCard } from "@/src/components/SimpleDescribeCard";
import { WriteInputCard } from "@/src/components/write/WriteInputCard";
import { ToolPickerSheet } from "@/src/components/write/ToolPickerSheet";
import { ToolOptionsSheet } from "@/src/components/write/ToolOptionsSheet";
import {
  ResultSuggestion,
  GrammarMetaCard,
  IdiomsCard,
  SummaryCard,
  ResultPayload,
} from "@/src/components/write/ResultCard";
import { storage } from "@/src/utils/storage";

const accentBg: Record<string, string> = {
  orange: COLORS.primary,
  yellow: COLORS.secondary,
  mint: COLORS.mint,
  peach: COLORS.peach,
  sky: COLORS.sky,
  lilac: COLORS.lilac,
};

const VOCAB_LANG_KEY = "keymind_vocab_lang";

export default function WriteScreen() {
  const { user, refreshUser } = useAuth();
  const { accentColor } = useTheme();
  const [text, setText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [optionsOpen, setOptionsOpen] = useState<string | null>(null);
  const [appliedToast, setAppliedToast] = useState(false);
  const [pendingOptions, setPendingOptions] = useState<Record<string, string>>({});
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
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
  const usesLimit = user?.tool_uses_limit ?? 10;
  const usesLeft = isPremium ? Infinity : Math.max(0, usesLimit - usesToday);
  const limitReached = !isPremium && usesLeft <= 0;

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/).length : 0),
    [text],
  );

  const showToast = () => {
    setAppliedToast(true);
    setTimeout(() => setAppliedToast(false), 1500);
  };

  const runTool = async (toolId: string, options: Record<string, any> = {}) => {
    if (!text.trim()) {
      setError("Type something first ✍️");
      return;
    }
    if (limitReached) {
      setUpgradeMessage(
        `You've used all ${usesLimit} AI actions for today. Try again tomorrow.`,
      );
      setUpgradeOpen(true);
      return;
    }
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
            `Daily limit reached (${usesLimit}/day). Try again tomorrow.`,
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
    showToast();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
    if (user && activeTool) {
      try {
        await api.saveHistory(activeTool, result?.original || "", suggestion);
      } catch {}
    }
  };

  const copy = async (s: string) => {
    await Clipboard.setStringAsync(s);
    showToast();
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
          <Text style={styles.eyebrow}>
            HELLO, {(user?.name || "WRITER").toUpperCase()}
          </Text>
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
        <AdBanner placement="top" />

        {!isPremium && (
          <View style={styles.usageChip} testID="write-usage-chip">
            <Ionicons name="flash-outline" size={14} color={COLORS.text} />
            <Text style={styles.usageChipText}>
              {usesToday}/{usesLimit} AI uses today
            </Text>
            <Text style={styles.usageChipSub}>· Resets daily</Text>
          </View>
        )}

        {/* Input card (text, mic, upload/copy/clear) */}
        <WriteInputCard
          text={text}
          onChangeText={setText}
          onError={setError}
          onClearError={() => setError(null)}
          onToast={showToast}
        />

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
                name={
                  activeTool
                    ? TOOL_BY_ID[activeTool]?.icon ?? "sparkles"
                    : "sparkles"
                }
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
                  : `${TOOLS.length} tools — grammar, translate, paraphrase & more`}
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
          <View style={styles.thinkingCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <ActivityIndicator color={COLORS.text} />
              <Text style={styles.thinking}>
                Thinking in {wordCount > 30 ? "any language" : "your language"}…
              </Text>
            </View>
          </View>
        )}

        {result && (
          <View testID="result-card">
            <Text style={styles.section}>
              {TOOL_BY_ID[result.tool]?.label?.toUpperCase() || "RESULT"}
            </Text>
            {result.tool === "vocab" && result.data ? (
              <SimpleDescribeCard
                data={result.data}
                language={vocabLang}
                loading={vocabReloading}
                onLanguageChange={async (lang) => {
                  setVocabLang(lang);
                  await storage.setItem(VOCAB_LANG_KEY, lang);
                  if (!text.trim() || vocabReloading) return;
                  setVocabReloading(true);
                  try {
                    const data = await api.tool("vocab", result.original, {
                      target_language: lang,
                    });
                    setResult({
                      tool: "vocab",
                      original: result.original,
                      suggestions: data.suggestions,
                      data: (data as any).data,
                    });
                    refreshUser();
                  } catch (e: any) {
                    if (e?.status === 429) {
                      setUpgradeMessage(
                        e?.detail || "Daily limit reached. Try again tomorrow.",
                      );
                      setUpgradeOpen(true);
                      refreshUser();
                    } else {
                      setError(
                        e?.detail || e?.message || "Could not translate. Try again.",
                      );
                    }
                  } finally {
                    setVocabReloading(false);
                  }
                }}
              />
            ) : result.tool === "idioms" && result.data ? (
              <IdiomsCard data={result.data} />
            ) : result.tool === "summarize" ? (
              <SummaryCard
                suggestions={result.suggestions}
                onApply={apply}
                onCopy={copy}
              />
            ) : (
              <>
                {result.suggestions.map((sug, idx) => (
                  <ResultSuggestion
                    key={idx}
                    result={result}
                    index={idx}
                    suggestion={sug}
                    onApply={apply}
                    onCopy={copy}
                  />
                ))}
                {result.tool === "grammar" && result.data ? (
                  <GrammarMetaCard data={result.data} />
                ) : null}
              </>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={retry}
                testID="retry-btn"
              >
                <Ionicons name="refresh" size={14} color={COLORS.text} />
                <Text style={styles.ghostBtnText}>RETRY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={dismiss}
                testID="dismiss-btn"
              >
                <Ionicons name="close" size={14} color={COLORS.text} />
                <Text style={styles.ghostBtnText}>DISMISS</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <ToolPickerSheet
        visible={toolPickerOpen}
        activeTool={activeTool}
        onClose={() => setToolPickerOpen(false)}
        onSelect={onPressTool}
      />

      <ToolOptionsSheet
        toolId={optionsOpen}
        pendingOptions={pendingOptions}
        onChangeOption={(key, value) =>
          setPendingOptions((p) => ({ ...p, [key]: value }))
        }
        onCancel={() => setOptionsOpen(null)}
        onRun={() => {
          const tool = optionsOpen;
          setOptionsOpen(null);
          if (tool) runTool(tool, pendingOptions);
        }}
      />

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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 8,
    paddingBottom: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
  },
  title: {
    fontSize: 32,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: -1.2,
    lineHeight: 34,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.brutalSm,
  },
  avatarText: { fontSize: 18, fontWeight: FONT.black, color: COLORS.text },
  section: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.text,
    marginTop: 24,
    marginBottom: 12,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    ...SHADOW.brutalSm,
  },
  dropdownLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  dropdownIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownLabel: { fontSize: 15, fontWeight: FONT.black, color: COLORS.text },
  dropdownSub: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: FONT.regular,
  },
  thinkingCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginTop: 12,
    ...SHADOW.brutal,
  },
  thinking: { fontSize: 13, color: COLORS.text, fontWeight: FONT.bold },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  ghostBtnText: {
    fontSize: 11,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  error: {
    marginTop: 12,
    color: "#B91C1C",
    fontWeight: FONT.bold,
    fontSize: 13,
  },
  toast: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOW.brutalSm,
  },
  toastText: {
    color: COLORS.bg,
    fontWeight: FONT.black,
    fontSize: 13,
    letterSpacing: 1,
  },
  usageChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.peach,
    marginBottom: 10,
  },
  usageChipText: {
    fontSize: 11,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  usageChipSub: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.text,
    opacity: 0.6,
  },
});
