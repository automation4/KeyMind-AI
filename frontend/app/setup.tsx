import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { storage } from "@/src/utils/storage";
import { useTheme, AccentName } from "@/src/contexts/ThemeContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";

const LANGUAGES = [
  "English", "Hindi", "Sanskrit", "Hinglish", "Bengali", "Tamil", "Telugu", "Marathi",
  "Gujarati", "Kannada", "Malayalam", "Punjabi", "Odia", "Urdu", "Assamese",
];

const ACCENTS: { id: AccentName; color: string; label: string }[] = [
  { id: "orange", color: COLORS.primary, label: "Indigo" },
  { id: "yellow", color: COLORS.secondary, label: "Butter" },
  { id: "mint", color: COLORS.mint, label: "Mint" },
  { id: "peach", color: COLORS.peach, label: "Peach" },
  { id: "sky", color: COLORS.sky, label: "Sky" },
  { id: "lilac", color: COLORS.lilac, label: "Lilac" },
];

export default function Setup() {
  const router = useRouter();
  const { mode, accent, setMode, setAccent } = useTheme();
  const { user, refreshUser } = useAuth();
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["English", "Hindi"]);

  const toggleLang = (l: string) => {
    setSelectedLangs((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  const finish = async () => {
    await storage.setItem("keymind_languages", JSON.stringify(selectedLangs));
    await storage.setItem("keymind_setup_done", true);
    // Persist on the user record (server-side) so returning users skip setup
    // on a fresh install / cache wipe — except true guests which are device-bound.
    if (user && !user.is_guest) {
      try {
        await api.setupComplete();
        await refreshUser();
      } catch {}
    }
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
          <Text style={styles.langHint} testID="setup-lang-hint">
            {selectedLangs.length} SELECTED
          </Text>
        </View>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => {
            const active = selectedLangs.includes(l);
            return (
              <TouchableOpacity
                key={l}
                onPress={() => toggleLang(l)}
                style={[styles.chip, active && styles.chipActive]}
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

        <Text style={styles.section}>ACCENT COLOR</Text>
        <View style={styles.accents}>
          {ACCENTS.map((a) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => setAccent(a.id)}
              style={[
                styles.accent,
                { backgroundColor: a.color },
                accent === a.id && styles.accentActive,
              ]}
              testID={`setup-accent-${a.id}`}
            >
              {accent === a.id ? <Ionicons name="checkmark" size={20} color={COLORS.text} /> : null}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.cta} onPress={finish} testID="setup-finish-btn">
          <Text style={styles.ctaText}>START WRITING</Text>
          <Ionicons name="arrow-forward" size={22} color={COLORS.bg} />
        </TouchableOpacity>
      </ScrollView>
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
    flex: 1, alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 24, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.borderSoft,
  },
  themeCardActive: { borderColor: COLORS.border, ...SHADOW.brutalSm },
  themeLabel: { fontSize: 14, fontWeight: FONT.black, letterSpacing: 1 },
  accents: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  accent: {
    width: 56, height: 56, borderRadius: 18, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  accentActive: { ...SHADOW.brutalSm, transform: [{ scale: 1.06 }] },
  cta: {
    marginTop: 40, paddingVertical: 16,
    borderRadius: RADIUS.lg, backgroundColor: COLORS.text,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10,
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutal,
  },
  ctaText: { color: COLORS.bg, fontSize: 16, fontWeight: FONT.black, letterSpacing: 2 },
});
