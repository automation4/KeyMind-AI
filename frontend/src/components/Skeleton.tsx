import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";

import { COLORS, RADIUS, SHADOW } from "@/src/lib/theme";

/**
 * Lightweight skeleton loader.
 *
 * Built on `Animated` (no extra dep) — pulses a low-opacity grey bar to signal
 * "content is loading". Use this in lieu of spinners on Home, Chat and History
 * to give the user a visual hint of *what* is loading, not just that something is.
 */
type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
};

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 14,
  radius = 8,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: COLORS.border,
          opacity,
        },
        style as any,
      ]}
    />
  );
};

/** Skeleton matching the "result card" layout on Home. */
export const ResultCardSkeleton: React.FC = () => (
  <View style={styles.card} testID="result-skeleton">
    <Skeleton width="40%" height={10} radius={4} style={{ marginBottom: 12 }} />
    <Skeleton width="100%" height={14} style={{ marginBottom: 8 }} />
    <Skeleton width="92%" height={14} style={{ marginBottom: 8 }} />
    <Skeleton width="65%" height={14} style={{ marginBottom: 14 }} />
    <View style={{ flexDirection: "row", gap: 8 }}>
      <Skeleton width={72} height={26} radius={999} />
      <Skeleton width={72} height={26} radius={999} />
    </View>
  </View>
);

/** Skeleton matching a chat AI bubble. */
export const ChatBubbleSkeleton: React.FC = () => (
  <View style={styles.aiBubble} testID="chat-skeleton">
    <Skeleton width="55%" height={12} style={{ marginBottom: 8 }} />
    <Skeleton width="92%" height={12} style={{ marginBottom: 8 }} />
    <Skeleton width="70%" height={12} />
  </View>
);

/** Skeleton matching a single history card. */
export const HistoryCardSkeleton: React.FC = () => (
  <View style={styles.card} testID="history-skeleton">
    <View style={styles.row}>
      <Skeleton width={70} height={20} radius={999} />
      <Skeleton width={20} height={20} radius={6} />
    </View>
    <Skeleton width="35%" height={10} radius={4} style={{ marginTop: 10 }} />
    <Skeleton width="92%" height={14} style={{ marginTop: 6 }} />
    <Skeleton width="35%" height={10} radius={4} style={{ marginTop: 12 }} />
    <Skeleton width="80%" height={14} style={{ marginTop: 6 }} />
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 12,
    ...SHADOW.brutalSm,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    maxWidth: "92%",
    minWidth: 220,
    ...SHADOW.brutalSm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
