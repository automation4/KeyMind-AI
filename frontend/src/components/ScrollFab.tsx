import React, { useCallback, useEffect, useRef, useState, ReactNode } from "react";
import {
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  ScrollView,
  PanResponder,
  Animated,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/src/lib/theme";

type ScrollRefLike = React.RefObject<ScrollView | any>;

type Options = {
  bottomOffset?: number;
  rightOffset?: number;
  /** Min (content - viewport) before the FAB shows at all. */
  minScrollable?: number;
  /** Pixels per 16ms tick at the maximum drag distance. */
  maxScrollSpeed?: number;
  /** How far (px) the user has to drag before scroll-loop starts (dead zone). */
  deadZone?: number;
  /** Above this drag magnitude the loop runs at full maxScrollSpeed. */
  maxDragDistance?: number;
};

/**
 * `useScrollFab` — single floating "jump" arrow with **press-and-drag scrolling**.
 *
 *   • TAP   → jump (down arrow → scrollToEnd, up arrow → scrollTo 0).
 *   • DRAG  → live-scroll proportional to how far from the FAB the finger is.
 *             Tiny drag = slow scroll, big drag = fast scroll. Sign follows
 *             gesture direction (drag down → scroll down, drag up → scroll up).
 *   • Idle when the content fits the viewport.
 */
export function useScrollFab(scrollRef: ScrollRefLike, opts: Options = {}) {
  const bottomOffset = opts.bottomOffset ?? 16;
  const rightOffset = opts.rightOffset ?? 16;
  const minScrollable = opts.minScrollable ?? 200;
  const maxScrollSpeed = opts.maxScrollSpeed ?? 36; // px / tick
  const deadZone = opts.deadZone ?? 8;
  const maxDragDistance = opts.maxDragDistance ?? 180; // saturate at ~180px

  const [scrollY, setScrollY] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Direction is sticky: flips based on the LAST scroll-velocity sign so the
  // FAB never flickers when the user is sitting still near the midpoint.
  // Defaults to "down" on first render (top of content), flips to "up" once
  // the user has scrolled most of the way down OR scrolls upward from a
  // non-top position.
  const [direction, setDirection] = useState<"up" | "down">("down");
  // Ref mirror — PanResponder is built once via useRef so its closure-captured
  // `direction` would never update without this.
  const directionRef = useRef<"up" | "down">("down");
  useEffect(() => {
    directionRef.current = direction;
  }, [direction]);

  // Animated rotation for the icon — 0deg = ↓, 180deg = ↑ (we render arrow-down
  // and flip it for the up direction so the swap is one continuous spin).
  const rotation = useRef(new Animated.Value(0)).current;

  // Refs mirror the latest values so the drag interval reads fresh data
  // without re-creating the PanResponder on every render.
  const scrollYRef = useRef(0);
  const contentRef = useRef(0);
  const layoutRef = useRef(0);
  const dragDyRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => { scrollYRef.current = scrollY; }, [scrollY]);
  useEffect(() => { contentRef.current = contentHeight; }, [contentHeight]);
  useEffect(() => { layoutRef.current = layoutHeight; }, [layoutHeight]);

  const lastScrollY = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const y = contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;
    setScrollY(y);
    setLayoutHeight(layoutMeasurement.height);
    setContentHeight(contentSize.height);

    // Flip the arrow based on actual scroll *direction* — not just position.
    // Swiping up (content rising into view) → user wants to keep going up,
    // so the FAB should offer to jump to the top (↑).
    // Swiping down → arrow becomes ↓ (jump to bottom).
    // Small jitters are ignored (|dy| < 1).
    if (Math.abs(dy) >= 1) {
      const next: "up" | "down" = dy > 0 ? "down" : "up";
      setDirection((prev) => (prev === next ? prev : next));
    }
  }, []);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    setContentHeight(h);
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setLayoutHeight(e.nativeEvent.layout.height);
  }, []);

  const maxScroll = Math.max(0, contentHeight - layoutHeight);
  const visible = maxScroll > minScrollable;

  // Smoothly animate the icon rotation whenever the direction flips.
  useEffect(() => {
    Animated.timing(rotation, {
      toValue: direction === "up" ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [direction, rotation]);

  const iconSpin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const stopLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const dy = dragDyRef.current;
      if (Math.abs(dy) < deadZone) return;
      // Normalise drag distance to [-1, 1] and ease cubically for finer
      // control near the FAB and explosive scroll at the extremes.
      const norm = Math.max(-1, Math.min(1, dy / maxDragDistance));
      const speed = norm * norm * norm * maxScrollSpeed;
      // Sign matches drag direction: down-drag → scroll content down (scrollY +)
      const sign = Math.sign(dy);
      const delta = Math.abs(speed) * sign;
      const next = Math.max(
        0,
        Math.min(contentRef.current - layoutRef.current, scrollYRef.current + delta),
      );
      scrollRef.current?.scrollTo?.({ y: next, animated: false });
      scrollYRef.current = next;
    }, 16);
  }, [deadZone, maxDragDistance, maxScrollSpeed, scrollRef]);

  // Build the PanResponder once. Refs above keep it in sync with current state.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startedAtRef.current = Date.now();
        dragDyRef.current = 0;
        setDragging(true);
      },
      onPanResponderMove: (_evt, g) => {
        dragDyRef.current = g.dy;
        // Lazily start the loop the first time we leave the dead zone.
        if (!intervalRef.current && Math.abs(g.dy) >= deadZone) {
          startLoop();
        }
      },
      onPanResponderRelease: (_evt, g) => {
        const wasTap =
          Math.abs(g.dx) < deadZone &&
          Math.abs(g.dy) < deadZone &&
          Date.now() - startedAtRef.current < 350;
        stopLoop();
        dragDyRef.current = 0;
        setDragging(false);

        if (wasTap) {
          // Honour the current arrow direction (which tracks scroll velocity)
          // rather than position — matches the visual state the user sees.
          if (directionRef.current === "down") scrollRef.current?.scrollToEnd?.({ animated: true });
          else scrollRef.current?.scrollTo?.({ y: 0, animated: true });
        }
      },
      onPanResponderTerminate: () => {
        stopLoop();
        dragDyRef.current = 0;
        setDragging(false);
      },
    }),
  ).current;

  // Cleanup on unmount.
  useEffect(() => () => stopLoop(), [stopLoop]);

  const fab: ReactNode = visible ? (
    <View
      {...pan.panHandlers}
      style={{
        position: "absolute",
        right: rightOffset,
        bottom: bottomOffset,
        width: 48,
        height: 48,
        borderRadius: 999,
        backgroundColor: COLORS.text, // ALWAYS black, ignores accent theme
        borderWidth: 2,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: dragging ? 0.3 : 0.18,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: dragging ? 8 : 5,
        transform: [{ scale: dragging ? 1.1 : 1 }],
      }}
      testID={`scroll-fab-${direction}`}
      accessibilityLabel={
        direction === "down" ? "Jump to bottom (drag to scroll)" : "Jump to top (drag to scroll)"
      }
    >
      <Animated.View style={{ transform: [{ rotate: iconSpin }] }}>
        <Ionicons name="arrow-down" size={22} color="#ffffff" />
      </Animated.View>
    </View>
  ) : null;

  return { onScroll, onContentSizeChange, onLayout, fab, scrollEventThrottle: 16 };
}
