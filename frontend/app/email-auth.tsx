import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useAuth } from "@/src/contexts/AuthContext";
import { storage } from "@/src/utils/storage";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";

// Gmail-only validator (matches the backend rule).
const GMAIL_RE = /^[a-z0-9._%+-]+@gmail\.com$/i;

export default function EmailAuth() {
  const { signInWithEmail, registerWithEmail } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();

  const [mode, setMode] = useState<"signup" | "signin">(
    params.mode === "signin" ? "signin" : "signup",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  const handleSubmit = async () => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Please enter your Gmail address.");
      return;
    }
    if (!GMAIL_RE.test(cleanEmail)) {
      setError("Only Gmail addresses are allowed (must end with @gmail.com).");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      if (isSignup) {
        await registerWithEmail(cleanEmail, password, name.trim() || undefined);
      } else {
        await signInWithEmail(cleanEmail, password);
      }
      const setupDone = await storage.getItem<boolean>("keymind_setup_done", false);
      router.replace(setupDone ? "/(tabs)" : "/setup");
    } catch (e: any) {
      setError(e?.detail || e?.message || "Could not complete request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        bottomOffset={32}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          testID="email-auth-back"
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.logoBlock}>
          <Text style={styles.logoText}>KM</Text>
        </View>

        <Text style={styles.title}>
          {isSignup ? "Create your\nKeyMind account" : "Welcome back"}
        </Text>
        <Text style={styles.subtitle}>
          {isSignup
            ? "Use your Gmail address to create an account. Only @gmail.com is accepted."
            : "Sign in with the email and password you used to create your account."}
        </Text>

        {isSignup && (
          <View style={styles.field}>
            <Text style={styles.label}>Display name (optional)</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              style={styles.input}
              testID="email-auth-name"
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Gmail address</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@gmail.com"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
            testID="email-auth-email"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              testID="email-auth-password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeBtn}
              testID="email-auth-toggle-password"
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={COLORS.text}
              />
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <Text style={styles.error} testID="email-auth-error">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.submitBtn, busy && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={busy}
          testID="email-auth-submit"
        >
          {busy ? (
            <ActivityIndicator color={COLORS.onPrimary} />
          ) : (
            <Text style={styles.submitText}>
              {isSignup ? "Create account" : "Sign in"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchModeBtn}
          onPress={() => {
            setError(null);
            setMode(isSignup ? "signin" : "signup");
          }}
          testID="email-auth-switch-mode"
        >
          <Text style={styles.switchModeText}>
            {isSignup
              ? "Already have an account?  Sign in"
              : "New here?  Create an account"}
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, paddingBottom: 60 },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },

  logoBlock: {
    marginTop: 18,
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    borderWidth: 2.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.brutalSm,
  },
  logoText: { fontSize: 24, fontWeight: FONT.black, color: COLORS.onPrimary, letterSpacing: -1.5 },

  title: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: FONT.black,
    letterSpacing: -1,
    color: COLORS.text,
    lineHeight: 32,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textMuted,
  },

  field: { marginTop: 18 },
  label: {
    fontSize: 11,
    fontWeight: FONT.black,
    letterSpacing: 1.4,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 14, default: 12 }),
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyeBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },

  error: {
    marginTop: 14,
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: FONT.bold,
    textAlign: "center",
  },

  submitBtn: {
    marginTop: 22,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    fontSize: 15,
    fontWeight: FONT.bold,
    color: COLORS.onPrimary,
    letterSpacing: 0.3,
  },
  btnDisabled: { opacity: 0.6 },

  switchModeBtn: { marginTop: 18, alignItems: "center", paddingVertical: 10 },
  switchModeText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: FONT.semi,
  },
});
