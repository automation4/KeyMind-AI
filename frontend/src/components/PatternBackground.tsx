import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from "react-native-svg";

import { PatternName, useTheme } from "@/src/contexts/ThemeContext";

export const PATTERNS: { id: PatternName; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "stripes", label: "Stripes" },
  { id: "waves", label: "Waves" },
];

const STROKE = "#1A1A1A";

/** Renders a single repeating SVG pattern as a full-bleed layer. */
export const PatternSvg: React.FC<{ pattern: PatternName; opacity?: number }> = ({
  pattern,
  opacity = 0.14,
}) => {
  if (pattern === "classic") return null;
  return (
    <Svg width="100%" height="100%" style={{ opacity }}>
      <Defs>
        {pattern === "dots" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="26" height="26">
            <Circle cx="6" cy="6" r="2.4" fill={STROKE} />
          </Pattern>
        )}
        {pattern === "grid" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="32" height="32">
            <Line x1="0" y1="0" x2="32" y2="0" stroke={STROKE} strokeWidth="1.5" />
            <Line x1="0" y1="0" x2="0" y2="32" stroke={STROKE} strokeWidth="1.5" />
          </Pattern>
        )}
        {pattern === "stripes" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="24" height="24">
            <Path d="M-6,6 L6,-6 M0,24 L24,0 M18,30 L30,18" stroke={STROKE} strokeWidth="3" />
          </Pattern>
        )}
        {pattern === "waves" && (
          <Pattern id="p" patternUnits="userSpaceOnUse" width="40" height="20">
            <Path
              d="M0 10 Q 10 0, 20 10 T 40 10"
              stroke={STROKE}
              strokeWidth="2"
              fill="none"
            />
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
