import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/contexts/ThemeContext";
import { COLORS, FONT } from "@/src/lib/theme";

export default function TabsLayout() {
  const { bg, text, accentColor } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: FONT.black as any,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        },
        tabBarStyle: {
          backgroundColor: bg,
          borderTopWidth: 3,
          borderTopColor: COLORS.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
        },
        tabBarActiveTintColor: text,
        tabBarInactiveTintColor: "#8A8A8A",
        tabBarIcon: ({ color, focused }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            index: focused ? "create" : "create-outline",
            chat: focused ? "chatbubbles" : "chatbubbles-outline",
            history: focused ? "time" : "time-outline",
            settings: focused ? "settings" : "settings-outline",
          };
          const iconName = map[route.name] || "ellipse";
          return (
            <View
              style={{
                width: 36,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: focused ? accentColor : "transparent",
                borderWidth: focused ? 2 : 0,
                borderColor: COLORS.border,
              }}
            >
              <Ionicons name={iconName} size={20} color={color} />
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Write" }} />
      <Tabs.Screen name="chat" options={{ title: "Ask AI" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="settings" options={{ title: "You" }} />
    </Tabs>
  );
}
