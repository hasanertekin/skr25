import { View, Text, StyleSheet } from "react-native";
import { AppTopActions } from "@/components/app-top-actions";
import { spacing, typography } from "@/lib/design-tokens";
import { useThemeContext } from "@/lib/theme-provider";

export function ScreenHeader({ eyebrow, title, intro, actions = true }: { eyebrow: string; title: string; intro?: string; actions?: boolean }) {
  const { palette } = useThemeContext();
  const styles = createStyles(palette);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        {actions ? <AppTopActions /> : null}
      </View>
      {intro ? <Text style={styles.intro}>{intro}</Text> : null}
    </View>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  wrap: { paddingTop: spacing.lg },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.eyebrow, color: palette.primary },
  title: { ...typography.title, color: palette.foreground, marginTop: 4 },
  intro: { ...typography.body, color: palette.muted, marginTop: 6 },
});
