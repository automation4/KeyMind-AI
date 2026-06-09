import React from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { TOOLS } from "@/src/lib/tools";

const accentBg: Record<string, string> = {
  orange: COLORS.primary,
  yellow: COLORS.secondary,
  mint: COLORS.mint,
  peach: COLORS.peach,
  sky: COLORS.sky,
  lilac: COLORS.lilac,
};

type Props = {
  visible: boolean;
  activeTool: string | null;
  onClose: () => void;
  onSelect: (toolId: string) => void;
};

export function ToolPickerSheet({ visible, activeTool, onClose, onSelect }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBg}>
        <View style={[styles.sheet, { maxHeight: "80%" }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.section, { marginTop: 4 }]}>SELECT A TOOL</Text>
          <ScrollView style={{ marginTop: 8 }} showsVerticalScrollIndicator={false}>
            {TOOLS.map((t) => {
              const selected = activeTool === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.toolRow, selected && styles.toolRowActive]}
                  onPress={() => {
                    onClose();
                    onSelect(t.id);
                  }}
                  testID={`tool-${t.id}`}
                >
                  <View
                    style={[
                      styles.toolRowIcon,
                      { backgroundColor: accentBg[t.accent] },
                    ]}
                  >
                    <Ionicons name={t.icon} size={18} color={COLORS.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toolRowLabel}>{t.label}</Text>
                    <Text style={styles.toolRowSub} numberOfLines={1}>
                      {t.description}
                    </Text>
                  </View>
                  {selected && (
                    <Ionicons name="checkmark" size={20} color={COLORS.text} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={[styles.sheetBtn, { backgroundColor: COLORS.surface, marginTop: 12 }]}
            onPress={onClose}
            testID="tool-picker-close-btn"
          >
            <Text style={[styles.sheetBtnText, { color: COLORS.text }]}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 3,
    borderColor: COLORS.border,
    padding: 20,
    paddingBottom: 36,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 56,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.text,
    marginBottom: 8,
  },
  section: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.text,
    marginTop: 24,
    marginBottom: 12,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  toolRowActive: { backgroundColor: COLORS.bg },
  toolRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  toolRowLabel: { fontSize: 14, fontWeight: FONT.black, color: COLORS.text },
  toolRowSub: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: FONT.regular,
  },
  sheetBtn: {
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOW.brutalSm,
  },
  sheetBtnText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5 },
});
