import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";
import { loadPreferences } from "@/lib/app-preferences";
import { SchemeColors, type ColorScheme } from "@/constants/theme";

export type ThemePalette = Record<string, string>;
type ThemeContextValue = { colorScheme: ColorScheme; themeName: string; palette: ThemePalette; setColorScheme: (scheme: ColorScheme) => void; setThemeName: (name: string) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const themePalettes: Record<string, Record<string, string>> = {
  "Zümrüt Bahçe": { primary: "#2F7D5A", background: "#F8F6F0", surface: "#FFFFFF", foreground: "#163B2B", muted: "#7B8A82", border: "#E1E8E2", success: "#4E9B72", warning: "#E9A55E", error: "#C75C51" },
  "Altın Güneş": { primary: "#C88412", background: "#FFF8E6", surface: "#FFFFFF", foreground: "#4A3210", muted: "#927B5B", border: "#F0D9A7", success: "#759B3E", warning: "#C88412", error: "#C4553E" },
  "Yakut Akşamı": { primary: "#B53B50", background: "#FFF3F4", surface: "#FFFFFF", foreground: "#491D27", muted: "#98737B", border: "#F0D4D9", success: "#719B75", warning: "#D48C48", error: "#A72D43" },
  "Kraliyet Moru": { primary: "#7046A6", background: "#F7F2FF", surface: "#FFFFFF", foreground: "#2F2047", muted: "#83769A", border: "#E4D8F2", success: "#659B82", warning: "#D79543", error: "#BA4D68" },
  "Mercan Rüyası": { primary: "#D6534D", background: "#FFF3ED", surface: "#FFFFFF", foreground: "#4B2524", muted: "#977976", border: "#F1D5CA", success: "#6C9B72", warning: "#D37B35", error: "#B93E4B" },
  "Gece Safiri": { primary: "#4B75D1", background: "#101A36", surface: "#1C2A50", foreground: "#EEF2FF", muted: "#A1B0D0", border: "#354A7A", success: "#63B99B", warning: "#E0B36D", error: "#ED7F87" },
  "Çöl Bakırı": { primary: "#B7622B", background: "#FFF4E8", surface: "#FFFFFF", foreground: "#472715", muted: "#917766", border: "#F0D6BD", success: "#789B5D", warning: "#B7622B", error: "#B95043" },
  "Turkuaz Lagün": { primary: "#078F9B", background: "#ECFBFB", surface: "#FFFFFF", foreground: "#123B42", muted: "#6E8E92", border: "#CDEBED", success: "#399D82", warning: "#D49347", error: "#C4525B" },
  "Safran İncisi": { primary: "#D49A16", background: "#FFF9DB", surface: "#FFFFFF", foreground: "#483B12", muted: "#92875C", border: "#EEE1A8", success: "#6E9D54", warning: "#D49A16", error: "#C55A4B" },
  "Buzul Mavisi": { primary: "#3A83B7", background: "#EFF8FF", surface: "#FFFFFF", foreground: "#1B354A", muted: "#71899C", border: "#D5E8F5", success: "#5C9B88", warning: "#D79A55", error: "#C55A65" },
};
function paletteFor(name: string, scheme: ColorScheme) { return themePalettes[name] || SchemeColors[scheme]; }
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = "light" as ColorScheme; const [colorScheme, setColorSchemeState] = useState<ColorScheme>(systemScheme); const [themeName, setThemeNameState] = useState("Zümrüt Bahçe");
  useEffect(() => { loadPreferences().then((preferences) => { setThemeNameState(preferences.theme); setColorSchemeState(preferences.theme === "Gece Safiri" ? "dark" : "light"); }); }, []);
  const setThemeName = useCallback((name: string) => { setThemeNameState(name); const scheme = name === "Gece Safiri" ? "dark" : "light"; setColorSchemeState(scheme); nativewindColorScheme.set(scheme); Appearance.setColorScheme?.(scheme); }, []);
  const setColorScheme = useCallback((scheme: ColorScheme) => { setColorSchemeState(scheme); nativewindColorScheme.set(scheme); Appearance.setColorScheme?.(scheme); }, []);
  const palette = paletteFor(themeName, colorScheme);
  useEffect(() => { nativewindColorScheme.set(colorScheme); if (typeof document !== "undefined") { const root = document.documentElement; root.dataset.theme = themeName; root.classList.toggle("dark", colorScheme === "dark"); Object.entries(palette).forEach(([token, value]) => root.style.setProperty(`--color-${token}`, value)); } }, [colorScheme, palette, themeName]);
  const themeVariables = useMemo(() => vars(Object.fromEntries(Object.entries(palette).map(([key, value]) => [`color-${key}`, value]))), [palette]);
  const value = useMemo(() => ({ colorScheme, themeName, palette, setColorScheme, setThemeName }), [colorScheme, themeName, palette, setColorScheme, setThemeName]);
  return <ThemeContext.Provider value={value}><View style={[{ flex: 1, backgroundColor: palette.background }, themeVariables]}>{children}</View></ThemeContext.Provider>;
}
export function useThemeContext(): ThemeContextValue { const ctx = useContext(ThemeContext); if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider"); return ctx; }
