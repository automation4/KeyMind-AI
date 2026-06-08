import React, { createContext, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { COLORS } from "@/src/lib/theme";

export type ThemeMode = "light" | "dark";
export type AccentName = "orange" | "yellow" | "mint" | "peach" | "sky" | "lilac";

type ThemeState = {
  mode: ThemeMode;
  accent: AccentName;
  accentColor: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  setMode: (m: ThemeMode) => Promise<void>;
  setAccent: (a: AccentName) => Promise<void>;
};

const accentMap: Record<AccentName, string> = {
  orange: COLORS.primary,
  yellow: COLORS.secondary,
  mint: COLORS.mint,
  peach: COLORS.peach,
  sky: COLORS.sky,
  lilac: COLORS.lilac,
};

const ThemeContext = createContext<ThemeState | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [accent, setAccentState] = useState<AccentName>("orange");

  useEffect(() => {
    (async () => {
      const m = await storage.getItem<string>("keymind_theme_mode", "");
      const a = await storage.getItem<string>("keymind_accent", "");
      if (m === "dark" || m === "light") setModeState(m);
      if (a && a in accentMap) setAccentState(a as AccentName);
    })();
  }, []);

  const setMode = async (m: ThemeMode) => {
    setModeState(m);
    await storage.setItem("keymind_theme_mode", m);
  };
  const setAccent = async (a: AccentName) => {
    setAccentState(a);
    await storage.setItem("keymind_accent", a);
  };

  const isDark = mode === "dark";
  const value: ThemeState = {
    mode,
    accent,
    accentColor: accentMap[accent],
    bg: isDark ? COLORS.bgDark : COLORS.bg,
    surface: isDark ? COLORS.surfaceDark : COLORS.surface,
    text: isDark ? COLORS.textInverse : COLORS.text,
    textMuted: isDark ? "#A3A3A3" : COLORS.textMuted,
    border: isDark ? "#333333" : COLORS.border,
    setMode,
    setAccent,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
