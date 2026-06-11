import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
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
  const { signInAsGuest, signInWithGoogleIdToken, user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <View style={styles.logoBlock} testID="login-logo">
          <Text style={styles.logoText}>KM</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Welcome to{"\n"}KeyMind AI</Text>
        <Text style={styles.subtitle}>
          Sign in with your Google account to unlock multilingual grammar
          correction, 13 AI writing tools and your personal writing tutor.
        </Text>

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
});
