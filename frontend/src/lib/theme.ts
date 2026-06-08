// KeyMind AI design tokens — Neo-Brutalist + Pastel
export const COLORS = {
  bg: "#FFFDF9",
  bgDark: "#121212",
  surface: "#FFFFFF",
  surfaceDark: "#1C1C1C",
  text: "#0F0F0F",
  textMuted: "#525252",
  textInverse: "#F5F5F5",
  border: "#0F0F0F",
  borderSoft: "#E5E5E5",

  // Accents
  primary: "#FF9F1C",     // orange
  secondary: "#FFD166",   // butter yellow
  mint: "#A7F3D0",
  peach: "#FFDAB9",
  rose: "#FECDD3",
  sky: "#BAE6FD",
  lilac: "#DDD6FE",

  // Diff
  diffAddBg: "#A7F3D0",
  diffDelBg: "#FECDD3",
} as const;

export const SHADOW = {
  // React Native shadow approximation of "4px 4px 0 0 #0F0F0F"
  brutal: {
    shadowColor: "#0F0F0F",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  brutalSm: {
    shadowColor: "#0F0F0F",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const FONT = {
  black: "900" as const,
  bold: "700" as const,
  semi: "600" as const,
  regular: "500" as const,
};
