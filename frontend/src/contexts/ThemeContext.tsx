import React, { createContext, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { COLORS } from "@/src/lib/theme";

export type ThemeMode = "light" | "dark" | "matte";
export type AccentName = "orange" | "yellow" | "mint" | "peach" | "sky" | "lilac";
export type PatternName = "classic" | "dots" | "grid" | "stripes" | "waves";

type ThemeState = {
  mode: ThemeMode;
  accent: AccentName;
  accentColor: string;
  customAccent: string | null;
  pattern: PatternName;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  setMode: (m: ThemeMode) => Promise<void>;
  setAccent: (a: AccentName) => Promise<void>;
  setCustomAccent: (hex: string | null) => Promise<void>;
  setPattern: (p: PatternName) => Promise<void>;
};

const accentMap: Record<AccentName, string> = {
  orange: COLORS.primary,
  yellow: COLORS.secondary,
  mint: COLORS.mint,
  peach: COLORS.peach,
  sky: COLORS.sky,
  lilac: COLORS.lilac,
};

const PATTERN_IDS = ["classic", "dots", "grid", "stripes", "waves"];

const ThemeContext = createContext<ThemeState | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [accent, setAccentState] = useState<AccentName>("orange");
  const [customAccent, setCustomAccentState] = useState<string | null>(null);
  const [pattern, setPatternState] = useState<PatternName>("classic");

  useEffect(() => {
    (async () => {
      const m = await storage.getItem<string>("keymind_theme_mode", "");
      const a = await storage.getItem<string>("keymind_accent", "");
      const c = await storage.getItem<string>("keymind_custom_accent", "");
      const p = await storage.getItem<string>("keymind_pattern", "");
      if (m === "dark" || m === "light" || m === "matte") setModeState(m);
      if (a && a in accentMap) setAccentState(a as AccentName);
      if (c && /^#[0-9a-fA-F]{6}$/.test(c)) setCustomAccentState(c);
      if (p && PATTERN_IDS.includes(p)) setPatternState(p as PatternName);
    })();
  }, []);

  const setMode = async (m: ThemeMode) => {
    setModeState(m);
    await storage.setItem("keymind_theme_mode", m);
  };
  const setAccent = async (a: AccentName) => {
    setAccentState(a);
    setCustomAccentState(null);
    await storage.setItem("keymind_accent", a);
    await storage.setItem("keymind_custom_accent", "");
  };
  const setCustomAccent = async (hex: string | null) => {
    setCustomAccentState(hex);
    await storage.setItem("keymind_custom_accent", hex ?? "");
  };
  const setPattern = async (p: PatternName) => {
    setPatternState(p);
    await storage.setItem("keymind_pattern", p);
  };

  const isDark = mode === "dark";
  const isMatte = mode === "matte";
  const darkish = isDark || isMatte;
  const value: ThemeState = {
    mode,
    accent,
    accentColor: customAccent || accentMap[accent],
    customAccent,
    pattern,
    bg: isDark ? COLORS.bgDark : isMatte ? COLORS.bgMatte : COLORS.bg,
    surface: isDark ? COLORS.surfaceDark : isMatte ? COLORS.surfaceMatte : COLORS.surface,
    text: darkish ? COLORS.textInverse : COLORS.text,
    textMuted: isDark ? "#A3A3A3" : isMatte ? "#C0C0C5" : COLORS.textMuted,
    border: isDark ? "#333333" : isMatte ? "#1F1F23" : COLORS.border,
    setMode,
    setAccent,
    setCustomAccent,
    setPattern,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
