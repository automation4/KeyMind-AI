import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/contexts/AuthContext";
import { COLORS, SHADOW, FONT, RADIUS } from "@/src/lib/theme";

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const { signInWithSessionId, signInAsGuest, user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<"google" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/(tabs)");
    }
  }, [loading, user, router]);

  const parseSessionId = (url: string): string | null => {
    try {
      // Parse hash fragment and query
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

  // Web: process session_id on mount if present in URL
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
      <View style={styles.header}>
        <View style={styles.logoBlock}>
          <Text style={styles.logoText}>KM</Text>
        </View>
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
  body: { flex: 1, justifyContent: "center" },
  title: { fontSize: 44, fontWeight: FONT.black, letterSpacing: -1.5, color: COLORS.text, lineHeight: 48 },
  subtitle: { marginTop: 14, fontSize: 15, lineHeight: 22, color: COLORS.textMuted, fontWeight: FONT.regular },
  error: { marginTop: 20, color: "#B91C1C", fontWeight: FONT.bold, fontSize: 13 },
  googleBtn: {
    marginTop: 32,
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
  tos: { marginTop: 24, fontSize: 12, color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },
});
