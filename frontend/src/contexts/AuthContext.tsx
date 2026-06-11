import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken, setToken } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

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
  signInWithSessionId: (session_id: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signInAsAdmin: (email: string, password: string) => Promise<void>;
  signInWithGoogleIdToken: (id_token: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
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

  const signInWithSessionId = async (session_id: string) => {
    const data = await api.exchangeSession(session_id);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const signInAsGuest = async () => {
    // One guest account per device — persist a device id so the backend
    // reuses the same guest user (and its usage limits) on every guest login.
    let deviceId = await storage.getItem<string>("keymind_device_id", "");
    if (!deviceId) {
      deviceId = `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      await storage.setItem("keymind_device_id", deviceId);
    }
    const data = await api.guest(deviceId);
    await setToken(data.session_token);
    setUser({ ...(data.user as User), is_guest: true });
  };

  const signInWithGoogleIdToken = async (id_token: string) => {
    const data = await api.googleLogin(id_token);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const signInWithEmail = async (email: string, password: string) => {
    const data = await api.emailLogin(email, password);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const signUpWithEmail = async (name: string, email: string, password: string) => {
    const data = await api.register(name, email, password);
    await setToken(data.session_token);
    setUser(data.user as User);
  };

  const signInAsAdmin = async (email: string, password: string) => {
    const data = await api.adminLogin(email, password);
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
      value={{ user, loading, signInWithSessionId, signInAsGuest, signInAsAdmin, signInWithGoogleIdToken, signInWithEmail, signUpWithEmail, signOut, refreshUser }}
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
