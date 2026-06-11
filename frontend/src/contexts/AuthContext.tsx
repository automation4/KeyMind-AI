import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as Application from "expo-application";
import { api, clearToken, getToken, setToken } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

/**
 * Returns a STABLE device identifier that survives:
 *   • app sign-out
 *   • app reinstall (best-effort via OS APIs)
 *   • clearing AsyncStorage
 *
 * Priority:
 *   1. Android: Application.getAndroidId() (per-device + per-signing-key)
 *   2. iOS:     Application.getIosIdForVendorAsync() (per-device + per-vendor)
 *   3. Stored UUID in SecureStore (survives AsyncStorage wipes)
 *   4. Stored UUID in AsyncStorage (last-resort)
 *
 * The resolved value is also persisted to SecureStore + AsyncStorage so we
 * always converge on the SAME id even if one source becomes unavailable.
 */
async function getStableDeviceId(): Promise<string> {
  // 1. Try the OS-supplied stable id first.
  try {
    if (Platform.OS === "android") {
      const aid = Application.getAndroidId();
      if (aid && aid.length > 0) {
        await persistDeviceId(aid);
        return aid;
      }
    } else if (Platform.OS === "ios") {
      const iid = await Application.getIosIdForVendorAsync();
      if (iid && iid.length > 0) {
        await persistDeviceId(iid);
        return iid;
      }
    }
  } catch {
    // expo-application may be unavailable on web — fall through.
  }

  // 2. Try SecureStore (survives most data resets).
  const secure = await storage.secureGet<string>("keymind_device_id", "");
  if (secure) {
    await storage.setItem("keymind_device_id", secure);
    return secure;
  }

  // 3. Try AsyncStorage.
  const cached = await storage.getItem<string>("keymind_device_id", "");
  if (cached) {
    await storage.secureSet("keymind_device_id", cached);
    return cached;
  }

  // 4. Last resort: mint a new UUID and persist everywhere.
  const minted = `dev_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 12)}`;
  await persistDeviceId(minted);
  return minted;
}

async function persistDeviceId(id: string) {
  // Fire-and-forget — we don't want a storage hiccup to block sign-in.
  try {
    await storage.setItem("keymind_device_id", id);
  } catch {}
  try {
    await storage.secureSet("keymind_device_id", id);
  } catch {}
}

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  is_guest?: boolean;
  is_admin?: boolean;
  is_premium?: boolean;
  premium_source?: "admin" | "subscription" | null;
  subscription_plan?: "weekly" | "monthly" | null;
  subscription_expires_at?: string | null;
  tool_uses_today?: number;
  tool_uses_limit?: number;
  tool_uses_remaining?: number | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signInAsGuest: () => Promise<void>;
  signInWithGoogleIdToken: (id_token: string) => Promise<void>;
  signInAsAdmin: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.me();
      setUser(data.user as User);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signInAsGuest = async () => {
    // One guest account per device — use a stable OS device id when available
    // (Android.androidId / iOS.idForVendor) so the same guest user (and its
    // usage limits) is returned every time, even if AsyncStorage is cleared.
    const deviceId = await getStableDeviceId();
    const data = await api.guest(deviceId);
    await setToken(data.session_token);
    setUser({ ...(data.user as User), is_guest: true });
  };

  const signInWithGoogleIdToken = async (id_token: string) => {
    const data = await api.googleLogin(id_token);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const signInAsAdmin = async (email: string, password: string) => {
    const data = await api.adminLogin(email, password);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const signInWithEmail = async (email: string, password: string) => {
    const data = await api.emailLogin(email, password);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const registerWithEmail = async (email: string, password: string, name?: string) => {
    const data = await api.emailRegister(email, password, name);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {}
    await clearToken();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const data = await api.me();
      setUser(data.user as User);
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signInAsGuest, signInWithGoogleIdToken, signInAsAdmin, signInWithEmail, registerWithEmail, signOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
