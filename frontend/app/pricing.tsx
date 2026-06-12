import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/contexts/AuthContext";

type Plan = {
  id: "weekly" | "monthly";
  label: string;
  price_inr: number;
  days: number;
};

const FEATURES = [
  "Unlimited AI tool uses every day",
  "Ad-free experience across the app",
  "All 13 writing tools + Vocab",
  "Translate to 15+ languages incl. Sanskrit",
  "Priority access to new features",
];

export default function Pricing() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<"weekly" | "monthly">("monthly");
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.listPlans();
        setPlans(res.plans as Plan[]);
      } catch (e: any) {
        Alert.alert("Couldn't load pricing", e?.detail || "Please try again later.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAdminGranted = user?.is_premium && user?.premium_source === "admin";
  const isSubscribed = user?.is_premium && user?.premium_source === "subscription";
  const isGuest = !!user?.is_guest;

  const onSubscribe = async () => {
    if (!user || isGuest) {
      Alert.alert(
        "Sign in to subscribe",
        "Premium upgrades are tied to your account. Please sign in with Google or email to continue.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign in", onPress: () => router.replace("/login") },
        ],
      );
      return;
    }
    setSubscribing(true);
    try {
      const res = await api.subscribe(selected);
      await refreshUser();
      Alert.alert(
        "Mock payment successful",
        `${selected === "weekly" ? "Weekly" : "Monthly"} plan active until ${new Date(
          res.expires_at,
        ).toLocaleDateString()}.\n\n(No real charge — payment gateway not wired yet.)`,
      );
      router.back();
    } catch (e: any) {
      Alert.alert("Subscription failed", e?.detail || "Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  const onCancel = async () => {
    Alert.alert(
      "Cancel subscription?",
      "Your premium access will end immediately. You'll keep all features but get the daily 10/day limit and ads back.",
      [
        { text: "Keep premium", style: "cancel" },
        {
          text: "Cancel",
          style: "destructive",
          onPress: async () => {
            setCanceling(true);
            try {
              await api.cancelSubscription();
              await refreshUser();
              router.back();
            } catch (e: any) {
              Alert.alert("Couldn't cancel", e?.detail || "Try again later.");
            } finally {
              setCanceling(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={COLORS.text} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} testID="pricing-close">
            <Ionicons name="close" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.eyebrow}>KEYMIND PREMIUM</Text>
        <Text style={styles.title}>Write without{"\n"}limits.</Text>
        <Text style={styles.subtitle}>
          Remove ads and unlock unlimited AI uses. Cancel anytime.
        </Text>

        {isAdminGranted ? (
          <View style={[styles.banner, { backgroundColor: COLORS.mint }]} testID="admin-granted-banner">
            <Ionicons name="ribbon" size={20} color={COLORS.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>You{`'`}ve been gifted Premium</Text>
              <Text style={styles.bannerSub}>
                An admin granted you ad-free unlimited access — no subscription needed.
              </Text>
            </View>
          </View>
        ) : null}

        {isSubscribed && user?.subscription_expires_at ? (
          <View style={[styles.banner, { backgroundColor: COLORS.secondary }]} testID="active-sub-banner">
            <Ionicons name="checkmark-circle" size={20} color={COLORS.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>
                {user.subscription_plan === "weekly" ? "Weekly" : "Monthly"} plan active
              </Text>
              <Text style={styles.bannerSub}>
                Renews / expires {new Date(user.subscription_expires_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.featureCard}>
          {FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.text} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        {!isAdminGranted && isGuest && (
          <View style={[styles.banner, { backgroundColor: COLORS.peach }]} testID="guest-signin-banner">
            <Ionicons name="log-in-outline" size={20} color={COLORS.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Sign in to upgrade</Text>
              <Text style={styles.bannerSub}>
                Premium upgrades are tied to your account. Sign in with Google or email to choose a plan.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.signInBtn}
              onPress={() => router.replace("/login")}
              testID="guest-signin-btn"
            >
              <Text style={styles.signInBtnText}>SIGN IN</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isAdminGranted && !isGuest && (
          <>
            <Text style={styles.sectionLabel}>CHOOSE A PLAN</Text>
            <View style={{ gap: 12 }}>
              {plans.map((p) => {
                const active = selected === p.id;
                const isMonthly = p.id === "monthly";
                const perDay = Math.round((p.price_inr / p.days) * 100) / 100;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setSelected(p.id)}
                    activeOpacity={0.85}
                    style={[styles.planCard, active && styles.planCardActive]}
                    testID={`plan-${p.id}`}
                  >
                    <View style={styles.planLeft}>
                      <View style={[styles.radio, active && styles.radioOn]}>
                        {active ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.planLabel}>{p.label}</Text>
                          {isMonthly ? (
                            <View style={styles.bestPill}>
                              <Text style={styles.bestPillText}>BEST VALUE</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.planSub}>≈ ₹{perDay} / day · {p.days} days access</Text>
                      </View>
                    </View>
                    <Text style={styles.planPrice}>₹{p.price_inr}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.cta, subscribing && { opacity: 0.6 }]}
              onPress={onSubscribe}
              disabled={subscribing}
              testID="subscribe-btn"
            >
              {subscribing ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <>
                  <Ionicons name="flash" size={20} color={COLORS.bg} />
                  <Text style={styles.ctaText}>
                    SUBSCRIBE · ₹{plans.find((p) => p.id === selected)?.price_inr}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.mockNote}>
              Payment gateway not wired yet — tapping subscribe simulates a successful payment for testing.
            </Text>

            {isSubscribed ? (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onCancel}
                disabled={canceling}
                testID="cancel-sub-btn"
              >
                {canceling ? (
                  <ActivityIndicator color={COLORS.text} />
                ) : (
                  <Text style={styles.cancelText}>Cancel current subscription</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  headerRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 8 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center",
  },
  eyebrow: { fontSize: 12, fontWeight: FONT.black, letterSpacing: 2, color: COLORS.textMuted },
  title: { marginTop: 8, fontSize: 38, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.5, lineHeight: 42 },
  subtitle: { marginTop: 10, fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },

  banner: {
    marginTop: 20, padding: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border,
    flexDirection: "row", alignItems: "center", gap: 10, ...SHADOW.brutalSm,
  },
  bannerTitle: { fontSize: 14, fontWeight: FONT.black, color: COLORS.text },
  bannerSub: { marginTop: 2, fontSize: 12, color: COLORS.text, opacity: 0.85 },

  signInBtn: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: RADIUS.pill, backgroundColor: COLORS.text,
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  signInBtnText: { color: COLORS.bg, fontSize: 12, fontWeight: FONT.black, letterSpacing: 1.2 },

  featureCard: {
    marginTop: 24, padding: 18, borderRadius: RADIUS.lg,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    gap: 12, ...SHADOW.brutalSm,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { flex: 1, fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },

  sectionLabel: { marginTop: 28, marginBottom: 12, fontSize: 12, fontWeight: FONT.black, letterSpacing: 2, color: COLORS.text },
  planCard: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 16, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.borderSoft, backgroundColor: COLORS.surface,
  },
  planCardActive: { borderColor: COLORS.border, backgroundColor: COLORS.bg, ...SHADOW.brutalSm },
  planLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: COLORS.borderSoft,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { borderColor: COLORS.text },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.text },
  planLabel: { fontSize: 16, fontWeight: FONT.black, color: COLORS.text },
  planSub: { marginTop: 2, fontSize: 11, color: COLORS.textMuted, fontWeight: FONT.bold },
  planPrice: { fontSize: 20, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -0.5 },

  bestPill: {
    backgroundColor: COLORS.mint, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  bestPillText: { fontSize: 9, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },

  cta: {
    marginTop: 24, paddingVertical: 16, borderRadius: RADIUS.lg, backgroundColor: COLORS.text,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10,
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutal,
  },
  ctaText: { color: COLORS.bg, fontSize: 14, fontWeight: FONT.black, letterSpacing: 1.5 },

  mockNote: {
    marginTop: 12, textAlign: "center", fontSize: 11,
    color: COLORS.textMuted, lineHeight: 16, fontStyle: "italic",
  },

  cancelBtn: {
    marginTop: 16, paddingVertical: 14, borderRadius: RADIUS.lg, borderWidth: 2,
    borderColor: COLORS.borderSoft, alignItems: "center",
  },
  cancelText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.textMuted, letterSpacing: 1 },
});
