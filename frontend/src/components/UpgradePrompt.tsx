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

export function UpgradePrompt({ visible, onClose, title = "Upgrade to Premium", message }: Props) {
  const router = useRouter();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={28} color={COLORS.text} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.bullets}>
            <Bullet text="Unlimited AI tool uses" />
            <Bullet text="All languages & accent themes" />
            <Bullet text="Ad-free experience" />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: COLORS.surface }]}
              onPress={onClose}
              testID="upgrade-prompt-later"
            >
              <Text style={[styles.btnText, { color: COLORS.text }]}>LATER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: COLORS.primary, flex: 2 }]}
              onPress={() => {
                onClose();
                router.push("/pricing");
              }}
              testID="upgrade-prompt-go"
            >
              <Ionicons name="flash" size={16} color={COLORS.text} />
              <Text style={[styles.btnText, { color: COLORS.text }]}>SEE PLANS</Text>
            </TouchableOpacity>
          </View>
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
  bulletText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },
  btn: {
    flex: 1, flexDirection: "row", gap: 6,
    paddingVertical: 14, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  btnText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5 },
});
