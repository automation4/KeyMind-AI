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

// Admin signs in with this email + admin password through the normal form.
const ADMIN_EMAIL = "himthegreat@gmail.com";

export default function Login() {
  const {
    signInWithSessionId,
    signInAsGuest,
    signInAsAdmin,
    signInWithEmail,
    signUpWithEmail,
    user,
    loading,
  } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "guest" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    setInfo(null);
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
    setInfo(null);
    try {
      await signInAsGuest();
      router.replace("/setup");
    } catch (e: any) {
      setError(e?.message || "Guest sign-in failed");
      setBusy(null);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    if (mode === "signup") {
      if (!name.trim()) {
        setError("Enter your name.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    }
    setBusy("email");
    try {
      if (mode === "signup") {
        await signUpWithEmail(name.trim(), e, password);
      } else if (e === ADMIN_EMAIL) {
        await signInAsAdmin(e, password);
      } else {
        await signInWithEmail(e, password);
      }
      const setupDone = await storage.getItem<boolean>("keymind_setup_done", false);
      router.replace(setupDone ? "/(tabs)" : "/setup");
    } catch (err: any) {
      setError(err?.detail || err?.message || "Something went wrong. Try again.");
      setBusy(null);
    }
  };

  const comingSoon = (provider: string) => {
    setError(null);
    setInfo(`${provider} login is coming soon. Use Google or email for now.`);
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

  const isSignup = mode === "signup";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoBlock} testID="login-logo">
              <Text style={styles.logoText}>KM</Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>
              {isSignup ? "Create\naccount" : "Welcome to\nKeyMind AI"}
            </Text>
            <Text style={styles.subtitle}>
              {isSignup
                ? "Join KeyMind for multilingual grammar correction, 13 AI writing tools and your personal writing tutor."
                : "Sign in to unlock multilingual grammar correction, 13 AI writing tools and your personal writing tutor."}
            </Text>

            {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}
            {info ? <Text style={styles.info} testID="login-info">{info}</Text> : null}

            {/* Email / password form */}
            <View style={styles.form}>
              {isSignup && (
                <>
                  <Text style={styles.fieldLabel}>NAME</Text>
                  <TextInput
                    value={name}
                    onChangeText={(v) => {
                      setName(v);
                      if (error) setError(null);
                    }}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="words"
                    style={styles.input}
                    testID="login-name-input"
                  />
                </>
              )}
              <Text style={[styles.fieldLabel, isSignup && { marginTop: 14 }]}>EMAIL</Text>
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
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={[styles.input, { flex: 1 }]}
                  testID="login-password-input"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  testID="login-toggle-password"
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.text}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, busy === "email" && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={!!busy}
                testID="login-submit-btn"
              >
                {busy === "email" ? (
                  <ActivityIndicator color={COLORS.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {isSignup ? "CREATE ACCOUNT" : "SIGN IN"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setMode(isSignup ? "signin" : "signup");
                  setError(null);
                  setInfo(null);
                }}
                style={styles.switchModeBtn}
                testID="login-switch-mode"
              >
                <Text style={styles.switchModeText}>
                  {isSignup ? "Already have an account? Sign in" : "Create new account"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Social login */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <TouchableOpacity
                style={[styles.socialBtn, busy === "google" && styles.btnDisabled]}
                onPress={handleGoogle}
                disabled={!!busy}
                testID="login-google-btn"
              >
                {busy === "google" ? (
                  <ActivityIndicator color={COLORS.text} size="small" />
                ) : (
                  <Ionicons name="logo-google" size={24} color={COLORS.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={() => comingSoon("Facebook")}
                disabled={!!busy}
                testID="login-facebook-btn"
              >
                <Ionicons name="logo-facebook" size={24} color={COLORS.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={() => comingSoon("Apple")}
                disabled={!!busy}
                testID="login-apple-btn"
              >
                <Ionicons name="logo-apple" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Guest */}
            <TouchableOpacity
              style={[styles.guestBtn, busy === "guest" && styles.btnDisabled]}
              onPress={handleGuest}
              disabled={!!busy}
              testID="login-guest-btn"
            >
              {busy === "guest" ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <>
                  <Ionicons name="person-outline" size={18} color={COLORS.text} />
                  <Text style={styles.guestBtnText}>CONTINUE AS GUEST</Text>
                </>
              )}
            </TouchableOpacity>

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
  header: { alignItems: "center", marginTop: 12 },
  logoBlock: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.brutal,
  },
  logoText: { fontSize: 30, fontWeight: FONT.black, color: COLORS.text, letterSpacing: -2 },
  body: { flex: 1, paddingTop: 18 },
  title: { fontSize: 34, fontWeight: FONT.black, letterSpacing: -1.5, color: COLORS.text, lineHeight: 38 },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, color: COLORS.textMuted, fontWeight: FONT.regular },
  error: { marginTop: 14, color: "#B91C1C", fontWeight: FONT.bold, fontSize: 13 },
  info: { marginTop: 14, color: COLORS.text, fontWeight: FONT.bold, fontSize: 13 },

  form: {
    marginTop: 20, padding: 16, borderRadius: RADIUS.lg,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    ...SHADOW.brutalSm,
  },
  fieldLabel: { fontSize: 11, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.bg,
    borderWidth: 2, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, color: COLORS.text, fontWeight: FONT.bold,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyeBtn: {
    width: 46, height: 46, borderRadius: RADIUS.md,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.bg,
    alignItems: "center", justifyContent: "center",
  },
  primaryBtn: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.text,
    borderWidth: 3,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    ...SHADOW.brutal,
  },
  primaryBtnText: { fontSize: 14, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.bg },
  switchModeBtn: { marginTop: 14, alignItems: "center" },
  switchModeText: { fontSize: 13, fontWeight: FONT.black, color: COLORS.text, letterSpacing: 0.3 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24 },
  dividerLine: { flex: 1, height: 2, backgroundColor: COLORS.borderSoft },
  dividerText: { fontSize: 12, fontWeight: FONT.black, color: COLORS.textMuted, letterSpacing: 0.5 },

  socialRow: { flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 16 },
  socialBtn: {
    width: 60, height: 56, borderRadius: RADIUS.md,
    borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface,
    alignItems: "center", justifyContent: "center",
    ...SHADOW.brutalSm,
  },

  guestBtn: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    ...SHADOW.brutalSm,
  },
  guestBtnText: { fontSize: 13, fontWeight: FONT.black, letterSpacing: 1.5, color: COLORS.text },
  btnDisabled: { opacity: 0.6 },
  tos: { marginTop: 20, fontSize: 12, color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },
});
