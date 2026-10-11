import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import { loadPreferences } from "@/lib/app-preferences";
import { SchemeColors, type ColorScheme } from "@/constants/theme";

export type ThemePalette = Record<string, string>;
type ThemeContextValue = {
  colorScheme: ColorScheme;
  themeName: string;
  palette: ThemePalette;
  setColorScheme: (scheme: ColorScheme) => void;
  setThemeName: (name: string) => void;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

const lightThemePalettes: Record<string, Record<string, string>> = {
  "Zümrüt Bahçe": { primary: "#2F7D5A", background: "#F8F6F0", surface: "#FFFFFF", foreground: "#163B2B", muted: "#63736A", border: "#E1E8E2", success: "#4E9B72", warning: "#E9A55E", error: "#C75C51" },
  "Altın Güneş": { primary: "#9A6408", background: "#FFF8E6", surface: "#FFFFFF", foreground: "#4A3210", muted: "#76603E", border: "#F0D9A7", success: "#759B3E", warning: "#C88412", error: "#C4553E" },
  "Yakut Akşamı": { primary: "#B53B50", background: "#FFF3F4", surface: "#FFFFFF", foreground: "#491D27", muted: "#795A62", border: "#F0D4D9", success: "#719B75", warning: "#D48C48", error: "#A72D43" },
  "Kraliyet Moru": { primary: "#7046A6", background: "#F7F2FF", surface: "#FFFFFF", foreground: "#2F2047", muted: "#6D5F7E", border: "#E4D8F2", success: "#659B82", warning: "#D79543", error: "#BA4D68" },
  "Mercan Rüyası": { primary: "#B84640", background: "#FFF3ED", surface: "#FFFFFF", foreground: "#4B2524", muted: "#7D625F", border: "#F1D5CA", success: "#6C9B72", warning: "#D37B35", error: "#B93E4B" },
  "Gece Safiri": { primary: "#4267B2", background: "#F2F5FC", surface: "#FFFFFF", foreground: "#1B2845", muted: "#606E89", border: "#DCE3F1", success: "#4D9478", warning: "#C58C38", error: "#B95062" },
  "Çöl Bakırı": { primary: "#A85120", background: "#FFF4E8", surface: "#FFFFFF", foreground: "#472715", muted: "#755F50", border: "#F0D6BD", success: "#789B5D", warning: "#B7622B", error: "#B95043" },
  "Turkuaz Lagün": { primary: "#087481", background: "#ECFBFB", surface: "#FFFFFF", foreground: "#123B42", muted: "#527477", border: "#CDEBED", success: "#399D82", warning: "#D49347", error: "#C4525B" },
  "Safran İncisi": { primary: "#956A08", background: "#FFF9DB", surface: "#FFFFFF", foreground: "#483B12", muted: "#756C46", border: "#EEE1A8", success: "#6E9D54", warning: "#D49A16", error: "#C55A4B" },
  "Buzul Mavisi": { primary: "#2E6F9D", background: "#EFF8FF", surface: "#FFFFFF", foreground: "#1B354A", muted: "#5D7182", border: "#D5E8F5", success: "#5C9B88", warning: "#D79A55", error: "#C55A65" },
  "Fuşya Çiçeği": { primary: "#A51C67", background: "#FFF2F8", surface: "#FFFFFF", foreground: "#42162F", muted: "#765A6B", border: "#EED2E0", success: "#548875", warning: "#C58749", error: "#B94C62" },
  "Adaçayı Bahçesi": { primary: "#52765A", background: "#F3F7EF", surface: "#FFFFFF", foreground: "#28382C", muted: "#647466", border: "#DDE7D9", success: "#52846A", warning: "#BE8741", error: "#B8584D" },
  "Gül Kurusu": { primary: "#A74B66", background: "#FFF3F5", surface: "#FFFFFF", foreground: "#4C2632", muted: "#795E66", border: "#EED8DE", success: "#628B73", warning: "#C68A4B", error: "#B44853" },
  "Okyanus Esintisi": { primary: "#276E8C", background: "#EFF8FA", surface: "#FFFFFF", foreground: "#173A49", muted: "#5C737C", border: "#D4E8EC", success: "#428978", warning: "#C58D49", error: "#B95156" },
  "Toprak Yolu": { primary: "#875533", background: "#FAF3EB", surface: "#FFFFFF", foreground: "#423020", muted: "#746355", border: "#EADBCB", success: "#62815C", warning: "#B97B38", error: "#B45046" },
  Renksiz: { primary: "#242424", background: "#FFFFFF", surface: "#FFFFFF", foreground: "#171717", muted: "#666666", border: "#E5E5E5", success: "#3F7952", warning: "#80601F", error: "#A33C3C" },
  "Limon Işığı": { primary: "#687900", background: "#FAFBEA", surface: "#FFFFFF", foreground: "#333913", muted: "#68704B", border: "#E4E9BD", success: "#427A4D", warning: "#A16B12", error: "#A44436" },
  "Kobalt Mavisi": { primary: "#174BBC", background: "#F1F5FF", surface: "#FFFFFF", foreground: "#172B50", muted: "#5C6C89", border: "#D6E0F5", success: "#43826B", warning: "#AA781C", error: "#A94555" },
  "Alev Turuncusu": { primary: "#B84211", background: "#FFF4EC", surface: "#FFFFFF", foreground: "#482315", muted: "#765E50", border: "#F0D7C6", success: "#5C8154", warning: "#A86816", error: "#A83F36" },
  "Jade Parıltısı": { primary: "#00795E", background: "#ECF8F2", surface: "#FFFFFF", foreground: "#153E33", muted: "#557268", border: "#CFE8DC", success: "#3F8A63", warning: "#A37621", error: "#AE4B43" },
  "Elektrik Turkuaz": { primary: "#00788D", background: "#ECFAFC", surface: "#FFFFFF", foreground: "#123942", muted: "#52717A", border: "#CDE9ED", success: "#3F8C78", warning: "#A87924", error: "#AD4B55" },
  "Nar Çiçeği": { primary: "#B5223B", background: "#FFF1F2", surface: "#FFFFFF", foreground: "#461D25", muted: "#765A60", border: "#F0D0D5", success: "#568160", warning: "#AA751D", error: "#A53342" },
  "Canlı Pembe": { primary: "#B51B78", background: "#FFF0F8", surface: "#FFFFFF", foreground: "#421638", muted: "#77596D", border: "#F0D0E4", success: "#56816A", warning: "#A87920", error: "#AA4158" },
  "Mango Işığı": { primary: "#A94D00", background: "#FFF6E8", surface: "#FFFFFF", foreground: "#462C13", muted: "#766347", border: "#EEDBB9", success: "#5D8155", warning: "#A76D0A", error: "#A84538" },
};

export function getThemeSwatchColor(name: string) {
  return lightThemePalettes[name]?.primary ?? SchemeColors.light.primary;
}

export function getLightThemePalette(name: string): ThemePalette {
  const light = lightThemePalettes[name] ?? SchemeColors.light;
  return {
    ...light,
    soft: mixHex(light.background, light.primary, 0.08),
    onPrimary: contrast(light.foreground, light.primary) >= contrast(light.surface, light.primary) ? light.foreground : light.surface,
  };
}

function mixHex(first: string, second: string, weight: number) {
  const a = first.replace("#", "");
  const b = second.replace("#", "");
  const channels = [0, 2, 4].map((index) => {
    const left = Number.parseInt(a.slice(index, index + 2), 16);
    const right = Number.parseInt(b.slice(index, index + 2), 16);
    return Math.round(left * (1 - weight) + right * weight).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function linearize(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  const value = color.replace("#", "");
  const r = linearize(Number.parseInt(value.slice(0, 2), 16));
  const g = linearize(Number.parseInt(value.slice(2, 4), 16));
  const b = linearize(Number.parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function darkPaletteFor(light: Record<string, string>) {
  const background = mixHex("#101512", light.primary, 0.12);
  return {
    primary: mixHex(light.primary, "#FFFFFF", 0.34),
    background,
    surface: mixHex(background, "#FFFFFF", 0.065),
    foreground: "#F2F5F1",
    muted: "#A9B4AD",
    border: mixHex(background, light.primary, 0.34),
    success: mixHex(light.success, "#FFFFFF", 0.25),
    warning: mixHex(light.warning, "#FFFFFF", 0.24),
    error: mixHex(light.error, "#FFFFFF", 0.20),
  };
}

function paletteFor(name: string, scheme: ColorScheme): Record<string, string> {
  const light = lightThemePalettes[name] || SchemeColors.light;
  const base = scheme === "dark"
    ? name === "Renksiz"
      ? { primary: "#D8D8D8", background: "#000000", surface: "#111111", foreground: "#F4F4F4", muted: "#B5B5B5", border: "#2B2B2B", success: "#A2C8AA", warning: "#DDC18F", error: "#E09A9A" }
      : darkPaletteFor(light)
    : light;
  return {
    ...base,
    ink: base.foreground,
    orange: base.warning,
    danger: base.error,
    soft: mixHex(base.background, base.primary, 0.08),
    primarySoft: mixHex(base.background, base.primary, 0.12),
    orangeSoft: mixHex(base.background, base.warning, 0.14),
    onPrimary: contrast(base.foreground, base.primary) >= contrast(base.surface, base.primary) ? base.foreground : base.surface,
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");
  const [themeName, setThemeNameState] = useState("Zümrüt Bahçe");

  useEffect(() => {
    let active = true;
    void loadPreferences().then((preferences) => {
      if (!active) return;
      setThemeNameState(preferences.theme);
      setColorSchemeState(preferences.colorScheme);
      nativewindColorScheme.set(preferences.colorScheme);
      Appearance.setColorScheme?.(preferences.colorScheme);
    });
    return () => { active = false; };
  }, []);

  const setThemeName = useCallback((name: string) => {
    setThemeNameState(name);
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    nativewindColorScheme.set(scheme);
    Appearance.setColorScheme?.(scheme);
  }, []);

  const palette = useMemo(() => paletteFor(themeName, colorScheme), [colorScheme, themeName]);
  useEffect(() => {
    nativewindColorScheme.set(colorScheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = themeName;
      root.classList.toggle("dark", colorScheme === "dark");
      Object.entries(palette).forEach(([token, value]) => root.style.setProperty(`--color-${token}`, value));
    }
  }, [colorScheme, palette, themeName]);
  const themeVariables = useMemo(() => vars(Object.fromEntries(Object.entries(palette).map(([key, value]) => [`color-${key}`, value]))), [palette]);
  const value = useMemo(() => ({ colorScheme, themeName, palette, setColorScheme, setThemeName }), [colorScheme, themeName, palette, setColorScheme, setThemeName]);

  return <ThemeContext.Provider value={value}><View style={[{ flex: 1, backgroundColor: palette.background }, themeVariables]}>{children}</View></ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemeContext must be used within ThemeProvider");
  return context;
}
