import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { PatternBackground } from "@/src/components/PatternBackground";
import { TOOL_BY_ID } from "@/src/lib/tools";
import { ListenButton } from "@/src/components/ListenButton";
import { AdBanner } from "@/src/components/AdBanner";
import { useScrollFab } from "@/src/components/ScrollFab";

type Item = {
  id: string;
  tool: string;
  original: string;
  applied: string;
  created_at: string;
};

export default function HistoryScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const scrollRef = useRef<ScrollView>(null);
  const fab = useScrollFab(scrollRef, { bottomOffset: tabBarHeight + 16 });
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getHistory();
      setItems((data.items || []) as Item[]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const remove = async (id: string) => {
    setItems((it) => it.filter((x) => x.id !== id));
    try { await api.deleteHistory(id); } catch {}
  };

  const clearAll = async () => {
    if (items.length === 0) return;
    Alert.alert(
      "Clear history?",
      "This will permanently delete all of your saved corrections. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: async () => {
            const previous = items;
            setItems([]);
            try {
              await Promise.all(previous.map((it) => api.deleteHistory(it.id)));
            } catch {
              // best-effort — refetch on next focus syncs the truth
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <PatternBackground />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>YOUR LOG</Text>
          <Text style={styles.title}>History.</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity
            onPress={clearAll}
            style={styles.clearBtn}
            testID="history-clear-btn"
            accessibilityLabel="Clear all history"
          >
            <Ionicons name="refresh" size={18} color={COLORS.text} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ marginTop: 40, alignItems: "center" }}>
          <ActivityIndicator color={COLORS.text} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          onScroll={fab.onScroll}
          scrollEventThrottle={fab.scrollEventThrottle}
          onLayout={fab.onLayout}
          onContentSizeChange={fab.onContentSizeChange}
        >
          <AdBanner placement="top" />
          {items.length === 0 ? (
            <View style={styles.empty} testID="history-empty">
              <Ionicons name="time-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>Nothing applied yet</Text>
              <Text style={styles.emptySub}>
                Use any AI tool and tap APPLY — corrections will appear here.
              </Text>
            </View>
          ) : (
            items.map((it) => {
              const def = TOOL_BY_ID[it.tool];
              return (
                <View key={it.id} style={styles.card} testID={`history-${it.id}`}>
                  <View style={styles.cardHead}>
                    <View style={styles.toolTag}>
                      <Ionicons name={def?.icon ?? "checkmark"} size={12} color={COLORS.text} />
                      <Text style={styles.toolTagText}>{(def?.label || it.tool).toUpperCase()}</Text>
                    </View>
                    <TouchableOpacity onPress={() => remove(it.id)} testID={`history-del-${it.id}`}>
                      <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.label}>ORIGINAL</Text>
                  <Text style={styles.original} numberOfLines={3}>{it.original || "—"}</Text>
                  <Text style={[styles.label, { marginTop: 8 }]}>APPLIED</Text>
                  <Text style={styles.applied}>{it.applied}</Text>
                  <View style={{ marginTop: 10, flexDirection: "row" }}>
                    <ListenButton text={it.applied} small testID={`history-listen-${it.id}`} />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
      {fab.fab}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: 20, paddingTop: 8, flexDirection: "row", alignItems: "center" },
  clearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    ...SHADOW.brutalSm,
  },
  eyebrow: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  title: { fontSize: 32, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.2 },
  empty: { alignItems: "center", marginTop: 60, gap: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: FONT.black, color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 20 },
  card: {
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: 14, marginBottom: 12, ...SHADOW.brutalSm,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  toolTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.mint,
  },
  toolTagText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.5 },
  label: { fontSize: 10, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted },
  original: { marginTop: 4, fontSize: 13, color: COLORS.textMuted, fontStyle: "italic", textDecorationLine: "line-through" },
  applied: { marginTop: 4, fontSize: 14, color: COLORS.text, fontWeight: FONT.regular },
});
