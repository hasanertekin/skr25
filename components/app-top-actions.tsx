import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useThemeContext } from "@/lib/theme-provider";

export function AppTopActions() {
  const router = useRouter();
  const { palette } = useThemeContext();
  return <Pressable onPress={() => router.push("/settings")} style={({ pressed }) => [styles.button, { backgroundColor: palette.surface, borderColor: palette.border }, pressed && styles.pressed]} accessibilityLabel="Ayarlar"><Ionicons name="settings-outline" size={18} color={palette.primary} /></Pressable>;
}

const styles = StyleSheet.create({ button: { alignItems: "center", borderRadius: 20, borderWidth: 1, height: 40, justifyContent: "center", width: 40 }, pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] } });
