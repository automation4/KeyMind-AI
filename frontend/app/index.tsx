import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/contexts/AuthContext";
import { storage } from "@/src/utils/storage";
import { COLORS, SHADOW, FONT } from "@/src/lib/theme";

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    (async () => {
      // Tiny delay so the splash isn't jarring
      await new Promise((r) => setTimeout(r, 400));
      const onboarded = await storage.getItem<boolean>("keymind_onboarded", false);
      if (!onboarded) {
        router.replace("/onboarding");
        return;
      }
      if (!user) {
        router.replace("/login");
        return;
      }
      const setupDone =
        (await storage.getItem<boolean>("keymind_setup_done", false)) ||
        !!(user as any).setup_completed; // honour server-side flag for returning users
      if (!setupDone) {
        router.replace("/setup");
        return;
      }
      router.replace("/(tabs)");
    })();
  }, [loading, user, router]);

  return (
    <View style={styles.container} testID="splash-screen">
      <View style={styles.logo}>
        <Text style={styles.logoText}>KM</Text>
      </View>
      <Text style={styles.title}>KeyMind AI</Text>
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logo: {
    width: 120,
    height: 120,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.border,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    ...SHADOW.brutal,
  },
  logoText: {
    fontSize: 52,
    fontWeight: FONT.black,
    color: COLORS.onPrimary,
    letterSpacing: -2,
  },
  title: {
    fontSize: 44,
    fontWeight: FONT.black,
    letterSpacing: -1.5,
    color: COLORS.text,
  },
});
