import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";
import { useAuth } from "@/src/contexts/AuthContext";

/**
 * Placeholder ad banner shown to free-tier users only.
 * Visually clear it is an ad ("AD ·" label) and tap → Pricing screen.
 * No real ad SDK is wired — strictly a UX mockup for v1.
 */
export function AdBanner({ placement = "top" }: { placement?: "top" | "bottom" }) {
  const router = useRouter();
  const { user } = useAuth();

  // Hide for premium / admin
  if (!user) return null;
  if (user.is_premium || user.is_admin) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => router.push("/pricing")}
      style={[styles.banner, placement === "bottom" && styles.bottom]}
      testID="ad-banner"
    >
      <View style={styles.adPill}>
        <Text style={styles.adPillText}>AD</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>Sponsored · Boost your writing in 60 sec ✨</Text>
        <Text style={styles.sub} numberOfLines={1}>Tap here · Upgrade to remove ads</Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={COLORS.text} />
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
