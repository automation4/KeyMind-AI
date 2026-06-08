import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";
import { useAuth } from "@/src/contexts/AuthContext";

/**
 * Mock ad banner shown to all non-premium users.
 * "Premium" includes admin-whitelisted users and active paid subscribers.
 * Tapping the banner takes the user to /pricing.
 */
export function AdBanner({ placement = "top" }: { placement?: "top" | "bottom" }) {
  const { user } = useAuth();
  const router = useRouter();

  // Hide for premium (admin / whitelisted / subscribed) users.
  if (!user) return null;
  if (user.is_premium || user.is_admin) return null;

  return (
    <TouchableOpacity
      onPress={() => router.push("/pricing")}
      activeOpacity={0.85}
      style={[styles.banner, placement === "bottom" && styles.bottom]}
      testID="ad-banner"
    >
      <View style={styles.adPill}>
        <Text style={styles.adPillText}>AD</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          Remove ads · Unlimited from ₹250/wk
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          Tap to see Premium plans →
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.lilac,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    ...SHADOW.brutalSm,
  },
  bottom: { marginTop: 12, marginBottom: 0 },
  adPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.text,
  },
  adPillText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.bg, letterSpacing: 1 },
  title: { fontSize: 12, fontWeight: FONT.black, color: COLORS.text },
  sub: { marginTop: 2, fontSize: 10, color: COLORS.text, fontWeight: FONT.bold, opacity: 0.7 },
});
