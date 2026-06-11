import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, FONT, RADIUS, SHADOW } from "@/src/lib/theme";

type Props = {
  visible: boolean;
  selected: string | null;
  onClose: () => void;
  onPick: (hex: string) => void;
};

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return (
    "#" +
    [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")
  );
};

// 12 hues × 3 shades — vivid, balanced palette
const HUES = [0, 25, 45, 90, 150, 175, 200, 225, 260, 290, 320, 345];
const SHADES: [number, number][] = [
  [85, 45], // saturated mid
  [70, 60], // soft
  [90, 35], // deep
];
const PALETTE: string[] = SHADES.flatMap(([s, l]) => HUES.map((h) => hslToHex(h, s, l)));

/** Premium accent color picker — tap a swatch to apply instantly. */
export const AccentColorPicker: React.FC<Props> = ({ visible, selected, onClose, onPick }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>PICK YOUR ACCENT</Text>
          <TouchableOpacity onPress={onClose} testID="accent-picker-close">
            <Ionicons name="close" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.grid}>
          {PALETTE.map((hex) => (
            <TouchableOpacity
              key={hex}
              onPress={() => {
                onPick(hex);
                onClose();
              }}
              style={[styles.swatch, { backgroundColor: hex }, selected === hex && styles.swatchActive]}
              testID={`accent-color-${hex.replace("#", "")}`}
            >
              {selected === hex && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: 18,
    ...SHADOW.brutal,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 12, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchActive: { ...SHADOW.brutalSm, transform: [{ scale: 1.08 }] },
});
