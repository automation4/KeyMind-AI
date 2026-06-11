import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, FONT } from "@/src/lib/theme";

const LAST_UPDATED = "11 June 2026";

export default function Privacy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="privacy-back"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

        <Section title="1. What We Collect">
          • Account info: if you sign in with Google we receive your name, email, and profile
          picture from Google.{"\n"}
          • Guest device ID: a randomly-generated identifier stored on-device so we can keep
          your data linked to you without an account.{"\n"}
          • Usage data: the text you submit to AI tools, voice clips you record for dictation,
          your daily usage count, and your subscription state.{"\n"}
          • Device info: app version and OS family (Android / iOS / Web) for debugging.
        </Section>

        <Section title="2. What We Do NOT Collect">
          • We do NOT collect your contacts, exact location, advertising ID, or browsing
          history.{"\n"}
          • We do NOT sell your personal data to third parties.{"\n"}
          • We do NOT use your private text to train any AI model.
        </Section>

        <Section title="3. How We Use Your Data">
          • To process your AI requests and return a response.{"\n"}
          • To save your history so you can revisit past suggestions.{"\n"}
          • To enforce usage quotas and detect abuse.{"\n"}
          • To communicate critical service notices.
        </Section>

        <Section title="4. Third-Party AI Providers">
          When you use a tool, the text or audio you submit is forwarded to:{"\n"}
          • Google (Gemini family) — for text generation, translation, and grammar.{"\n"}
          • OpenAI — for text-to-speech and Whisper voice-transcription fallback.{"\n"}
          These providers process the data under their own privacy policies and we do not
          allow them to use your inputs for training.
        </Section>

        <Section title="5. Storage &amp; Retention">
          Your history is stored on our servers (MongoDB) tied to your user account or guest
          device ID. You can delete individual items or clear all history from the History tab
          at any time. Logging out of Google or clearing app data removes your local session.
        </Section>

        <Section title="6. Children">
          The App is not directed to children under 13. If we learn we have collected data
          from a child under 13 without parental consent, we will delete it.
        </Section>

        <Section title="7. Your Choices">
          • Sign out at any time from Settings.{"\n"}
          • Clear history from the History tab.{"\n"}
          • Use Guest mode to avoid attaching data to a Google identity.{"\n"}
          • Request deletion of all your data by emailing support@keymind.app.
        </Section>

        <Section title="8. Security">
          We use HTTPS in transit and access-controlled databases at rest. No system is 100%
          secure — please report vulnerabilities to security@keymind.app.
        </Section>

        <Section title="9. Changes">
          We may update this policy from time to time. Material changes will be highlighted
          inside the App before they take effect.
        </Section>

        <Section title="10. Contact">
          Questions about privacy: privacy@keymind.app
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
