export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  section: 28,
  pageBottom: 38,
} as const;

export const radius = {
  sm: 10,
  md: 13,
  card: 18,
  hero: 24,
  pill: 999,
} as const;

export const control = {
  icon: 42,
  button: 44,
  compactButton: 38,
} as const;

export const typography = {
  eyebrow: { fontSize: 10, fontWeight: "800" as const, letterSpacing: 1.2 },
  title: { fontFamily: "PlayfairDisplaySemiBold", fontSize: 30 },
  section: { fontFamily: "PlayfairDisplaySemiBold", fontSize: 20 },
  body: { fontFamily: "OpenSans", fontSize: 14, lineHeight: 21 },
  meta: { fontFamily: "OpenSans", fontSize: 11 },
} as const;

export const motion = {
  fast: 160,
  standard: 220,
  slow: 320,
  pressedOpacity: 0.74,
} as const;

export function cardStyle(palette: Record<string, string>) {
  return {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radius.card,
    borderWidth: 1,
  } as const;
}
