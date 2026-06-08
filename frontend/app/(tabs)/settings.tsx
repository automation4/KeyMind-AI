import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme, AccentName } from "@/src/contexts/ThemeContext";

const ACCENTS: { id: AccentName; color: string }[] = [
  { id: "orange", color: COLORS.primary },
  { id: "yellow", color: COLORS.secondary },
  { id: "mint", color: COLORS.mint },
  { id: "peach", color: COLORS.peach },
  { id: "sky", color: COLORS.sky },
  { id: "lilac", color: COLORS.lilac },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { mode, accent, setMode, setAccent, accentColor } = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.eyebrow}>YOU</Text>
        <Text style={styles.title}>Settings.</Text>

        {/* Account card */}
        <View style={styles.card}>
          <View style={[styles.avatar, { backgroundColor: accentColor }]}>
            <Text style={styles.avatarText}>
              {(user?.name || "U").trim()[0]?.toUpperCase() || "U"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} testID="settings-user-name">{user?.name || "Guest"}</Text>
            <Text style={styles.userEmail} testID="settings-user-email">{user?.email || "—"}</Text>
            {user?.is_guest && (
              <View style={styles.guestPill}>
                <Text style={styles.guestPillText}>GUEST MODE</Text>
              </View>
            )}
          </View>
        </View>

        {/* Pricing CTA */}
        <TouchableOpacity
          style={[styles.proCard, { backgroundColor: COLORS.primary }]}
          onPress={() => router.push("/pricing")}
          testID="settings-pricing-btn"
        >
          <View>
            <Text style={styles.proEyebrow}>UNLIMITED EVERYTHING</Text>
            <Text style={styles.proTitle}>Go Premium</Text>
            <Text style={styles.proSub}>₹500/mo · No ads · Unlimited AI tools</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={36} color={COLORS.text} />
        </TouchableOpacity>

        {/* Theme */}
        <Text style={styles.section}>THEME</Text>
        <View style={styles.row}>
          {(["light", "dark"] as const).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              style={[
                styles.themeCard,
                { backgroundColor: m === "light" ? COLORS.bg : COLORS.bgDark },
                mode === m && SHADOW.brutalSm,
                mode === m && { borderColor: COLORS.border },
              ]}
              testID={`settings-theme-${m}`}
            >
              <Ionicons name={m === "light" ? "sunny" : "moon"} size={24} color={m === "light" ? COLORS.text : COLORS.textInverse} />
              <Text style={[styles.themeLabel, { color: m === "light" ? COLORS.text : COLORS.textInverse }]}>
                {m === "light" ? "Light" : "Dark"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Accent */}
        <Text style={styles.section}>ACCENT</Text>
        <View style={[styles.row, { flexWrap: "wrap" }]}>
          {ACCENTS.map((a) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => setAccent(a.id)}
              style={[
                styles.accent,
                { backgroundColor: a.color },
                accent === a.id && SHADOW.brutalSm,
              ]}
              testID={`settings-accent-${a.id}`}
            >
              {accent === a.id && <Ionicons name="checkmark" size={20} color={COLORS.text} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={signOut} testID="settings-logout-btn">
          <Ionicons name="log-out-outline" size={18} color={COLORS.text} />
          <Text style={styles.logoutText}>SIGN OUT</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>KeyMind AI · v1.0 · Built for writers everywhere.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  eyebrow: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  title: { marginTop: 4, fontSize: 32, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.2 },
  card: {
    marginTop: 20, padding: 16, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, flexDirection: "row", alignItems: "center", gap: 16, ...SHADOW.brutalSm,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 16, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 22, fontWeight: FONT.black, color: COLORS.text },
  userName: { fontSize: 18, fontWeight: FONT.black, color: COLORS.text },
  userEmail: { marginTop: 2, fontSize: 13, color: COLORS.textMuted },
  guestPill: {
    alignSelf: "flex-start", marginTop: 8,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.peach,
  },
  guestPillText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },
  proCard: {
    marginTop: 16, padding: 18, borderRadius: RADIUS.lg, borderWidth: 3, borderColor: COLORS.border,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", ...SHADOW.brutal,
  },
  proEyebrow: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1.5 },
  proTitle: { marginTop: 4, fontSize: 24, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1 },
  proSub: { marginTop: 2, fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },
  section: { marginTop: 28, marginBottom: 10, fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  row: { flexDirection: "row", gap: 10 },
  themeCard: {
    flex: 1, padding: 18, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center", gap: 6, height: 90,
  },
  themeLabel: { fontSize: 13, fontWeight: FONT.bold },
  accent: {
    width: 48, height: 48, borderRadius: 12,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  logoutBtn: {
    marginTop: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, ...SHADOW.brutalSm,
  },
  logoutText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  footer: { marginTop: 32, fontSize: 11, textAlign: "center", color: COLORS.textMuted, letterSpacing: 0.5 },
});
