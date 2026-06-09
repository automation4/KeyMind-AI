import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { TOOL_BY_ID } from "@/src/lib/tools";

type Props = {
  toolId: string | null;
  pendingOptions: Record<string, string>;
  onChangeOption: (key: string, value: string) => void;
  onCancel: () => void;
  onRun: () => void;
};

export function ToolOptionsSheet({
  toolId,
  pendingOptions,
  onChangeOption,
  onCancel,
  onRun,
}: Props) {
  const tool = toolId ? TOOL_BY_ID[toolId] : null;
  return (
    <Modal
      visible={!!toolId}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.modalBg}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          {tool?.options?.map((opt) => (
            <View key={opt.key} style={{ marginBottom: 16 }}>
              <Text style={styles.section}>{opt.label.toUpperCase()}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {opt.choices.map((c) => {
                  const active = pendingOptions[opt.key] === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => onChangeOption(opt.key, c)}
                      style={[styles.optChip, active && styles.optChipActive]}
                      testID={`opt-${opt.key}-${c.toLowerCase()}`}
                    >
                      <Text
                        style={[
                          styles.optChipText,
                          active && styles.optChipTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              style={[styles.sheetBtn, { backgroundColor: COLORS.surface }]}
              onPress={onCancel}
              testID="opt-cancel-btn"
            >
              <Text style={[styles.sheetBtnText, { color: COLORS.text }]}>
                CANCEL
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtn, { backgroundColor: COLORS.text, flex: 2 }]}
              onPress={onRun}
              testID="opt-run-btn"
            >
              <Text style={[styles.sheetBtnText, { color: COLORS.bg }]}>RUN</Text>
            </TouchableOpacity>
          </View>
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
  optChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  optChipActive: { backgroundColor: COLORS.text },
  optChipText: { fontSize: 13, fontWeight: FONT.bold, color: COLORS.text },
  optChipTextActive: { color: COLORS.bg },
  sheetBtn: {
    flex: 1,
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
