import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
  Share,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

// Vivid blue → purple → pink → red gradient used on the "Sign in to upgrade"
// card. Matches the reference screenshot the user provided.
const SIGNIN_GRADIENT = ["#3b5bf2", "#7a3cf4", "#c93cd2", "#ff3a6b", "#ff5c2f"] as const;

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTheme, AccentName, PatternName, ThemeMode } from "@/src/contexts/ThemeContext";
import { PatternBackground, PatternSvg, PATTERNS } from "@/src/components/PatternBackground";
import { AccentColorPicker } from "@/src/components/AccentColorPicker";
import { api } from "@/src/lib/api";
import { useScrollFab } from "@/src/components/ScrollFab";
import { contrastOn } from "@/src/lib/colorUtils";
import { useDictateLanguage } from "@/src/hooks/useDictateLanguage";

type AccentDef = { id: AccentName; color: string };

// All accents are available to everyone. KeyMind has no public premium tier.
// Black ("ink") is the default and appears first. The legacy "orange" (which
// was actually indigo #4F46E5) was removed per UX feedback — the gradient
// brand colors should not be a per-accent choice.
const ACCENTS: AccentDef[] = [
  { id: "ink", color: COLORS.text },
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
  const { user, signOut, deviceId, refreshUser } = useAuth();
  // Refresh the user (and therefore the daily-usage counter) every time
  // Settings is focused — guarantees the count never looks stale after the
  // user runs tools on Home or Chat tabs.
  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [refreshUser]),
  );
  const tabBarHeight = useBottomTabBarHeight();
  const scrollRef = useRef<ScrollView>(null);
  const fab = useScrollFab(scrollRef, { bottomOffset: tabBarHeight + 16 });
  const { mode, accent, customAccent, pattern, setMode, setAccent, setCustomAccent, setPattern, accentColor } = useTheme();
  const dictate = useDictateLanguage();
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
          "Check out KeyMind AI — my AI writing co-pilot for grammar, translation & more! https://keymind.app",
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
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        onScroll={fab.onScroll}
        scrollEventThrottle={fab.scrollEventThrottle}
        onLayout={fab.onLayout}
        onContentSizeChange={fab.onContentSizeChange}
      >
        <Text style={styles.eyebrow}>YOU</Text>
        <Text style={styles.title}>Settings.</Text>

        {/* Account card */}
        <View style={styles.card}>
          <View style={[styles.avatar, { backgroundColor: accentColor }]}>
            <Text
              style={[
                styles.avatarText,
                // Auto-pick black or white based on background luminance —
                // covers ink, light pastels (mint/peach/sky/lilac/yellow)
                // and any custom hex the user picked.
                { color: contrastOn(accentColor) },
              ]}
            >
              {(user?.name || "U").trim()[0]?.toUpperCase() || "U"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={styles.userName} testID="settings-user-name">{user?.name || "Guest"}</Text>
              {isPremium && (
                <View style={styles.premiumGoldPill} testID="settings-premium-badge">
                  <Ionicons name="star" size={11} color="#3B2A00" />
                  <Text style={styles.premiumGoldPillText}>PREMIUM</Text>
                </View>
              )}
            </View>
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
            </View>
          </View>
        </View>

        {/* Account details card removed per user request — name/email already shown above; subscription accessible via premium upsells */}

        {/* Usage card (only when daily limit applies, i.e. not ad-free) */}
        {!isPremium && (
          <View style={styles.usageCard} testID="usage-card">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.usageLabel}>DAILY AI USAGE</Text>
              <Text style={styles.usageCount}>
                {user?.tool_uses_today ?? 0} / {user?.tool_uses_limit ?? 5}
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

        {/* Premium CTA for non-premium users — hidden for guests (must sign in first) */}
        {!isPremium && !user?.is_guest && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/pricing")}
            testID="settings-pricing-btn"
            style={styles.signInGradientWrap}
          >
            <LinearGradient
              colors={SIGNIN_GRADIENT as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.signInGradientInner}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.proEyebrow, { color: "#ffffff", opacity: 0.95 }]}>UNLIMITED & AD-FREE</Text>
                <Text style={[styles.proTitle, { color: "#ffffff" }]}>Go Premium</Text>
                <Text style={[styles.proSub, { color: "#ffffff", opacity: 0.9 }]}>From ₹250/week · Cancel anytime</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={36} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Sign-in CTA for guests in place of Go Premium */}
        {!isPremium && user?.is_guest && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.replace("/login")}
            testID="settings-signin-btn"
            style={styles.signInGradientWrap}
          >
            <LinearGradient
              colors={SIGNIN_GRADIENT as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.signInGradientInner}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.proEyebrow, { color: "#ffffff", opacity: 0.95 }]}>SIGN IN TO UPGRADE</Text>
                <Text style={[styles.proTitle, { color: "#ffffff" }]}>Sign in</Text>
                <Text style={[styles.proSub, { color: "#ffffff", opacity: 0.9 }]}>Premium upgrades are tied to your account.</Text>
              </View>
              <Ionicons name="log-in-outline" size={32} color="#ffffff" />
            </LinearGradient>
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

        {/* Dictation language — controls how voice → text works in Chat. */}
        <Text style={styles.section}>DICTATION LANGUAGE</Text>
        <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
          {dictate.options.map((o) => {
            const key = o.uiKey ?? o.code;
            const active = dictate.uiKey === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => dictate.setLanguage(key)}
                style={[
                  styles.langChip,
                  active && { backgroundColor: accentColor, borderColor: accentColor },
                ]}
                testID={`settings-dictate-${key}`}
              >
                <Text
                  style={[
                    styles.langChipText,
                    active && { color: contrastOn(accentColor) },
                  ]}
                >
                  {o.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Tap the 🎙️ button in Chat to dictate. &quot;Auto (mixed)&quot; and &quot;Hinglish&quot; let Whisper code-switch naturally between Hindi and English.
        </Text>

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
                style={styles.patternCard}
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
          <View style={styles.listDivider} />
          <TouchableOpacity
            style={styles.listRow}
            onPress={() => router.push("/terms")}
            testID="settings-terms-btn"
          >
            <View style={styles.listIconWrap}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.text} />
            </View>
            <Text style={styles.listRowTitle}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
          <View style={styles.listDivider} />
          <TouchableOpacity
            style={styles.listRow}
            onPress={() => router.push("/privacy")}
            testID="settings-privacy-btn"
          >
            <View style={styles.listIconWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.text} />
            </View>
            <Text style={styles.listRowTitle}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Diagnostics — admin only. Useful for verifying the stable device id
            we send to the backend for guest-user persistence across reinstalls. */}
        {isAdmin && (
          <View style={styles.diagCard} testID="settings-diag-card">
            <Text style={styles.diagTitle}>DIAGNOSTICS</Text>
            <Text style={styles.diagLabel}>Device ID</Text>
            <TouchableOpacity
              onPress={async () => {
                if (!deviceId) return;
                try {
                  const ClipMod = await import("expo-clipboard");
                  await ClipMod.setStringAsync(deviceId);
                  if (Platform.OS === "android") {
                    const { ToastAndroid } = await import("react-native");
                    ToastAndroid.show("Device ID copied", ToastAndroid.SHORT);
                  } else {
                    Alert.alert("Device ID", "Copied to clipboard");
                  }
                } catch {}
              }}
              testID="settings-device-id-copy"
            >
              <Text style={styles.diagValue} numberOfLines={1}>
                {deviceId || "(resolving…)"}
              </Text>
              <Text style={styles.diagHint}>Tap to copy</Text>
            </TouchableOpacity>
          </View>
        )}

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
      {fab.fab}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  diagCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  diagTitle: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 1.4,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  diagLabel: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 0.8,
    color: COLORS.textMuted,
  },
  diagValue: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    color: COLORS.text,
  },
  diagHint: { marginTop: 4, fontSize: 11, color: COLORS.textMuted },
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

  premiumGoldPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    borderColor: "#8A6A00",
    backgroundColor: "#F5C518",
  },
  premiumGoldPillText: {
    fontSize: 10,
    fontWeight: FONT.black,
    color: "#3B2A00",
    letterSpacing: 0.6,
  },

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
  // Gradient version of proCard — wrapper handles the brutal border + shadow,
  // inner LinearGradient owns the colorful fill so the gradient never leaks
  // past the rounded corners.
  signInGradientWrap: {
    marginTop: 16, borderRadius: RADIUS.lg, borderWidth: 3, borderColor: COLORS.border,
    overflow: "hidden", ...SHADOW.brutal,
  },
  signInGradientInner: {
    padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center",
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
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  langChipText: {
    fontSize: 13,
    fontWeight: FONT.bold,
    color: COLORS.text,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
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
