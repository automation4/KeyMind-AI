import React from "react";
import { TouchableOpacity, View, Text, ActivityIndicator, Platform } from "react-native";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";

type Props = {
  text: string;
  testID?: string;
  small?: boolean;
};

export const ListenButton: React.FC<Props> = ({ text, testID, small }) => {
  const [speaking, setSpeaking] = React.useState(false);

  const onPress = async () => {
    if (!text?.trim()) return;
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    try {
      setSpeaking(true);
      Speech.speak(text, {
        rate: 1.0,
        pitch: 1.0,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    } catch {
      setSpeaking(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: COLORS.secondary,
        borderRadius: RADIUS.pill,
        borderWidth: 2,
        borderColor: COLORS.border,
        paddingHorizontal: small ? 10 : 12,
        paddingVertical: small ? 6 : 8,
        ...SHADOW.brutalSm,
      }}
      testID={testID || "listen-btn"}
    >
      {speaking ? (
        <ActivityIndicator size="small" color={COLORS.text} />
      ) : (
        <Ionicons name="volume-high" size={small ? 14 : 16} color={COLORS.text} />
      )}
      <Text style={{ fontSize: small ? 11 : 12, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 }}>
        {speaking ? "STOP" : "LISTEN"}
      </Text>
    </TouchableOpacity>
  );
};
