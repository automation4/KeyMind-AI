import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/src/contexts/ThemeContext";
import { COLORS } from "@/src/lib/theme";

export default function TabsLayout() {
  const { bg, accentColor, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const darkish = mode !== "light";

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarItemStyle: {
          paddingHorizontal: 2,
          paddingTop: 10,
          paddingBottom: 6,
        },
        tabBarStyle: {
          backgroundColor: bg,
          borderTopWidth: 3,
          borderTopColor: COLORS.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 0,
        },
        tabBarActiveTintColor: COLORS.onPrimary,
        tabBarInactiveTintColor: darkish ? "#E8E8E8" : "#8A8A8A",
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
                // Outer ring — light halo in dark/matte so icons pop ("inside-out" border)
                borderRadius: 12,
                borderWidth: darkish ? 1.5 : 0,
                borderColor: darkish ? "rgba(255,255,255,0.55)" : "transparent",
                padding: darkish ? 1.5 : 0,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 36,
                  alignSelf: "center",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  backgroundColor: focused
                    ? accentColor
                    : darkish
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                  // Inner black border — always on in dark/matte, focused-only in light
                  borderWidth: focused || darkish ? 2 : 0,
                  borderColor: "#000000",
                }}
              >
                <Ionicons name={iconName} size={22} color={color} />
              </View>
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Write", tabBarAccessibilityLabel: "Write" }} />
      <Tabs.Screen name="chat" options={{ title: "Ask AI", tabBarAccessibilityLabel: "Ask AI" }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarAccessibilityLabel: "History" }} />
      <Tabs.Screen name="settings" options={{ title: "You", tabBarAccessibilityLabel: "You" }} />
    </Tabs>
  );
}
