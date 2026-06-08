import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
};

/**
 * Daily-limit / upsell modal shown when a free user has run out of daily AI uses.
 * Offers a path to /pricing so the user can subscribe and unlock unlimited use.
 */
export function UpgradePrompt({
  visible,
  onClose,
  title = "Daily limit reached",
  message,
}: Props) {
  const router = useRouter();

  const goPremium = () => {
    onClose();
    setTimeout(() => router.push("/pricing"), 80); // wait for modal to close
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="flash" size={28} color={COLORS.text} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.bullets}>
            <Bullet text="Unlimited AI uses · ad-free" />
            <Bullet text="₹250 / week or ₹800 / month" />
            <Bullet text="Cancel anytime" />
          </View>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: COLORS.text }]}
            onPress={goPremium}
            testID="daily-limit-upgrade"
          >
            <Ionicons name="rocket" size={16} color={COLORS.bg} />
            <Text style={[styles.btnText, { color: COLORS.bg }]}>SEE PREMIUM PLANS</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.dismiss} testID="daily-limit-dismiss">
            <Text style={styles.dismissText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons name="checkmark-circle" size={16} color={COLORS.text} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    borderWidth: 3,
    borderColor: COLORS.border,
    padding: 24,
    ...SHADOW.brutal,
  },
  iconWrap: {
    alignSelf: "flex-start",
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: COLORS.secondary,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -0.5 },
  message: { marginTop: 8, fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
  bullets: { marginTop: 16, marginBottom: 20, gap: 8 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bulletText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text, flex: 1 },
  btn: {
    flexDirection: "row", gap: 8,
    paddingVertical: 14, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  btnText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5 },
  dismiss: { marginTop: 12, alignItems: "center", paddingVertical: 8 },
  dismissText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.textMuted, letterSpacing: 1 },
});
