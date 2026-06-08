import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme, AccentName } from "@/src/contexts/ThemeContext";
import { api } from "@/src/lib/api";

type AccentDef = { id: AccentName; color: string };

// All accents are available to everyone. KeyMind has no public premium tier.
const ACCENTS: AccentDef[] = [
  { id: "orange", color: COLORS.primary },
  { id: "yellow", color: COLORS.secondary },
  { id: "mint", color: COLORS.mint },
  { id: "peach", color: COLORS.peach },
  { id: "sky", color: COLORS.sky },
  { id: "lilac", color: COLORS.lilac },
];

type WhitelistEntry = {
  email: string;
  is_premium: boolean;
  added_at?: string;
  name?: string | null;
  has_account: boolean;
  tool_uses_today: number;
};

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { mode, accent, setMode, setAccent, accentColor } = useTheme();
  const router = useRouter();

  const isPremium = !!(user?.is_premium || user?.is_admin);
  const isAdmin = !!user?.is_admin;

  // Admin state
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [wlLoading, setWlLoading] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [wlError, setWlError] = useState<string | null>(null);

  const loadWhitelist = useCallback(async () => {
    if (!isAdmin) return;
    setWlLoading(true);
    try {
      const data = await api.adminList();
      setWhitelist(data.items || []);
    } catch (e: any) {
      setWlError(e?.detail || e?.message || "Failed to load users");
    } finally {
      setWlLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadWhitelist();
  }, [loadWhitelist]);

  const addEmail = async () => {
    setWlError(null);
    const e = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setWlError("Enter a valid email");
      return;
    }
    setAdding(true);
    try {
      await api.adminAdd(e, true);
      setNewEmail("");
      await loadWhitelist();
    } catch (err: any) {
      setWlError(err?.detail || err?.message || "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const togglePremium = async (entry: WhitelistEntry) => {
    try {
      await api.adminToggle(entry.email, !entry.is_premium);
      setWhitelist((prev) =>
        prev.map((w) => (w.email === entry.email ? { ...w, is_premium: !w.is_premium } : w)),
      );
    } catch (err: any) {
      Alert.alert("Update failed", err?.detail || err?.message || "Could not update");
    }
  };

  const removeEntry = (entry: WhitelistEntry) => {
    const confirm = async () => {
      try {
        await api.adminRemove(entry.email);
        setWhitelist((prev) => prev.filter((w) => w.email !== entry.email));
      } catch (err: any) {
        Alert.alert("Remove failed", err?.detail || err?.message || "Could not remove");
      }
    };
    if (Platform.OS === "web") {
      // RN web doesn't support Alert.alert buttons reliably
      if (typeof window !== "undefined" && window.confirm(`Revoke premium for ${entry.email}?`)) {
        confirm();
      }
    } else {
      Alert.alert("Revoke access?", `${entry.email} will be removed from the whitelist.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Revoke", style: "destructive", onPress: confirm },
      ]);
    }
  };

  const pickAccent = (a: AccentDef) => {
    setAccent(a.id);
  };

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
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {user?.is_guest && (
                <View style={[styles.pill, { backgroundColor: COLORS.peach }]}>
                  <Text style={styles.pillText}>GUEST</Text>
                </View>
              )}
              {isAdmin && (
                <View style={[styles.pill, { backgroundColor: COLORS.text }]}>
                  <Text style={[styles.pillText, { color: COLORS.bg }]}>ADMIN</Text>
                </View>
              )}
              {isPremium && !isAdmin && (
                <View style={[styles.pill, { backgroundColor: COLORS.mint }]}>
                  <Text style={styles.pillText}>AD-FREE</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Usage card (only when daily limit applies, i.e. not ad-free) */}
        {!isPremium && (
          <View style={styles.usageCard} testID="usage-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.usageLabel}>DAILY AI USAGE</Text>
              <Text style={styles.usageCount}>
                {user?.tool_uses_today ?? 0} / {user?.tool_uses_limit ?? 10}
              </Text>
            </View>
            <View style={styles.usageBarBg}>
              <View
                style={[
                  styles.usageBarFg,
                  {
                    width: `${Math.min(
                      100,
                      ((user?.tool_uses_today ?? 0) / (user?.tool_uses_limit || 10)) * 100,
                    )}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.usageSub}>
              Resets daily at midnight UTC · All features included.
            </Text>
          </View>
        )}

        {/* Admin panel */}
        {isAdmin && (
          <View testID="admin-panel">
            <Text style={styles.section}>ADMIN · WHITELIST</Text>
            <View style={styles.adminCard}>
              <Text style={styles.adminHelp}>
                Add emails to grant ad-free access. Listed users see no ads and have no daily AI limit.
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <TextInput
                  value={newEmail}
                  onChangeText={(v) => {
                    setNewEmail(v);
                    if (wlError) setWlError(null);
                  }}
                  placeholder="user@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.adminInput}
                  testID="admin-add-input"
                />
                <TouchableOpacity
                  style={[styles.adminAddBtn, adding && { opacity: 0.6 }]}
                  onPress={addEmail}
                  disabled={adding}
                  testID="admin-add-btn"
                >
                  {adding ? (
                    <ActivityIndicator color={COLORS.bg} />
                  ) : (
                    <>
                      <Ionicons name="add" size={16} color={COLORS.bg} />
                      <Text style={styles.adminAddText}>ADD</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              {wlError ? <Text style={styles.errorText}>{wlError}</Text> : null}

              <View style={{ marginTop: 16, gap: 10 }}>
                {wlLoading ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : whitelist.length === 0 ? (
                  <Text style={styles.emptyText}>No whitelisted users yet.</Text>
                ) : (
                  whitelist.map((w) => (
                    <View key={w.email} style={styles.wlRow} testID={`wl-row-${w.email}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.wlEmail} numberOfLines={1}>
                          {w.email}
                        </Text>
                        <Text style={styles.wlMeta}>
                          {w.has_account
                            ? `${w.name || "User"} · ${w.tool_uses_today} uses today`
                            : "Not signed in yet"}
                        </Text>
                      </View>
                      <Switch
                        value={w.is_premium}
                        onValueChange={() => togglePremium(w)}
                        thumbColor={w.is_premium ? COLORS.mint : COLORS.surface}
                        trackColor={{ false: COLORS.borderSoft, true: COLORS.text }}
                        testID={`wl-toggle-${w.email}`}
                      />
                      <TouchableOpacity
                        onPress={() => removeEntry(w)}
                        style={styles.wlRemove}
                        testID={`wl-remove-${w.email}`}
                      >
                        <Ionicons name="trash-outline" size={16} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={loadWhitelist}
                testID="admin-refresh"
              >
                <Ionicons name="refresh" size={14} color={COLORS.text} />
                <Text style={styles.refreshBtnText}>REFRESH</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
              onPress={() => pickAccent(a)}
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
        <TouchableOpacity style={styles.logoutBtn} onPress={async () => {
          await signOut();
          router.replace("/login");
        }} testID="settings-logout-btn">
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
  pill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border,
  },
  pillText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },

  usageCard: {
    marginTop: 14, padding: 14, borderRadius: RADIUS.lg,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface, ...SHADOW.brutalSm,
  },
  usageLabel: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  usageCount: { fontSize: 16, fontWeight: FONT.black, color: COLORS.text },
  usageBarBg: { marginTop: 8, height: 8, borderRadius: 6, backgroundColor: COLORS.borderSoft, overflow: "hidden" },
  usageBarFg: { height: "100%", backgroundColor: COLORS.text },
  usageSub: { marginTop: 8, fontSize: 11, color: COLORS.textMuted, fontWeight: FONT.bold },

  proCard: {
    marginTop: 16, padding: 18, borderRadius: RADIUS.lg, borderWidth: 3, borderColor: COLORS.border,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", ...SHADOW.brutal,
  },
  proEyebrow: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1.5 },
  proTitle: { marginTop: 4, fontSize: 24, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1 },
  proSub: { marginTop: 2, fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },

  section: { marginTop: 28, marginBottom: 10, fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  lockedHint: { marginBottom: 10, fontSize: 10, fontWeight: FONT.black, color: COLORS.textMuted, letterSpacing: 1 },
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

  // Admin panel
  adminCard: {
    padding: 14, borderRadius: RADIUS.lg,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface, ...SHADOW.brutalSm,
  },
  adminHelp: { fontSize: 12, color: COLORS.textMuted, fontWeight: FONT.bold, lineHeight: 18 },
  adminInput: {
    flex: 1, backgroundColor: COLORS.bg, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: COLORS.text, fontWeight: FONT.bold,
  },
  adminAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 14, borderRadius: RADIUS.md,
    backgroundColor: COLORS.text, borderWidth: 2, borderColor: COLORS.border,
  },
  adminAddText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.bg, letterSpacing: 1 },
  errorText: { marginTop: 8, color: "#B91C1C", fontWeight: FONT.bold, fontSize: 12 },
  emptyText: { fontSize: 12, color: COLORS.textMuted, fontWeight: FONT.bold, textAlign: "center", paddingVertical: 8 },
  wlRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    backgroundColor: COLORS.bg, borderWidth: 2, borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.md,
  },
  wlEmail: { fontSize: 13, fontWeight: FONT.black, color: COLORS.text },
  wlMeta: { marginTop: 2, fontSize: 11, color: COLORS.textMuted, fontWeight: FONT.bold },
  wlRemove: {
    width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.peach, borderWidth: 2, borderColor: COLORS.border,
  },
  refreshBtn: {
    marginTop: 14, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bg,
  },
  refreshBtnText: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1, color: COLORS.text },

  logoutBtn: {
    marginTop: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, ...SHADOW.brutalSm,
  },
  logoutText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  footer: { marginTop: 32, fontSize: 11, textAlign: "center", color: COLORS.textMuted, letterSpacing: 0.5 },
});
