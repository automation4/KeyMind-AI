import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, Path, Pattern, Rect, G } from "react-native-svg";

import { PatternName, useTheme } from "@/src/contexts/ThemeContext";

export const PATTERNS: { id: PatternName; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "stripes", label: "Stripes" },
  { id: "lines", label: "Lines" },
  { id: "crosshatch", label: "Hatch" },
  { id: "chevron", label: "Chevron" },
  { id: "waves", label: "Waves" },
  { id: "books", label: "Books" },
  { id: "paws", label: "Paws" },
  { id: "feathers", label: "Feathers" },
];

const STROKE = "#0A0A0A";

/** Renders a single repeating SVG pattern as a full-bleed layer. */
export const PatternSvg: React.FC<{ pattern: PatternName; opacity?: number }> = ({
  pattern,
  opacity = 0.22, // darker, more visible than before
}) => {
  if (pattern === "classic") return null;
  return (
    <Svg width="100%" height="100%" style={{ opacity }}>
      <Defs>
        {pattern === "dots" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="22" height="22">
            <Circle cx="5" cy="5" r="2.8" fill={STROKE} />
          </Pattern>
        )}

        {pattern === "grid" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="30" height="30">
            <Line x1="0" y1="0" x2="30" y2="0" stroke={STROKE} strokeWidth="2" />
            <Line x1="0" y1="0" x2="0" y2="30" stroke={STROKE} strokeWidth="2" />
          </Pattern>
        )}

        {pattern === "stripes" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="22" height="22">
            <Path d="M-6,6 L6,-6 M0,22 L22,0 M16,28 L28,16" stroke={STROKE} strokeWidth="3.5" />
          </Pattern>
        )}

        {pattern === "lines" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="6" height="6">
            <Line x1="0" y1="0" x2="6" y2="0" stroke={STROKE} strokeWidth="1.5" />
          </Pattern>
        )}

        {pattern === "crosshatch" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="14" height="14">
            <Line x1="0" y1="0" x2="14" y2="14" stroke={STROKE} strokeWidth="1.5" />
            <Line x1="14" y1="0" x2="0" y2="14" stroke={STROKE} strokeWidth="1.5" />
          </Pattern>
        )}

        {pattern === "chevron" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="24" height="14">
            <Path
              d="M0 10 L12 2 L24 10"
              stroke={STROKE}
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Pattern>
        )}

        {pattern === "waves" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="44" height="22">
            <Path
              d="M0 12 Q 11 0, 22 12 T 44 12"
              stroke={STROKE}
              strokeWidth="2.5"
              fill="none"
            />
          </Pattern>
        )}

        {pattern === "books" && (
          // Stylised "open book" silhouette — two pages joined at a spine.
          <Pattern id="p" patternUnits="userSpaceOnUse" width="44" height="44">
            <G stroke={STROKE} strokeWidth="2" fill="none" strokeLinejoin="round">
              <Path d="M6 28 L22 22 L22 36 L6 42 Z" />
              <Path d="M22 22 L38 28 L38 42 L22 36 Z" />
              <Line x1="22" y1="22" x2="22" y2="36" />
              <Line x1="10" y1="30" x2="18" y2="27" strokeWidth="1.2" />
              <Line x1="10" y1="34" x2="18" y2="31" strokeWidth="1.2" />
              <Line x1="26" y1="27" x2="34" y2="30" strokeWidth="1.2" />
              <Line x1="26" y1="31" x2="34" y2="34" strokeWidth="1.2" />
            </G>
          </Pattern>
        )}

        {pattern === "paws" && (
          // Cat / dog paw print — main pad + 4 toe beans.
          <Pattern id="p" patternUnits="userSpaceOnUse" width="46" height="46">
            <G fill={STROKE}>
              <Path d="M23 24 Q 17 24, 17 30 Q 17 36, 23 38 Q 29 36, 29 30 Q 29 24, 23 24 Z" />
              <Circle cx="15" cy="20" r="2.4" />
              <Circle cx="21" cy="16" r="2.4" />
              <Circle cx="27" cy="16" r="2.4" />
              <Circle cx="32" cy="20" r="2.4" />
            </G>
          </Pattern>
        )}

        {pattern === "feathers" && (
          // Light, ornamental feather — works as an animal-/nature-themed motif.
          <Pattern id="p" patternUnits="userSpaceOnUse" width="40" height="40">
            <G stroke={STROKE} strokeWidth="1.8" fill="none" strokeLinecap="round">
              <Path d="M10 32 C 14 18, 26 14, 32 8" />
              <Path d="M16 26 C 20 24, 24 22, 28 18" />
              <Path d="M14 30 C 18 28, 22 26, 26 22" />
              <Path d="M12 32 C 16 30, 20 28, 24 26" />
            </G>
          </Pattern>
        )}
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#p)" />
    </Svg>
  );
};

/**
 * Full-screen background pattern layer.
 * Drop as the FIRST child of a screen root — it positions absolutely
 * behind content and ignores touches.
 */
export const PatternBackground: React.FC = () => {
  const { pattern } = useTheme();
  if (pattern === "classic") return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="pattern-background">
      <PatternSvg pattern={pattern} />
    </View>
  );
};
