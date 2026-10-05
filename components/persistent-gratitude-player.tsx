import { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { usePlayer } from "@/lib/player-context";
import { useThemeContext } from "@/lib/theme-provider";

export function PersistentGratitudePlayer() {
  const router = useRouter();
  const pathname = usePathname();
  const { entries, currentIndex, isPlaying, isVisible, settings, toggle, next, previous, hide } = usePlayer();
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [hidden, setHidden] = useState(false);
  const offset = useRef(new Animated.ValueXY()).current;
  const start = useRef({ x: 0, y: 0 });
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
    onPanResponderGrant: () => { offset.stopAnimation((value) => { start.current = value; }); },
    onPanResponderMove: (_, gesture) => offset.setValue({ x: start.current.x + gesture.dx, y: start.current.y + gesture.dy }),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > 130) { setHidden(true); return; }
      const targetX = gesture.dx > 80 ? 110 : gesture.dx < -80 ? -110 : 0;
      Animated.spring(offset, { toValue: { x: targetX, y: 0 }, useNativeDriver: true, bounciness: 5 }).start();
    },
  })).current;
  if (!entries.length || !isVisible || pathname === "/settings" || pathname === "/player") return null;
  if (hidden) return <Pressable onPress={() => { setHidden(false); Animated.spring(offset, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(); }} style={[styles.restore, { backgroundColor: palette.surface }]}><Ionicons name="musical-notes" size={15} color={palette.primary} /><Text style={[styles.restoreText, { color: palette.foreground }]}>Çaları göster</Text></Pressable>;
  const current = entries[currentIndex];
  return <Animated.View {...panResponder.panHandlers} style={[styles.container, { backgroundColor: palette.foreground, transform: offset.getTranslateTransform() }]}><Pressable onPress={() => router.push("/player")} style={({ pressed }) => [styles.copy, pressed && styles.pressed]} accessibilityLabel="Tam ekran dinleme ekranını aç"><View style={[styles.iconWrap, { backgroundColor: palette.primary }]}><Ionicons name="volume-high" size={17} color={palette.surface} /></View><View style={styles.copyText}><Text style={[styles.title, { color: palette.surface }]} numberOfLines={1}>{current?.text || "Şükranların"}</Text><Text style={[styles.subtitle, { color: palette.border }]}>{isPlaying ? `${currentIndex + 1}/${entries.length} · ${settings.rate.toFixed(1)}x` : "Duraklatıldı · Tam ekran için dokun"}</Text></View></Pressable><Pressable onPress={previous} disabled={currentIndex === 0} style={({ pressed }) => [styles.control, currentIndex === 0 && styles.disabled, pressed && styles.pressed]} accessibilityLabel="Önceki şükür"><Ionicons name="play-skip-back" size={17} color={palette.border} /></Pressable><Pressable onPress={toggle} style={({ pressed }) => [styles.play, { backgroundColor: palette.primary }, pressed && styles.pressed]} accessibilityLabel={isPlaying ? "Durdur" : "Oynat"}><Ionicons name={isPlaying ? "pause" : "play"} size={16} color={palette.surface} /></Pressable><Pressable onPress={next} disabled={currentIndex >= entries.length - 1} style={({ pressed }) => [styles.control, currentIndex >= entries.length - 1 && styles.disabled, pressed && styles.pressed]} accessibilityLabel="Sonraki şükür"><Ionicons name="play-skip-forward" size={17} color={palette.border} /></Pressable><Pressable onPress={hide} style={({ pressed }) => [styles.close, pressed && styles.pressed]} accessibilityLabel="Mini çaları kapat"><Ionicons name="close" size={18} color={palette.border} /></Pressable></Animated.View>;
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({ container: { alignItems: "center", backgroundColor: palette.foreground, borderRadius: 21, bottom: 76, elevation: 10, flexDirection: "row", left: 8, minHeight: 86, padding: 13, position: "absolute", right: 8, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, zIndex: 50 }, copy: { alignItems: "center", flex: 1, flexDirection: "row", marginRight: 7 }, iconWrap: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 18, height: 38, justifyContent: "center", width: 38 }, copyText: { flex: 1, marginLeft: 10 }, title: { color: palette.surface, fontSize: 13, fontWeight: "800" }, subtitle: { color: palette.border, fontSize: 10, marginTop: 5 }, control: { alignItems: "center", height: 42, justifyContent: "center", width: 37 }, play: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 21, height: 42, justifyContent: "center", width: 42 }, close: { alignItems: "center", height: 38, justifyContent: "center", marginLeft: 2, width: 31 }, restore: { alignItems: "center", backgroundColor: palette.surface, borderRadius: 18, bottom: 82, flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 9, position: "absolute", right: 12, zIndex: 50 }, restoreText: { color: palette.foreground, fontSize: 11, fontWeight: "800" }, disabled: { opacity: 0.3 }, pressed: { opacity: 0.72, transform: [{ scale: 0.95 }] } });
