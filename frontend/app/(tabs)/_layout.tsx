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
          fontSize: 10,
          fontWeight: FONT.black as any,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginTop: 2,
          marginBottom: 2,
          includeFontPadding: false,
        },
        tabBarItemStyle: {
          paddingHorizontal: 2,
          paddingTop: 6,
          paddingBottom: 4,
        },
        tabBarStyle: {
          backgroundColor: bg,
          borderTopWidth: 3,
          borderTopColor: COLORS.border,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 0,
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
                width: 42,
                height: 26,
                alignSelf: "center",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 8,
                backgroundColor: focused ? accentColor : "transparent",
                borderWidth: focused ? 2 : 0,
                borderColor: COLORS.border,
              }}
            >
              <Ionicons name={iconName} size={18} color={color} />
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
