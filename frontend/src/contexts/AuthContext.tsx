import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, clearToken, getToken, setToken } from "@/src/lib/api";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  is_guest?: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signInWithSessionId: (session_id: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
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
    const data = await api.guest();
    await setToken(data.session_token);
    setUser({ ...(data.user as User), is_guest: true });
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {}
    await clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithSessionId, signInAsGuest, signOut }}
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
