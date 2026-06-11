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
  Share,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme, AccentName, PatternName, ThemeMode } from "@/src/contexts/ThemeContext";
import { PatternBackground, PatternSvg, PATTERNS } from "@/src/components/PatternBackground";
import { AccentColorPicker } from "@/src/components/AccentColorPicker";
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
  const { mode, accent, customAccent, pattern, setMode, setAccent, setCustomAccent, setPattern, accentColor } = useTheme();
  const router = useRouter();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

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

  const pickPattern = (p: PatternName) => {
    if (p !== "classic" && !isPremium) {
      router.push("/pricing");
      return;
    }
    setPattern(p);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          "Check out KeyMind AI Keyboard — my AI writing co-pilot for grammar, translation & more! https://keymind.app",
      });
    } catch {
      // user dismissed or share unsupported — ignore
    }
  };

  const handleReview = () => {
    Linking.openURL("https://play.google.com/store/apps/details?id=com.keymind.app").catch(
      () => {},
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <PatternBackground />
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
                  <Text style={styles.pillText}>
                    {user?.premium_source === "admin" ? "AD-FREE" : "PREMIUM"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Account details — list rows like Name / Email / Subscription */}
        <View style={styles.listCard} testID="account-list-card">
          <View style={styles.listRow}>
            <Text style={styles.listRowLabel}>Name</Text>
            <Text style={styles.listRowValue} numberOfLines={1} testID="settings-row-name">
              {user?.name || "Guest"}
            </Text>
          </View>
          <View style={styles.listDivider} />
          <View style={styles.listRow}>
            <Text style={styles.listRowLabel}>Email</Text>
            <Text style={styles.listRowValue} numberOfLines={1} testID="settings-row-email">
              {user?.email || "—"}
            </Text>
          </View>
          <View style={styles.listDivider} />
          <TouchableOpacity
            style={styles.listRow}
            onPress={() => router.push("/pricing")}
            testID="settings-row-subscription"
          >
            <Text style={styles.listRowLabel}>Subscription</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.listRowValue}>{isPremium ? "Premium" : "Basic"}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
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

        {/* Premium CTA for non-premium users */}
        {!isPremium && (
          <TouchableOpacity
            style={[styles.proCard, { backgroundColor: COLORS.primary }]}
            onPress={() => router.push("/pricing")}
            testID="settings-pricing-btn"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.proEyebrow}>UNLIMITED & AD-FREE</Text>
              <Text style={styles.proTitle}>Go Premium</Text>
              <Text style={styles.proSub}>From ₹250/week · Cancel anytime</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={36} color={COLORS.onPrimary} />
          </TouchableOpacity>
        )}

        {/* Manage subscription for paid users */}
        {user?.premium_source === "subscription" && user?.subscription_expires_at && (
          <TouchableOpacity
            style={styles.subCard}
            onPress={() => router.push("/pricing")}
            testID="settings-manage-sub"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.subEyebrow}>
                {user.subscription_plan === "weekly" ? "WEEKLY PLAN" : "MONTHLY PLAN"} · ACTIVE
              </Text>
              <Text style={styles.subTitle}>Manage subscription</Text>
              <Text style={styles.subSub}>
                Renews / expires {new Date(user.subscription_expires_at).toLocaleDateString()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={28} color={COLORS.text} />
          </TouchableOpacity>
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
          {(
            [
              { id: "light", label: "Light", icon: "sunny", bg: COLORS.bg, fg: COLORS.text },
              { id: "matte", label: "Matte", icon: "contrast", bg: COLORS.bgMatte, fg: COLORS.textInverse },
              { id: "dark", label: "Dark", icon: "moon", bg: COLORS.bgDark, fg: COLORS.textInverse },
            ] as { id: ThemeMode; label: string; icon: any; bg: string; fg: string }[]
          ).map((m) => (
            <TouchableOpacity
              key={m.id}
              onPress={() => setMode(m.id)}
              style={[
                styles.themeCard,
                { backgroundColor: m.bg },
                mode === m.id && SHADOW.brutalSm,
                mode === m.id && { borderColor: COLORS.border },
              ]}
              testID={`settings-theme-${m.id}`}
            >
              <Ionicons name={m.icon} size={24} color={m.fg} />
              <Text style={[styles.themeLabel, { color: m.fg }]}>{m.label}</Text>
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
                accent === a.id && !customAccent && SHADOW.brutalSm,
              ]}
              testID={`settings-accent-${a.id}`}
            >
              {accent === a.id && !customAccent && (
                <Ionicons name="checkmark" size={20} color={COLORS.text} />
              )}
            </TouchableOpacity>
          ))}
          {/* Custom color — premium */}
          <TouchableOpacity
            onPress={() => {
              if (!isPremium) {
                router.push("/pricing");
                return;
              }
              setColorPickerOpen(true);
            }}
            style={[
              styles.accent,
              { backgroundColor: customAccent || COLORS.surface },
              !!customAccent && SHADOW.brutalSm,
            ]}
            testID="settings-accent-custom"
          >
            {customAccent ? (
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            ) : (
              <Ionicons
                name={isPremium ? "color-palette" : "lock-closed"}
                size={18}
                color={COLORS.text}
              />
            )}
          </TouchableOpacity>
        </View>
        {!isPremium && (
          <Text style={styles.patternHint}>
            Want any color you like? The custom color picker is a Premium perk.
          </Text>
        )}

        <AccentColorPicker
          visible={colorPickerOpen}
          selected={customAccent}
          onClose={() => setColorPickerOpen(false)}
          onPick={(hex) => setCustomAccent(hex)}
        />

        {/* Background pattern — premium */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.section}>BACKGROUND PATTERN</Text>
          <View style={styles.premiumTag}>
            <Ionicons name="diamond" size={9} color={COLORS.text} />
            <Text style={styles.premiumTagText}>PREMIUM</Text>
          </View>
        </View>
        <View style={[styles.row, { flexWrap: "wrap" }]}>
          {PATTERNS.map((p) => {
            const locked = p.id !== "classic" && !isPremium;
            const active = pattern === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => pickPattern(p.id)}
                style={[styles.patternCard, active && SHADOW.brutalSm]}
                testID={`settings-pattern-${p.id}`}
              >
                <View style={styles.patternPreview}>
                  <PatternSvg pattern={p.id} opacity={0.35} />
                  {locked && (
                    <View style={styles.patternLock}>
                      <Ionicons name="lock-closed" size={14} color={COLORS.text} />
                    </View>
                  )}
                  {active && !locked && (
                    <View style={styles.patternCheck}>
                      <Ionicons name="checkmark" size={14} color={COLORS.bg} />
                    </View>
                  )}
                </View>
                <Text style={styles.patternLabel}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {!isPremium && (
          <Text style={styles.patternHint}>
            Unlock patterns with Premium — tap any pattern to see plans.
          </Text>
        )}

        {/* Share / feedback / review */}
        <Text style={styles.section}>SUPPORT KEYMIND</Text>
        <View style={styles.listCard} testID="support-list-card">
          <TouchableOpacity style={styles.listRow} onPress={handleShare} testID="settings-share-btn">
            <View style={styles.listIconWrap}>
              <Ionicons name="share-outline" size={18} color={COLORS.text} />
            </View>
            <Text style={styles.listRowTitle}>Share KeyMind</Text>
          </TouchableOpacity>
          <View style={styles.listDivider} />
          <TouchableOpacity style={styles.listRow} onPress={handleReview} testID="settings-review-btn">
            <View style={styles.listIconWrap}>
              <Ionicons name="star-outline" size={18} color={COLORS.text} />
            </View>
            <Text style={styles.listRowTitle}>Review on the Play Store</Text>
          </TouchableOpacity>
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
  proEyebrow: { fontSize: 11, fontWeight: FONT.black, color: COLORS.onPrimary, letterSpacing: 1.5 },
  proTitle: { marginTop: 4, fontSize: 24, fontWeight: FONT.black, color: COLORS.onPrimary, letterSpacing: -1 },
  proSub: { marginTop: 2, fontSize: 13, fontWeight: FONT.bold, color: COLORS.onPrimary },

  subCard: {
    marginTop: 16, padding: 16, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.mint, flexDirection: "row", alignItems: "center", ...SHADOW.brutalSm,
  },
  subEyebrow: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1.5 },
  subTitle: { marginTop: 4, fontSize: 18, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -0.5 },
  subSub: { marginTop: 2, fontSize: 12, fontWeight: FONT.bold, color: COLORS.text, opacity: 0.85 },

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

  // Pattern themes
  premiumTag: {
    flexDirection: "row", alignItems: "center", gap: 3,
    marginTop: 28, marginBottom: 10,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.secondary, borderWidth: 2, borderColor: COLORS.border,
  },
  premiumTagText: { fontSize: 9, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1 },
  patternCard: {
    width: 86, alignItems: "center", gap: 6,
    borderRadius: RADIUS.md,
  },
  patternPreview: {
    width: 86, height: 60, borderRadius: RADIUS.md, overflow: "hidden",
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center",
  },
  patternLock: {
    position: "absolute",
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.secondary, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  patternCheck: {
    position: "absolute",
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.text, borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
  },
  patternLabel: { fontSize: 11, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.3 },
  patternHint: { marginTop: 10, fontSize: 11, color: COLORS.textMuted, fontWeight: FONT.bold },

  // Grouped list rows (Name / Email / Subscription, Share / Feature / Review)
  listCard: {
    marginTop: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    ...SHADOW.brutalSm,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    gap: 10,
  },
  listRowLabel: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.text },
  listRowValue: { fontSize: 13, fontWeight: FONT.regular, color: COLORS.textMuted, flexShrink: 1 },
  listRowTitle: { flex: 1, fontSize: 14, fontWeight: FONT.bold, color: COLORS.text },
  listDivider: { height: 1.5, backgroundColor: COLORS.borderSoft },
  listIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    alignItems: "center",
    justifyContent: "center",
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
