import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/contexts/AuthContext";
import { storage } from "@/src/utils/storage";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";

WebBrowser.maybeCompleteAuthSession();

// Hidden admin email; if user types this, a password field appears.
const ADMIN_EMAIL = "himthegreat@gmail.com";

export default function Login() {
  const { signInWithSessionId, signInAsGuest, signInAsAdmin, user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "guest" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Hidden admin gesture: 11 quick taps on the KM logo.
  const tapCountRef = React.useRef(0);
  const tapResetRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const onLogoTap = () => {
    if (showEmail) return;
    if (tapResetRef.current) clearTimeout(tapResetRef.current);
    tapCountRef.current += 1;
    if (tapCountRef.current >= 22) {
      tapCountRef.current = 0;
      setShowEmail(true);
      return;
    }
    // Reset if user pauses > 1.2s between taps
    tapResetRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (tapResetRef.current) clearTimeout(tapResetRef.current);
    };
  }, []);

  const isAdminEmail = email.trim().toLowerCase() === ADMIN_EMAIL;

  useEffect(() => {
    if (loading || !user || busy) return;
    (async () => {
      const setupDone = await storage.getItem<boolean>("keymind_setup_done", false);
      router.replace(setupDone ? "/(tabs)" : "/setup");
    })();
  }, [loading, user, busy, router]);

  const parseSessionId = (url: string): string | null => {
    try {
      const hashIdx = url.indexOf("#");
      const hash = hashIdx >= 0 ? url.substring(hashIdx + 1) : "";
      const qIdx = url.indexOf("?");
      const q = qIdx >= 0 ? url.substring(qIdx + 1, hashIdx >= 0 ? hashIdx : undefined) : "";
      const params = new URLSearchParams(hash || q);
      return params.get("session_id");
    } catch {
      return null;
    }
  };

  const handleGoogle = async () => {
    setBusy("google");
    setError(null);
    try {
      const redirectUrl =
        Platform.OS === "web" ? (window.location.origin + "/") : Linking.createURL("auth");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === "web") {
        window.location.href = authUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) {
        setBusy(null);
        return;
      }
      const sid = parseSessionId(result.url);
      if (!sid) {
        setError("Could not retrieve session. Please try again.");
        setBusy(null);
        return;
      }
      await signInWithSessionId(sid);
      router.replace("/setup");
    } catch (e: any) {
      setError(e?.message || "Sign-in failed");
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

  const handleEmailContinue = async () => {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!e) {
      setError("Enter your email.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError("Enter a valid email address.");
      return;
    }
    if (e !== ADMIN_EMAIL) {
      // Non-admin emails should use Google sign-in
      setError("This app uses Google Sign-in. Tap CONTINUE WITH GOOGLE above.");
      return;
    }
    if (!password) {
      setError("Enter your admin password.");
      return;
    }
    setBusy("email");
    try {
      await signInAsAdmin(e, password);
      const setupDone = await storage.getItem<boolean>("keymind_setup_done", false);
      router.replace(setupDone ? "/(tabs)" : "/setup");
    } catch (err: any) {
      setError(err?.detail || err?.message || "Invalid credentials");
      setBusy(null);
    }
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const sid = parseSessionId(url);
    if (sid) {
      setBusy("google");
      signInWithSessionId(sid)
        .then(() => {
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname);
          }
          router.replace("/setup");
        })
        .catch((e) => {
          setError(e?.message || "Sign-in failed");
          setBusy(null);
        });
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onLogoTap}
              style={styles.logoBlock}
              accessibilityLabel="KeyMind logo"
              testID="login-logo"
            >
              <Text style={styles.logoText}>KM</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>Welcome to{"\n"}KeyMind AI</Text>
            <Text style={styles.subtitle}>
              Sign in to unlock multilingual grammar correction, 16 AI writing tools and your personal writing tutor.
            </Text>

            {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

            <TouchableOpacity
              style={[styles.googleBtn, busy === "google" && styles.btnDisabled]}
              onPress={handleGoogle}
              disabled={!!busy}
              testID="login-google-btn"
            >
              {busy === "google" ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={22} color={COLORS.text} />
                  <Text style={styles.googleBtnText}>CONTINUE WITH GOOGLE</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.guestBtn, busy === "guest" && styles.btnDisabled]}
              onPress={handleGuest}
              disabled={!!busy}
              testID="login-guest-btn"
            >
              {busy === "guest" ? (
                <ActivityIndicator color={COLORS.bg} />
              ) : (
                <>
                  <Ionicons name="person-outline" size={20} color={COLORS.bg} />
                  <Text style={styles.guestBtnText}>CONTINUE AS GUEST</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Hidden admin form — revealed via 22 taps on KM logo. No visible toggle, no badge. */}
            {showEmail && (
              <View style={styles.emailForm}>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  style={styles.input}
                  testID="login-email-input"
                />
                {isAdminEmail && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 14 }]}>PASSWORD</Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor={COLORS.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      style={styles.input}
                      testID="login-password-input"
                    />
                  </>
                )}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                  <TouchableOpacity
                    style={[styles.emailBtn, { backgroundColor: COLORS.surface }]}
                    onPress={() => {
                      setShowEmail(false);
                      setEmail("");
                      setPassword("");
                      setError(null);
                    }}
                    disabled={busy === "email"}
                    testID="login-email-cancel"
                  >
                    <Text style={[styles.emailBtnText, { color: COLORS.text }]}>CANCEL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.emailBtn,
                      { backgroundColor: COLORS.text, flex: 2 },
                      busy === "email" && styles.btnDisabled,
                    ]}
                    onPress={handleEmailContinue}
                    disabled={busy === "email"}
                    testID="login-email-continue"
                  >
                    {busy === "email" ? (
                      <ActivityIndicator color={COLORS.bg} />
                    ) : (
                      <Text style={[styles.emailBtnText, { color: COLORS.bg }]}>
                        {isAdminEmail ? "SIGN IN" : "CONTINUE"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={styles.tos}>
              By continuing you agree to our{"\n"}
              <Text style={{ fontWeight: FONT.bold }}>Terms of Service</Text> and{" "}
              <Text style={{ fontWeight: FONT.bold }}>Privacy Policy</Text>.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24 },
  header: { alignItems: "center", marginTop: 24 },
  logoBlock: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.brutal,
  },
  logoText: { fontSize: 38, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -2 },
  body: { flex: 1, justifyContent: "center", paddingTop: 16 },
  title: { fontSize: 40, fontWeight: FONT.black, letterSpacing: -1.5, color: COLORS.text, lineHeight: 44 },
  subtitle: { marginTop: 14, fontSize: 15, lineHeight: 22, color: COLORS.textMuted, fontWeight: FONT.regular },
  error: { marginTop: 20, color: "#B91C1C", fontWeight: FONT.bold, fontSize: 13 },
  googleBtn: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: 18,
    ...SHADOW.brutal,
  },
  googleBtnText: { fontSize: 14, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  guestBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.text,
    borderWidth: 3,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: 18,
    ...SHADOW.brutal,
  },
  guestBtnText: { fontSize: 14, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.bg },
  btnDisabled: { opacity: 0.6 },
  emailForm: {
    marginTop: 18, padding: 14, borderRadius: RADIUS.lg,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  adminBadgeRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    backgroundColor: COLORS.secondary, borderWidth: 2, borderColor: COLORS.border,
    marginBottom: 10,
  },
  adminBadgeText: { fontSize: 10, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 1.2 },
  fieldLabel: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 2, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, color: COLORS.text, fontWeight: FONT.bold,
  },
  emailBtn: {
    flex: 1, paddingVertical: 14, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.border, ...SHADOW.brutalSm,
  },
  emailBtnText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5 },
  tos: { marginTop: 24, fontSize: 12, color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },
});
