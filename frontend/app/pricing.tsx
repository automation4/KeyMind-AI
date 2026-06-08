import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";

type Plan = { id: string; label: string; price: number; per: string; save?: string };

const PLANS: Plan[] = [
  { id: "monthly", label: "Monthly", price: 500, per: "month" },
  { id: "quarterly", label: "Quarterly", price: 1425, per: "3 months", save: "Save 5%" },
  { id: "half", label: "Half-Yearly", price: 2850, per: "6 months", save: "Save 5%" },
  { id: "yearly", label: "Yearly", price: 5700, per: "year", save: "Save 5%" },
];

const FREE = [
  "Basic grammar correction",
  "5 AI tool uses per day",
  "Standard themes only",
  "3 language pairs",
  "Banner + interstitial ads",
];

const PRO = [
  "Unlimited grammar correction",
  "All 16 AI writing tools — unlimited",
  "All 20+ Indian + 100+ international languages",
  "All themes & custom accent colors",
  "Unlimited AI Tutor chatbot",
  "Priority response speed",
  "No ads",
  "Offline grammar (premium pack)",
  "Early access to new features",
];

export default function Pricing() {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("yearly");

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="pricing-back-btn">
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.brand}>PRICING</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={styles.eyebrow}>UPGRADE</Text>
        <Text style={styles.title}>Write without{"\n"}limits.</Text>
        <Text style={styles.subtitle}>
          Unlimited corrections, all 16 AI tools, 100+ languages, and zero ads.
        </Text>

        {/* Plans */}
        <View style={{ marginTop: 24, gap: 10 }}>
          {PLANS.map((p) => {
            const active = selected === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setSelected(p.id)}
                style={[
                  styles.planCard,
                  active && { backgroundColor: COLORS.primary, ...SHADOW.brutal },
                ]}
                testID={`pricing-plan-${p.id}`}
              >
                <View style={styles.radio}>
                  {active && <View style={styles.radioInner} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.planLabel}>{p.label}</Text>
                    {p.save ? (
                      <View style={styles.savePill}>
                        <Text style={styles.savePillText}>{p.save}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.planSub}>per {p.per}</Text>
                </View>
                <Text style={styles.planPrice}>₹{p.price.toLocaleString("en-IN")}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.cta} testID="pricing-subscribe-btn">
          <Text style={styles.ctaText}>START PREMIUM</Text>
          <Ionicons name="arrow-forward" size={22} color={COLORS.bg} />
        </TouchableOpacity>
        <Text style={styles.disclaimer}>
          Coming soon. Payment integration not yet enabled in this preview.
        </Text>

        {/* Feature comparison */}
        <View style={styles.compareRow}>
          <View style={[styles.compareCol, { backgroundColor: COLORS.surface }]}>
            <Text style={styles.compareTitle}>FREE</Text>
            <Text style={styles.comparePrice}>₹0</Text>
            <View style={{ marginTop: 12, gap: 6 }}>
              {FREE.map((f) => (
                <View key={f} style={styles.featRow}>
                  <Ionicons name="ellipse" size={6} color={COLORS.text} />
                  <Text style={styles.featText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={[styles.compareCol, { backgroundColor: COLORS.mint }]}>
            <Text style={styles.compareTitle}>PREMIUM</Text>
            <Text style={styles.comparePrice}>₹500/mo</Text>
            <View style={{ marginTop: 12, gap: 6 }}>
              {PRO.map((f) => (
                <View key={f} style={styles.featRow}>
                  <Ionicons name="checkmark" size={12} color={COLORS.text} />
                  <Text style={styles.featText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", ...SHADOW.brutalSm,
  },
  brand: { fontSize: 12, fontWeight: FONT.black, letterSpacing: 2, color: COLORS.text },
  eyebrow: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  title: { marginTop: 4, fontSize: 40, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.5, lineHeight: 42 },
  subtitle: { marginTop: 8, fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },
  planCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: 14,
  },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center",
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.text },
  planLabel: { fontSize: 16, fontWeight: FONT.black, color: COLORS.text },
  planSub: { marginTop: 2, fontSize: 12, color: COLORS.text, fontWeight: FONT.regular },
  planPrice: { fontSize: 18, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -0.5 },
  savePill: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.text,
  },
  savePillText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.bg, letterSpacing: 0.5 },
  cta: {
    marginTop: 24, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10,
    backgroundColor: COLORS.text, borderWidth: 3, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingVertical: 18, ...SHADOW.brutal,
  },
  ctaText: { fontSize: 14, fontWeight: FONT.black, color: COLORS.bg, letterSpacing: 1.5 },
  disclaimer: { marginTop: 10, fontSize: 11, textAlign: "center", color: COLORS.textMuted },
  compareRow: { marginTop: 32, flexDirection: "row", gap: 10 },
  compareCol: {
    flex: 1, padding: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  compareTitle: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  comparePrice: { marginTop: 4, fontSize: 22, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1 },
  featRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  featText: { flex: 1, fontSize: 11, color: COLORS.text, lineHeight: 16, fontWeight: FONT.regular },
});
