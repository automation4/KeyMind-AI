import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/contexts/AuthContext";
import { storage } from "@/src/utils/storage";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";

export default function Login() {
  const { signInAsGuest, signInAsAdmin } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"guest" | "admin" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hidden admin: 22 taps on the KeyMind logo → opens a credentials modal.
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleLogoTap = () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapCountRef.current += 1;
    if (tapCountRef.current >= 22) {
      tapCountRef.current = 0;
      setAdminError(null);
      setAdminEmail("");
      setAdminPassword("");
      setAdminModalOpen(true);
      return;
    }
    // Reset the counter if the user pauses for more than ~1.5s between taps.
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1500);
  };

  const submitAdminLogin = async () => {
    setAdminError(null);
    if (!adminEmail.trim() || !adminPassword) {
      setAdminError("Email and password are required.");
      return;
    }
    setBusy("admin");
    try {
      await signInAsAdmin(adminEmail.trim(), adminPassword);
      setAdminModalOpen(false);
      const setupDone = await storage.getItem<boolean>("keymind_setup_done", false);
      router.replace(setupDone ? "/(tabs)" : "/setup");
    } catch (e: any) {
      setAdminError(e?.detail || e?.message || "Invalid credentials");
    } finally {
      setBusy(null);
    }
  };

  const handleSignup = () => {
    setError(null);
    router.push({ pathname: "/email-auth", params: { mode: "signup" } });
  };

  const handleSignin = () => {
    setError(null);
    router.push({ pathname: "/email-auth", params: { mode: "signin" } });
  };

  const handleGuest = async () => {
    setBusy("guest");
    setError(null);
    try {
      await signInAsGuest();
      router.replace("/setup");
    } catch (e: any) {
      setError(e?.message || "Guest sign-in failed");
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleLogoTap}
          style={styles.logoBlock}
          testID="login-logo"
        >
          <Text style={styles.logoText}>KM</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Welcome to{"\n"}KeyMind AI</Text>

        {error ? (
          <Text style={styles.error} testID="login-error">
            {error}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* Primary CTA — Sign up (create new Gmail account) */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleSignup}
          disabled={!!busy}
          testID="login-signup-btn"
        >
          <Ionicons name="person-add-outline" size={20} color={COLORS.onPrimary} />
          <Text style={styles.primaryBtnText}>Sign up</Text>
        </TouchableOpacity>

        {/* Sign in — existing accounts */}
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={handleSignin}
          disabled={!!busy}
          testID="login-signin-btn"
        >
          <Ionicons name="log-in-outline" size={20} color={COLORS.primary} />
          <Text style={styles.outlineBtnText}>Sign in</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Secondary — Guest */}
        <TouchableOpacity
          style={[styles.secondaryBtn, busy === "guest" && styles.btnDisabled]}
          onPress={handleGuest}
          disabled={!!busy}
          testID="login-guest-btn"
        >
          {busy === "guest" ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <>
              <Ionicons name="person-outline" size={18} color={COLORS.text} />
              <Text style={styles.secondaryBtnText}>Continue as Guest</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.tos}>
          By continuing you agree to our{"\n"}
          <Text style={{ fontWeight: FONT.bold }}>Terms of Service</Text> and{" "}
          <Text style={{ fontWeight: FONT.bold }}>Privacy Policy</Text>.
        </Text>
      </View>

      {/* Hidden admin login — triggered by tapping the logo 22 times */}
      <Modal
        visible={adminModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAdminModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard} testID="admin-modal">
            <View style={styles.modalHeader}>
              <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.text} />
              <Text style={styles.modalTitle}>Admin Sign-in</Text>
              <TouchableOpacity
                onPress={() => setAdminModalOpen(false)}
                style={styles.modalClose}
                testID="admin-modal-close"
              >
                <Ionicons name="close" size={20} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Enter admin credentials to continue.
            </Text>

            <TextInput
              value={adminEmail}
              onChangeText={setAdminEmail}
              placeholder="Email"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              testID="admin-email-input"
            />
            <TextInput
              value={adminPassword}
              onChangeText={setAdminPassword}
              placeholder="Password"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
              testID="admin-password-input"
            />

            {adminError ? (
              <Text style={styles.error} testID="admin-modal-error">
                {adminError}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.adminSubmit, busy === "admin" && styles.btnDisabled]}
              onPress={submitAdminLogin}
              disabled={busy === "admin"}
              testID="admin-modal-submit"
            >
              {busy === "admin" ? (
                <ActivityIndicator color={COLORS.onPrimary} />
              ) : (
                <Text style={styles.adminSubmitText}>Sign in as Admin</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24 },
  header: { alignItems: "center", marginTop: 32 },
  logoBlock: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.brutal,
  },
  logoText: { fontSize: 34, fontWeight: FONT.black, color: COLORS.onPrimary, letterSpacing: -2 },
  body: { flex: 1, paddingTop: 28 },
  title: {
    fontSize: 36,
    fontWeight: FONT.black,
    letterSpacing: -1.5,
    color: COLORS.text,
    lineHeight: 40,
    textAlign: "center",
  },
  error: { marginTop: 16, color: "#B91C1C", fontWeight: FONT.bold, fontSize: 13, textAlign: "center" },

  // Primary CTA (Continue with Email) — accent-filled
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.onPrimary,
    letterSpacing: 0.3,
  },

  // Outlined CTA (Sign in) — clearly secondary but still tappable
  outlineBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
  },
  outlineBtnText: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.primary,
    letterSpacing: 0.3,
  },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1.5, backgroundColor: COLORS.borderSoft },
  dividerText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.textMuted, letterSpacing: 2 },

  // Secondary (Guest) — outlined surface
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: FONT.semi,
    color: COLORS.text,
    letterSpacing: 0.2,
  },

  btnDisabled: { opacity: 0.6 },
  tos: { marginTop: 22, fontSize: 12, color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },

  // Hidden admin modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.border,
    padding: 20,
    ...SHADOW.brutal,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: FONT.black,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  modalClose: { padding: 4 },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 14,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
    marginBottom: 10,
  },
  adminSubmit: {
    marginTop: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  adminSubmitText: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.onPrimary,
    letterSpacing: 0.3,
  },
});
