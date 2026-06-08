import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { storage } from "@/src/utils/storage";
import { useTheme, AccentName } from "@/src/contexts/ThemeContext";
import { useAuth } from "@/src/contexts/AuthContext";
import { UpgradePrompt } from "@/src/components/UpgradePrompt";

const LANGUAGES = [
  "English", "Hindi", "Sanskrit", "Hinglish", "Bengali", "Tamil", "Telugu", "Marathi",
  "Gujarati", "Kannada", "Malayalam", "Punjabi", "Odia", "Urdu", "Assamese",
];

const ACCENTS: { id: AccentName; color: string; label: string; locked?: boolean }[] = [
  { id: "orange", color: COLORS.primary, label: "Orange" },
  { id: "yellow", color: COLORS.secondary, label: "Butter" },
  { id: "mint", color: COLORS.mint, label: "Mint", locked: true },
  { id: "peach", color: COLORS.peach, label: "Peach", locked: true },
  { id: "sky", color: COLORS.sky, label: "Sky", locked: true },
  { id: "lilac", color: COLORS.lilac, label: "Lilac", locked: true },
];

const FREE_LANG_LIMIT = 3;

export default function Setup() {
  const router = useRouter();
  const { mode, accent, setMode, setAccent } = useTheme();
  const { user } = useAuth();
  const isPremium = !!(user?.is_premium || user?.is_admin);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["English", "Hindi"]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState<string | undefined>();

  const toggleLang = (l: string) => {
    setSelectedLangs((prev) => {
      if (prev.includes(l)) return prev.filter((x) => x !== l);
      if (!isPremium && prev.length >= FREE_LANG_LIMIT) {
        setUpgradeMessage(`Free plan supports up to ${FREE_LANG_LIMIT} languages. Upgrade for all 50+.`);
        setUpgradeOpen(true);
        return prev;
      }
      return [...prev, l];
    });
  };

  const pickAccent = (a: typeof ACCENTS[number]) => {
    if (a.locked && !isPremium) {
      setUpgradeMessage("This accent is a Premium theme. Upgrade to unlock all 6 colors.");
      setUpgradeOpen(true);
      return;
    }
    setAccent(a.id);
  };

  const finish = async () => {
    await storage.setItem("keymind_languages", JSON.stringify(selectedLangs));
    await storage.setItem("keymind_setup_done", true);
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>STEP 1 / 1</Text>
        <Text style={styles.title}>Make it{"\n"}yours.</Text>
        <Text style={styles.subtitle}>Pick your languages and a theme. You can change these later.</Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Text style={styles.section}>LANGUAGES YOU WRITE IN</Text>
          {!isPremium && (
            <Text style={styles.langHint} testID="setup-lang-hint">
              {selectedLangs.length}/{FREE_LANG_LIMIT} · FREE
            </Text>
          )}
        </View>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => {
            const active = selectedLangs.includes(l);
            const wouldExceed = !active && !isPremium && selectedLangs.length >= FREE_LANG_LIMIT;
            return (
              <TouchableOpacity
                key={l}
                onPress={() => toggleLang(l)}
                style={[
                  styles.chip,
                  active && styles.chipActive,
                  wouldExceed && { opacity: 0.45 },
                ]}
                testID={`setup-lang-${l.toLowerCase()}`}
              >
                {active ? <Ionicons name="checkmark" size={14} color={COLORS.bg} /> : null}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.section}>THEME</Text>
        <View style={styles.themeRow}>
          {(["light", "dark"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.themeCard,
                { backgroundColor: m === "light" ? COLORS.bg : COLORS.bgDark },
                mode === m && styles.themeCardActive,
              ]}
              testID={`setup-theme-${m}`}
            >
              <Ionicons
                name={m === "light" ? "sunny" : "moon"}
                size={28}
                color={m === "light" ? COLORS.text : COLORS.textInverse}
              />
              <Text style={[styles.themeLabel, { color: m === "light" ? COLORS.text : COLORS.textInverse }]}>
                {m === "light" ? "Light" : "Dark"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <Text style={styles.section}>ACCENT COLOR</Text>
          {!isPremium && <Text style={styles.langHint}>4 LOCKED</Text>}
        </View>
        <View style={styles.accents}>
          {ACCENTS.map((a) => {
            const locked = a.locked && !isPremium;
            return (
              <TouchableOpacity
                key={a.id}
                onPress={() => pickAccent(a)}
                style={[
                  styles.accent,
                  { backgroundColor: a.color },
                  accent === a.id && styles.accentActive,
                  locked && { opacity: 0.55 },
                ]}
                testID={`setup-accent-${a.id}`}
              >
                {accent === a.id && !locked ? <Ionicons name="checkmark" size={20} color={COLORS.text} /> : null}
                {locked && <Ionicons name="lock-closed" size={16} color={COLORS.text} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.cta} onPress={finish} testID="setup-finish-btn">
          <Text style={styles.ctaText}>START WRITING</Text>
          <Ionicons name="arrow-forward" size={22} color={COLORS.bg} />
        </TouchableOpacity>
      </ScrollView>

      <UpgradePrompt
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        message={upgradeMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  eyebrow: { fontSize: 12, fontWeight: FONT.black, letterSpacing: 2, color: COLORS.textMuted },
  title: { marginTop: 8, fontSize: 40, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.5, lineHeight: 44 },
  subtitle: { marginTop: 10, fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },
  section: { marginTop: 32, marginBottom: 12, fontSize: 12, fontWeight: FONT.black, letterSpacing: 2, color: COLORS.text },
  langHint: { fontSize: 11, fontWeight: FONT.black, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: RADIUS.pill, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.text },
  chipText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },
  chipTextActive: { color: COLORS.bg },
  themeRow: { flexDirection: "row", gap: 12 },
  themeCard: {
    flex: 1, padding: 20, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", gap: 8, height: 100,
  },
  themeCardActive: { ...SHADOW.brutal },
  themeLabel: { fontSize: 14, fontWeight: FONT.bold },
  accents: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  accent: {
    width: 56, height: 56, borderRadius: RADIUS.md,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  accentActive: { ...SHADOW.brutalSm },
  cta: {
    marginTop: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    backgroundColor: COLORS.text, borderWidth: 3, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingVertical: 18, ...SHADOW.brutal,
  },
  ctaText: { fontSize: 15, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.bg },
});
