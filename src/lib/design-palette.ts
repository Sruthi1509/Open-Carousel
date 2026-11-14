// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT

export interface DesignPalette {
  name?: string;
  primary: string;     // e.g. dark navy, deep blue, charcoal, bold brand base
  secondary: string;   // e.g. slate, dark teal, steel, secondary container
  accent: string;      // e.g. cyan, teal, electric blue, coral
  background: string;  // e.g. clean dark, pure white, crisp cream
  surface: string;     // e.g. card container background
  text: string;        // primary typography color
  muted: string;       // secondary typography & subtle borders
  border: string;      // card border / divider color
}

export const PRESET_PALETTES: Record<string, DesignPalette> = {
  blueTeal: {
    name: "Ocean Tech (Blue & Teal)",
    primary: "#0f172a",       // slate-900 / dark navy
    secondary: "#1e293b",     // slate-800
    accent: "#06b6d4",        // cyan-500 / bright teal
    background: "#0b1120",    // deep dark blue
    surface: "#1e293b",       // card background
    text: "#f8fafc",          // crisp white/ice
    muted: "#94a3b8",         // slate-400
    border: "rgba(6, 182, 212, 0.2)",
  },
  blueWhiteTeal: {
    name: "Crisp Blue, White & Teal (Light)",
    primary: "#0284c7",       // ocean blue
    secondary: "#0f766e",     // deep teal
    accent: "#0d9488",        // teal accent
    background: "#ffffff",    // crisp white
    surface: "#f0fdfa",       // very light teal tint
    text: "#0f172a",          // slate-900 text
    muted: "#64748b",         // slate-500 muted
    border: "rgba(13, 148, 136, 0.2)",
  },
  cleanMinimal: {
    name: "Minimalist Executive",
    primary: "#0f172a",
    secondary: "#334155",
    accent: "#3b82f6",
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#0f172a",
    muted: "#64748b",
    border: "rgba(0, 0, 0, 0.08)",
  },
  darkModern: {
    name: "Modern Dark",
    primary: "#111827",
    secondary: "#1f2937",
    accent: "#8b5cf6",
    background: "#030712",
    surface: "#1f2937",
    text: "#f9fafb",
    muted: "#9ca3af",
    border: "rgba(255, 255, 255, 0.1)",
  },
};

/**
 * Standard named CSS colors to hex mappings
 */
const COLOR_NAMES: Record<string, string> = {
  blue: "#2563eb",
  "deep blue": "#1d4ed8",
  "dark blue": "#0f172a",
  "navy blue": "#0a192f",
  navy: "#0a192f",
  "light blue": "#38bdf8",
  sky: "#0284c7",
  cyan: "#06b6d4",
  teal: "#0d9488",
  "dark teal": "#115e59",
  white: "#ffffff",
  black: "#000000",
  green: "#10b981",
  emerald: "#059669",
  purple: "#8b5cf6",
  violet: "#7c3aed",
  indigo: "#6366f1",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  slate: "#64748b",
  gray: "#6b7280",
  grey: "#6b7280",
  red: "#ef4444",
  rose: "#f43f5e",
  pink: "#ec4899",
};

/**
 * Extracts explicit user color preferences from prompt (e.g. "use blue and teal", "white background", "#0284c7")
 */
export function extractColorPreferences(text: string): {
  colors: string[];
  hasBlue: boolean;
  hasTeal: boolean;
  hasWhite: boolean;
  isDarkTheme: boolean;
  isLightTheme: boolean;
} {
  const lower = text.toLowerCase();
  const foundColors: string[] = [];

  // Match hex codes
  const hexMatches = lower.match(/#(?:[0-9a-f]{3}){1,2}\b/g) || [];
  foundColors.push(...hexMatches);

  // Match keyword colors
  const keywords = [
    "deep blue", "dark blue", "navy blue", "navy", "light blue",
    "blue", "teal", "cyan", "white", "black", "purple", "indigo",
    "green", "emerald", "orange", "yellow", "gray", "slate", "red", "pink"
  ];

  for (const kw of keywords) {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    if (regex.test(lower)) {
      foundColors.push(COLOR_NAMES[kw] || kw);
    }
  }

  const hasBlue = /\b(blue|navy|cyan|sky|azure)\b/i.test(lower);
  const hasTeal = /\b(teal|cyan|turquoise)\b/i.test(lower);
  const hasWhite = /\b(white|light)\b/i.test(lower);
  const isDarkTheme = /\b(dark|black|navy|night)\b/i.test(lower);
  const isLightTheme = /\b(light|white|clean|bright)\b/i.test(lower);

  return {
    colors: Array.from(new Set(foundColors)),
    hasBlue,
    hasTeal,
    hasWhite,
    isDarkTheme,
    isLightTheme,
  };
}

/**
 * Builds or selects an effective design palette from user prompt and brand settings.
 * Ensures explicit user requirements (e.g. blue and teal) strictly override defaults.
 */
export function resolveEffectivePalette(
  userPrompt: string,
  brandConfig?: { colors?: { primary?: string; accent?: string; background?: string } }
): DesignPalette {
  const { hasBlue, hasTeal, hasWhite, isDarkTheme, isLightTheme } = extractColorPreferences(userPrompt);

  // Case 1: User explicitly asked for Blue and/or Teal
  if (hasBlue || hasTeal) {
    if (isLightTheme || (hasWhite && !isDarkTheme)) {
      return {
        name: "Custom Blue & Teal (Light)",
        primary: "#0284c7",
        secondary: "#0f766e",
        accent: "#0d9488",
        background: "#ffffff",
        surface: "#f8fafc",
        text: "#0f172a",
        muted: "#64748b",
        border: "rgba(13, 148, 136, 0.25)",
      };
    }
    // Default to sleek dark blue & teal
    return {
      name: "Custom Blue & Teal (Dark)",
      primary: "#0f172a",
      secondary: "#1e293b",
      accent: "#06b6d4",
      background: "#080e1a",
      surface: "#131d31",
      text: "#f8fafc",
      muted: "#94a3b8",
      border: "rgba(6, 182, 212, 0.3)",
    };
  }

  // Case 2: User specified brand with explicit non-empty values
  if (brandConfig?.colors?.primary && brandConfig.colors.accent && brandConfig.colors.primary !== "#1a1a2e") {
    const bg = brandConfig.colors.background || "#ffffff";
    const isDarkBg = isDarkColor(bg);
    return {
      name: "Brand Defined",
      primary: brandConfig.colors.primary,
      secondary: isDarkBg ? "#1e293b" : "#f1f5f9",
      accent: brandConfig.colors.accent,
      background: bg,
      surface: isDarkBg ? "#182234" : "#f8fafc",
      text: isDarkBg ? "#f8fafc" : "#0f172a",
      muted: isDarkBg ? "#94a3b8" : "#64748b",
      border: isDarkBg ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)",
    };
  }

  // Case 3: Light or Dark default
  if (isDarkTheme) {
    return PRESET_PALETTES.blueTeal;
  }

  return PRESET_PALETTES.cleanMinimal;
}

function isDarkColor(hex: string): boolean {
  if (!hex.startsWith("#")) return false;
  const clean = hex.slice(1);
  if (clean.length !== 3 && clean.length !== 6) return false;
  const r = parseInt(clean.length === 3 ? clean[0] + clean[0] : clean.slice(0, 2), 16);
  const g = parseInt(clean.length === 3 ? clean[1] + clean[1] : clean.slice(2, 4), 16);
  const b = parseInt(clean.length === 3 ? clean[2] + clean[2] : clean.slice(4, 6), 16);
  // Perceived brightness formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

