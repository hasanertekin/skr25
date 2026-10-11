import { useMemo, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";

import { usePlayer } from "@/lib/player-context";
import { getLightThemePalette, useThemeContext } from "@/lib/theme-provider";

export function PersistentGratitudePlayer() {
  const router = useRouter();
  const pathname = usePathname();
  const { entries, currentIndex, isPlaying, isVisible, sourceLabel, toggle, next, previous, hide } = usePlayer();
  const { palette, colorScheme, themeName } = useThemeContext();
  const [collapsed, setCollapsed] = useState(false);
  const mini = useMemo(() => {
    if (colorScheme === "dark") {
      const light = getLightThemePalette(themeName);
      return {
        container: light.background, border: light.border, text: light.foreground,
        iconBackground: light.soft, icon: light.primary, controlIcon: light.foreground,
        playBackground: light.primary, playIcon: light.onPrimary, progressTrack: light.border, progressFill: light.primary,
      };
    }
    return {
      container: palette.foreground, border: palette.primary, text: palette.background,
      iconBackground: palette.background, icon: palette.foreground, controlIcon: palette.background,
      playBackground: palette.background, playIcon: palette.foreground, progressTrack: palette.background, progressFill: palette.primary,
    };
  }, [colorScheme, palette, themeName]);
  const styles = useMemo(() => createStyles(mini), [mini]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 8 || Math.abs(gesture.dx) > 8,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 22 || Math.abs(gesture.dx) > 22) setCollapsed(true);
      else if (gesture.dy < -22) setCollapsed(false);
    },
  }), []);

  if (!entries.length || !isVisible || pathname === "/settings" || pathname === "/player") return null;
  const current = entries[currentIndex];
  const progress = entries.length ? ((currentIndex + 1) / entries.length) * 100 : 0;

  if (collapsed) {
    return (
      <View {...panResponder.panHandlers} style={styles.collapsed} accessibilityHint="Yukarı sürükleyerek genişlet">
        <Pressable onPress={() => setCollapsed(false)} style={styles.collapsedIcon} accessibilityRole="button" accessibilityLabel="Mini çaları genişlet">
          <Ionicons name="volume-high-outline" size={20} color={mini.controlIcon} />
        </Pressable>
        <Pressable onPress={toggle} style={styles.collapsedPlay} accessibilityRole="button" accessibilityLabel={isPlaying ? "Dinlemeyi duraklat" : "Kaldığın yerden devam et"}>
          <Ionicons name={isPlaying ? "pause" : "play"} size={17} color={mini.playIcon} />
        </Pressable>
      </View>
    );
  }

  return (
    <View {...panResponder.panHandlers} style={styles.container} accessibilityHint="Aşağı sürükleyerek küçült, yukarı sürükleyerek genişlet">
      <View style={styles.gripWrap}><View style={styles.grip} /></View>
      <Pressable
        onPress={() => router.push("/player")}
        style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${sourceLabel}, ${currentIndex + 1} / ${entries.length}. Tam ekran dinlemeyi aç`}
      >
        <View style={styles.iconWrap}><Ionicons name="volume-high-outline" size={17} color={mini.icon} /></View>
        <View style={styles.copyText}>
          <Text style={styles.title} numberOfLines={1}>{current?.text || "Şükürlerin"}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{sourceLabel} · {currentIndex + 1}/{entries.length} · {isPlaying ? "Dinleniyor" : "Devam edebilirsin"}</Text>
        </View>
      </Pressable>

      <Pressable
        onPress={previous}
        disabled={currentIndex === 0}
        style={({ pressed }) => [styles.control, currentIndex === 0 && styles.disabled, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Önceki not"
        accessibilityState={{ disabled: currentIndex === 0 }}
        hitSlop={2}
      >
        <Ionicons name="play-skip-back" size={17} color={mini.controlIcon} />
      </Pressable>
      <Pressable onPress={toggle} style={({ pressed }) => [styles.play, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={isPlaying ? "Dinlemeyi duraklat" : "Kaldığın yerden devam et"} hitSlop={2}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={18} color={mini.playIcon} />
      </Pressable>
      <Pressable
        onPress={next}
        disabled={currentIndex >= entries.length - 1}
        style={({ pressed }) => [styles.control, currentIndex >= entries.length - 1 && styles.disabled, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Sonraki not"
        accessibilityState={{ disabled: currentIndex >= entries.length - 1 }}
        hitSlop={2}
      >
        <Ionicons name="play-skip-forward" size={17} color={mini.controlIcon} />
      </Pressable>
      <Pressable onPress={hide} style={({ pressed }) => [styles.close, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Mini çaları kapat" hitSlop={2}>
        <Ionicons name="close" size={18} color={mini.controlIcon} />
      </Pressable>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
    </View>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  container: { alignItems: "center", backgroundColor: palette.container, borderColor: palette.border, borderRadius: 20, borderWidth: 1, bottom: 72, flexDirection: "row", left: 10, minHeight: 88, paddingHorizontal: 4, paddingTop: 12, paddingBottom: 9, position: "absolute", right: 10, zIndex: 50 },
  gripWrap: { alignItems: "center", height: 8, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 1 },
  grip: { backgroundColor: palette.background, borderRadius: 3, height: 3, opacity: 0.5, width: 35 },
  copy: { alignItems: "center", flex: 1, flexDirection: "row", minHeight: 48, minWidth: 0 },
  iconWrap: { alignItems: "center", backgroundColor: palette.iconBackground, borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  copyText: { flex: 1, marginLeft: 6, minWidth: 0 },
  title: { color: palette.text, fontFamily: "PlayfairDisplaySemiBold", fontSize: 12 },
  subtitle: { color: palette.text, fontSize: 9, lineHeight: 13, marginTop: 3, opacity: 0.76 },
  control: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 36 },
  play: { alignItems: "center", backgroundColor: palette.playBackground, borderRadius: 20, height: 38, justifyContent: "center", width: 38 },
  close: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 34 },
  progressTrack: { backgroundColor: palette.progressTrack, borderRadius: 2, bottom: 0, height: 2, left: 11, opacity: 0.7, overflow: "hidden", position: "absolute", right: 11 },
  progressFill: { backgroundColor: palette.progressFill, borderRadius: 2, height: 2, opacity: 1 },
  collapsed: { alignItems: "center", backgroundColor: palette.container, borderColor: palette.border, borderRadius: 28, borderWidth: 1, bottom: 83, elevation: 6, height: 56, justifyContent: "center", position: "absolute", right: 15, width: 56, zIndex: 50 },
  collapsedIcon: { alignItems: "center", height: 54, justifyContent: "center", width: 54 },
  collapsedPlay: { alignItems: "center", backgroundColor: palette.playBackground, borderColor: palette.container, borderRadius: 13, borderWidth: 2, bottom: -5, height: 27, justifyContent: "center", position: "absolute", right: -4, width: 27 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.72 },
});
