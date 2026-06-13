import React, { useCallback, useState, ReactNode } from "react";
import {
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/lib/theme";
import { useTheme } from "@/src/contexts/ThemeContext";

type ScrollRefLike = React.RefObject<ScrollView | any>;

type Options = {
  /** How far from the bottom edge of the screen to anchor the FAB. */
  bottomOffset?: number;
  /** Horizontal inset from the right edge. */
  rightOffset?: number;
  /** Minimum (contentHeight - layoutHeight) before the FAB is shown at all. */
  minScrollable?: number;
};

/**
 * `useScrollFab` — drop-in hook that returns a single floating "jump" arrow.
 *
 *   • Shows **down** arrow while the user is in the top half of the content
 *     (taps → scrollToEnd).
 *   • Shows **up** arrow once past the midpoint (taps → scrollTo 0).
 *   • Hidden when the content fits the viewport (≤ minScrollable extra).
 *
 * Visual style matches the screenshot the user shared: white circle with the
 * accent-coloured arrow inside.
 *
 * Usage:
 *   const scrollRef = useRef<ScrollView>(null);
 *   const { onScroll, onContentSizeChange, onLayout, fab } = useScrollFab(scrollRef);
 *
 *   <ScrollView
 *     ref={scrollRef}
 *     onScroll={onScroll}
 *     onContentSizeChange={onContentSizeChange}
 *     onLayout={onLayout}
 *     scrollEventThrottle={16}
 *   >...</ScrollView>
 *   {fab}
 */
export function useScrollFab(scrollRef: ScrollRefLike, opts: Options = {}) {
  const bottomOffset = opts.bottomOffset ?? 16;
  const rightOffset = opts.rightOffset ?? 16;
  const minScrollable = opts.minScrollable ?? 200;
  const { accentColor } = useTheme();

  const [scrollY, setScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    setScrollY(contentOffset.y);
    setLayoutHeight(layoutMeasurement.height);
    setContentHeight(contentSize.height);
  }, []);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    setContentHeight(h);
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setLayoutHeight(e.nativeEvent.layout.height);
  }, []);

  const maxScroll = Math.max(0, contentHeight - layoutHeight);
  const direction: "up" | "down" | null =
    maxScroll <= minScrollable
      ? null
      : scrollY < maxScroll / 2
        ? "down"
        : "up";

  const handlePress = () => {
    if (!direction) return;
    if (direction === "down") {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    } else {
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    }
  };

  const fab: ReactNode = direction ? (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={{
        position: "absolute",
        right: rightOffset,
        bottom: bottomOffset,
        width: 44,
        height: 44,
        borderRadius: 999,
        backgroundColor: "#ffffff",
        borderWidth: 2,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 5,
      }}
      testID={`scroll-fab-${direction}`}
      accessibilityLabel={direction === "down" ? "Jump to bottom" : "Jump to top"}
    >
      <Ionicons
        name={direction === "down" ? "arrow-down" : "arrow-up"}
        size={22}
        color={accentColor}
      />
    </TouchableOpacity>
  ) : null;

  return { onScroll, onContentSizeChange, onLayout, fab, scrollEventThrottle: 16 };
}
