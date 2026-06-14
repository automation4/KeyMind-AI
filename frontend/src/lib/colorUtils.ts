/**
 * Returns true if the given hex color is visually "light" (i.e. needs
 * dark text/icons for contrast).
 *
 * Uses the WCAG relative-luminance formula. Threshold of 0.6 chosen
 * empirically so that pastels like #FFD9A8 (peach) and #B8E1D9 (mint)
 * resolve as light, while saturated mid-tones like #4F46E5 (indigo)
 * resolve as dark.
 */
export function isLightColor(hex: string): boolean {
  if (!hex) return false;
  const m = hex.trim().replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (full.length !== 6) return false;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  // sRGB → linear
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.6;
}

/** Returns the best contrasting foreground color (#000 or #fff) for a bg. */
export function contrastOn(bg: string): string {
  return isLightColor(bg) ? "#000000" : "#ffffff";
}
