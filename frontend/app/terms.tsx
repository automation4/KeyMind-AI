import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, FONT, RADIUS } from "@/src/lib/theme";

const LAST_UPDATED = "11 June 2026";

export default function Terms() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="terms-back"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

        <Section title="1. Acceptance of Terms">
          By creating an account, signing in with Google, or continuing as a guest on KeyMind AI
          (the &quot;App&quot;), you agree to be bound by these Terms of Service. If you do not
          agree, please stop using the App.
        </Section>

        <Section title="2. Your Account">
          You may use the App either as a signed-in user (via Google) or as an anonymous Guest
          identified by your device. You are responsible for activity that happens under your
          account. You must not share your account credentials with anyone else.
        </Section>

        <Section title="3. Acceptable Use">
          KeyMind AI is a writing assistant. You agree not to use the App to (a) generate
          unlawful, harassing, hateful, sexually explicit involving minors, or violent content;
          (b) infringe anyone&apos;s intellectual property; (c) attempt to reverse-engineer,
          scrape, or overload our servers; or (d) build a competing product using our outputs.
        </Section>

        <Section title="4. AI-Generated Content">
          The App uses third-party large-language models (e.g. Gemini, OpenAI) to suggest text,
          translations, grammar corrections, and audio transcriptions. AI outputs may be
          inaccurate, biased, or offensive. You are solely responsible for what you do with the
          generated content. Do not rely on the App for legal, medical, or financial advice.
        </Section>

        <Section title="5. Premium &amp; Subscriptions">
          KeyMind AI offers an optional Premium tier that removes ads and unlocks advanced
          features. Pricing, billing periods, and renewals are shown inside the App before
          purchase. Subscription is currently in a beta preview phase and may be modified or
          discontinued; refunds are handled per the platform store policy (Google Play / App
          Store) where you purchased.
        </Section>

        <Section title="6. Daily Usage Limits">
          Free accounts have a daily AI usage quota. Premium and admin-whitelisted accounts have
          higher or unlimited quotas. We may adjust quotas to keep the service stable.
        </Section>

        <Section title="7. Content Ownership">
          You retain ownership of text you type into the App. You grant us a limited,
          non-exclusive licence to process your text on our servers and forward it to AI
          providers solely for the purpose of generating a response for you.
        </Section>

        <Section title="8. Termination">
          We may suspend or close any account that violates these Terms, abuses the service, or
          attempts to bypass billing. You may delete your data any time from Settings.
        </Section>

        <Section title="9. Disclaimer &amp; Liability">
          The App is provided &quot;as is&quot;. To the maximum extent allowed by law, we
          disclaim all warranties and are not liable for any indirect, incidental, or
          consequential damages arising from your use of the App.
        </Section>

        <Section title="10. Changes">
          We may update these Terms from time to time. Continued use after an update means you
          accept the new Terms.
        </Section>

        <Section title="11. Contact">
          Questions or notices: support@keymind.app
        </Section>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionBody}>{children}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.borderSoft,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  scroll: { padding: 20, paddingBottom: 60 },
  updated: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 18,
    fontWeight: FONT.semi,
  },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: FONT.black,
    color: COLORS.text,
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  sectionBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: COLORS.text,
  },
});
