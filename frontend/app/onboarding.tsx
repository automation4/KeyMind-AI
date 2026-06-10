import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import LottieView from "lottie-react-native";

import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { storage } from "@/src/utils/storage";

type Slide = {
  title: string;
  subtitle: string;
  lottie: any;
  bg: string;
  fallbackIcon: keyof typeof Ionicons.glyphMap;
};

const SLIDES: Slide[] = [
  {
    title: "AI that\nWrites with You",
    subtitle:
      "Your personal AI writing companion for every message, email and post.",
    lottie: require("@/src/assets/lottie/sparkles.json"),
    bg: COLORS.secondary,
    fallbackIcon: "sparkles",
  },
  {
    title: "20+ Indian\nLanguages",
    subtitle:
      "Hindi, Tamil, Bengali, Telugu, Marathi & more — including Hinglish, Tanglish, Tenglish.",
    lottie: require("@/src/assets/lottie/globe.json"),
    bg: COLORS.mint,
    fallbackIcon: "language",
  },
  {
    title: "Speak.\nWe Listen.",
    subtitle:
      "Dictate in your language. Crisp speech-to-text powered by Whisper, in any accent.",
    lottie: require("@/src/assets/lottie/mic.json"),
    bg: COLORS.peach,
    fallbackIcon: "mic",
  },
  {
    title: "Ready to\nTake Off?",
    subtitle:
      "16 AI tools — grammar, paraphrase, translate, idioms, vocab & dictation. Let’s go!",
    lottie: require("@/src/assets/lottie/rocket.json"),
    bg: COLORS.sky,
    fallbackIcon: "rocket",
  },
];

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const router = useRouter();

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const animateIn = () => {
    fade.setValue(0);
    slide.setValue(24);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    animateIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const finish = async () => {
    await storage.setItem("keymind_onboarded", true);
    router.replace("/login");
  };

  const goTo = (i: number) => {
    if (i === index || i < 0 || i >= SLIDES.length) return;
    setIndex(i);
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      setIndex(index + 1);
    } else {
      finish();
    }
  };

  const prev = () => {
    if (index > 0) setIndex(index - 1);
  };

  // Refs to give the PanResponder access to the latest closures.
  const nextRef = useRef(next);
  const prevRef = useRef(prev);
  const finishRef = useRef(finish);
  useEffect(() => {
    nextRef.current = next;
    prevRef.current = prev;
    finishRef.current = finish;
  });

  const pressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
    }).start();
  };

  const isLast = index === SLIDES.length - 1;
  const current = SLIDES[index];

  // Swipe gestures: left → next/finish, right → previous, down (long) → skip onboarding.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => {
        // Only claim the gesture if the user is clearly swiping (not tapping a button)
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        return ax > 12 || ay > 18;
      },
      onPanResponderRelease: (_e, g) => {
        const SWIPE_X = 60;
        const SWIPE_Y = 90;
        if (g.dy > SWIPE_Y && Math.abs(g.dy) > Math.abs(g.dx)) {
          // swipe down → skip entire onboarding
          finishRef.current?.();
          return;
        }
        if (g.dx <= -SWIPE_X) {
          // swipe left → next
          nextRef.current?.();
        } else if (g.dx >= SWIPE_X) {
          // swipe right → previous
          prevRef.current?.();
        }
      },
    }),
  ).current;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: current.bg }}
      edges={["top", "bottom"]}
      testID="onboarding-screen"
    >
      <View style={styles.topBar}>
        <Text style={styles.brand} testID="onboarding-brand">
          KEYMIND AI
        </Text>
        {!isLast && (
          <TouchableOpacity onPress={finish} testID="onboarding-skip-btn">
            <Text style={styles.skip}>SKIP</Text>
          </TouchableOpacity>
        )}
        {isLast && <View style={{ width: 40 }} />}
      </View>

      <Animated.View
        style={[
          styles.slide,
          { opacity: fade, transform: [{ translateY: slide }] },
        ]}
        testID={`onboarding-slide-${index}`}
        {...panResponder.panHandlers}
      >
        <View style={styles.lottieFrame}>
          <LottieView
            key={index /* force remount per slide so animation restarts cleanly */}
            source={current.lottie}
            autoPlay
            loop
            style={styles.lottie}
            renderMode={Platform.OS === "web" ? "SOFTWARE" : "AUTOMATIC"}
          />
        </View>
        <Text style={styles.title} testID="onboarding-title">
          {current.title}
        </Text>
        <Text style={styles.subtitle}>{current.subtitle}</Text>
      </Animated.View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => goTo(i)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            testID={`onboarding-dot-${i}`}
          >
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.bottomBar}>
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={styles.cta}
            onPress={next}
            onPressIn={pressIn}
            onPressOut={pressOut}
            activeOpacity={0.9}
            testID="onboarding-next-btn"
          >
            <Text style={styles.ctaText}>{isLast ? "GET STARTED" : "NEXT"}</Text>
            <Ionicons
              name={isLast ? "rocket" : "arrow-forward"}
              size={22}
              color={COLORS.bg}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 40,
  },
  brand: {
    fontSize: 14,
    fontWeight: FONT.black,
    letterSpacing: 2,
    color: COLORS.text,
  },
  skip: {
    fontSize: 13,
    fontWeight: FONT.black,
    letterSpacing: 2,
    color: COLORS.text,
  },
  slide: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  lottieFrame: {
    alignSelf: "center",
    width: 260,
    height: 260,
    borderRadius: 32,
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    overflow: "hidden",
    ...SHADOW.brutal,
  },
  lottie: { width: 260, height: 260 },
  title: {
    fontSize: 40,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  subtitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: FONT.regular,
    lineHeight: 24,
    color: COLORS.text,
    maxWidth: 360,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(15,15,15,0.25)",
  },
  dotActive: { width: 28, backgroundColor: COLORS.text },
  bottomBar: { paddingHorizontal: 24, paddingBottom: 16 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.lg,
    borderWidth: 3,
    borderColor: COLORS.text,
    paddingHorizontal: 24,
    paddingVertical: 18,
    ...SHADOW.brutal,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: FONT.black,
    letterSpacing: 1.5,
    color: COLORS.bg,
  },
});
