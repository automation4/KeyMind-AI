import React, { useEffect, useRef, useState } from "react";
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
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import { useAuth } from "@/src/contexts/AuthContext";
import { storage } from "@/src/utils/storage";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // Running inside a cross-origin iframe (e.g. the Emergent preview) —
  // window.opener/location access is blocked there. Safe to ignore.
}

const GoogleLogo = ({ size = 22 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <Path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <Path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <Path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </Svg>
);

export default function Login() {
  const { signInAsGuest, signInWithGoogleIdToken, signInAsAdmin, user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "guest" | "admin" | null>(null);
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

  // Real Google OAuth — opens the genuine Google account chooser.
  const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: googleClientId,
    webClientId: googleClientId,
  });

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === "success") {
      const idToken =
        (googleResponse.params as any)?.id_token ||
        (googleResponse as any)?.authentication?.idToken;
      if (!idToken) {
        setError("Google did not return a token. Please try again.");
        setBusy(null);
        return;
      }
      signInWithGoogleIdToken(idToken)
        .then(async () => {
          const setupDone = await storage.getItem<boolean>("keymind_setup_done", false);
          router.replace(setupDone ? "/(tabs)" : "/setup");
        })
        .catch((e: any) => {
          setError(e?.detail || e?.message || "Google sign-in failed");
          setBusy(null);
        });
    } else if (googleResponse.type === "error") {
      setError(googleResponse.error?.message || "Google sign-in failed");
      setBusy(null);
    } else {
      // dismissed / cancelled
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  useEffect(() => {
    if (loading || !user || busy) return;
    (async () => {
      const setupDone = await storage.getItem<boolean>("keymind_setup_done", false);
      router.replace(setupDone ? "/(tabs)" : "/setup");
    })();
  }, [loading, user, busy, router]);

  const handleGoogle = async () => {
    setError(null);
    setBusy("google");
    try {
      await promptGoogle();
    } catch (e: any) {
      setError(e?.message || "Google sign-in failed");
      setBusy(null);
    }
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

        {/* Google sign-in — the only account login */}
        <TouchableOpacity
          style={[styles.googleBtn, (busy === "google" || !googleRequest) && styles.btnDisabled]}
          onPress={handleGoogle}
          disabled={!!busy || !googleRequest}
          testID="login-google-btn"
        >
          {busy === "google" ? (
            <ActivityIndicator color={COLORS.text} size="small" />
          ) : (
            <>
              <GoogleLogo size={22} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Guest */}
        <TouchableOpacity
          style={[styles.guestBtn, busy === "guest" && styles.btnDisabled]}
          onPress={handleGuest}
          disabled={!!busy}
          testID="login-guest-btn"
        >
          {busy === "guest" ? (
            <ActivityIndicator color={COLORS.onPrimary} />
          ) : (
            <>
              <Ionicons name="person-outline" size={18} color={COLORS.onPrimary} />
              <Text style={styles.guestBtnText}>Continue as Guest</Text>
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
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    fontWeight: FONT.regular,
    textAlign: "center",
  },
  error: { marginTop: 16, color: "#B91C1C", fontWeight: FONT.bold, fontSize: 13, textAlign: "center" },

  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: "#A5B4FC",
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
  },
  googleBtnText: { fontSize: 15, fontWeight: FONT.semi, color: COLORS.text, letterSpacing: 0.2 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1.5, backgroundColor: COLORS.borderSoft },
  dividerText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.textMuted, letterSpacing: 2 },

  guestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
  },
  guestBtnText: { fontSize: 15, fontWeight: FONT.semi, color: COLORS.onPrimary, letterSpacing: 0.2 },
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
