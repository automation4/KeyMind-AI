import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ImageBackground,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";
import { storage } from "@/src/utils/storage";

const { width } = Dimensions.get("window");

type Slide = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
};

const SLIDES: Slide[] = [
  { title: "Write Smarter,\nNot Harder", subtitle: "Your personal AI writing companion for every message, email and post.", icon: "sparkles", bg: COLORS.secondary },
  { title: "20+ Indian\nLanguages", subtitle: "Hindi, Tamil, Bengali, Telugu, and more — even Hinglish.", icon: "language", bg: COLORS.mint },
  { title: "16 AI Writing\nTools", subtitle: "Tone change, paraphrase, summarize, translate, versify & more.", icon: "color-wand", bg: COLORS.peach },
  { title: "Grammar That\nGets You", subtitle: "Auto-detects language and corrects without breaking your voice.", icon: "checkmark-done-circle", bg: COLORS.sky },
  { title: "Apply, Edit,\nor Dismiss", subtitle: "AI never auto-applies. You review every suggestion as a card.", icon: "checkmark-circle", bg: COLORS.lilac },
  { title: "Ask the AI\nTutor", subtitle: "Don't get a rule? Tap the chatbot and ask in your own language.", icon: "chatbubbles", bg: COLORS.rose },
  { title: "Listen to\nEverything", subtitle: "Tap 🔊 on any suggestion to hear it in the right accent.", icon: "volume-high", bg: COLORS.secondary },
  { title: "Make it\nYours", subtitle: "Pick themes, accents, and language preferences. Ready in 60s.", icon: "color-palette", bg: COLORS.mint },
];

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const router = useRouter();
  const listRef = useRef<FlatList>(null);

  const finish = async () => {
    await storage.setItem("keymind_onboarded", true);
    router.replace("/login");
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      setIndex(index + 1);
    } else {
      finish();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SLIDES[index].bg }} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Text style={styles.brand} testID="onboarding-brand">KEYMIND AI</Text>
        <TouchableOpacity onPress={finish} testID="onboarding-skip-btn">
          <Text style={styles.skip}>SKIP</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(i);
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width, backgroundColor: item.bg }]}>
            <View style={styles.iconBlock}>
              <Ionicons name={item.icon} size={80} color={COLORS.text} />
            </View>
            <Text style={styles.title} testID="onboarding-title">{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.cta} onPress={next} testID="onboarding-next-btn">
          <Text style={styles.ctaText}>
            {index === SLIDES.length - 1 ? "GET STARTED" : "NEXT"}
          </Text>
          <Ionicons name="arrow-forward" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  brand: { fontSize: 14, fontWeight: FONT.black, letterSpacing: 2, color: COLORS.text },
  skip: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 2, color: COLORS.text },
  slide: { padding: 24, justifyContent: "center", alignItems: "flex-start" },
  iconBlock: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    ...SHADOW.brutal,
  },
  title: { fontSize: 44, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -1.5, lineHeight: 48 },
  subtitle: { marginTop: 20, fontSize: 16, fontWeight: FONT.regular, lineHeight: 24, color: COLORS.text, maxWidth: 320 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(15,15,15,0.25)" },
  dotActive: { width: 24, backgroundColor: COLORS.text },
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
  ctaText: { fontSize: 16, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.bg },
});
