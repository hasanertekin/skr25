import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { cardStyle, control, motion, radius, spacing, typography } from "@/lib/design-tokens";
import { useThemeContext } from "@/lib/theme-provider";

export function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  const { palette } = useThemeContext(); const styles = createStyles(palette);
  return <View style={styles.sectionHeader}><View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text>{typeof count === "number" ? <Text style={styles.count}>{count}</Text> : null}</View>{action}</View>;
}

export function AppCard({ children, style }: { children: React.ReactNode; style?: object }) {
  const { palette } = useThemeContext(); const styles = createStyles(palette);
  return <View style={[cardStyle(palette), styles.card, style]}>{children}</View>;
}

export function EmptyState({ icon = "leaf-outline", title, description, action }: { icon?: keyof typeof Ionicons.glyphMap; title: string; description: string; action?: React.ReactNode }) {
  const { palette } = useThemeContext(); const styles = createStyles(palette);
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={24} color={palette.primary} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{description}</Text>{action}</View>;
}

export function IconButton({ icon, onPress, label, color = "#2F7D5A", variant = "soft" }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string; color?: string; variant?: "soft" | "solid" | "danger" }) {
  const { palette } = useThemeContext(); const styles = createStyles(palette);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.iconButton, variant === "solid" && styles.iconSolid, variant === "danger" && styles.iconDanger, pressed && styles.pressed]}><Ionicons name={icon} size={19} color={variant === "solid" ? palette.onPrimary : color || palette.primary} /></Pressable>;
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: spacing.section, marginBottom: spacing.md },
  sectionCopy: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionTitle: { ...typography.section, color: palette.foreground },
  count: { backgroundColor: palette.soft, borderRadius: radius.sm, color: palette.primary, fontSize: 11, fontWeight: "800", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4 },
  card: { padding: spacing.lg },
  empty: { alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: 30 },
  emptyIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
  emptyTitle: { ...typography.section, color: palette.foreground, fontSize: 16, marginTop: spacing.md, textAlign: "center" },
  emptyText: { ...typography.body, color: palette.muted, fontSize: 13, marginTop: spacing.xs, textAlign: "center" },
  iconButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: radius.pill, height: control.icon, justifyContent: "center", width: control.icon },
  iconSolid: { backgroundColor: palette.primary },
  iconDanger: { backgroundColor: `${palette.error}22` },
  pressed: { opacity: motion.pressedOpacity },
});
