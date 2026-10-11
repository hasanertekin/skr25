import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { FOLDER_COVER_IDS, type FolderCoverId } from "@/lib/playlists";

export const FOLDER_COVERS: { id: FolderCoverId; title: string; source: number }[] = [
  { id: FOLDER_COVER_IDS[0], title: "Gün doğumu", source: require("@/assets/folder-covers/morning-lake-mobile.jpg") },
  { id: FOLDER_COVER_IDS[1], title: "Zeytin dalı", source: require("@/assets/folder-covers/olive-garden-mobile.jpg") },
  { id: FOLDER_COVER_IDS[2], title: "Bahçe yolu", source: require("@/assets/folder-covers/garden-path-mobile.jpg") },
];

export function FolderCoverPhoto({ coverId, size = 40, palette }: { coverId?: FolderCoverId | null; size?: number; palette: Record<string, string> }) {
  const cover = FOLDER_COVERS.find((item) => item.id === coverId);
  if (!cover) {
    return (
      <View style={{ alignItems: "center", backgroundColor: palette.soft, borderRadius: size * 0.3, height: size, justifyContent: "center", width: size }}>
        <Ionicons name="folder-outline" size={size * 0.48} color={palette.primary} />
      </View>
    );
  }
  return <Image source={cover.source} resizeMode="cover" style={{ borderRadius: size * 0.28, height: size, width: size }} />;
}

export function FolderCoverSelector({ value, onChange, palette }: { value: FolderCoverId; onChange: (value: FolderCoverId) => void; palette: Record<string, string> }) {
  const styles = createStyles(palette);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Klasör kapağı</Text>
      <View style={styles.options}>
        {FOLDER_COVERS.map((cover) => {
          const selected = value === cover.id;
          return (
            <Pressable
              key={cover.id}
              onPress={() => onChange(cover.id)}
              style={({ pressed }) => [styles.option, { backgroundColor: palette.surface, borderColor: selected ? palette.primary : palette.border }, pressed && styles.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${cover.title} kapak fotoğrafını seç`}
            >
              <View style={[styles.imageFrame, selected && { borderColor: palette.primary, borderWidth: 2 }]}>
                <Image source={cover.source} resizeMode="cover" style={styles.image} />
                {selected ? <View style={styles.check}><Ionicons name="checkmark" size={12} color={palette.onPrimary} /></View> : null}
              </View>
              <Text numberOfLines={1} style={styles.label}>{cover.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  wrap: { marginTop: 14 },
  title: { color: palette.foreground, fontSize: 12, fontWeight: "800", marginBottom: 7 },
  options: { flexDirection: "row", gap: 7 },
  option: { alignItems: "center", borderColor: palette.border, borderRadius: 12, borderWidth: 1, flex: 1, minWidth: 0, padding: 4 },
  imageFrame: { aspectRatio: 1.42, borderColor: "transparent", borderRadius: 8, borderWidth: 2, overflow: "hidden", position: "relative", width: "100%" },
  image: { height: "100%", width: "100%" },
  check: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 10, height: 18, justifyContent: "center", position: "absolute", right: 4, top: 4, width: 18 },
  label: { color: palette.foreground, fontSize: 9, fontWeight: "700", marginTop: 5, textAlign: "center", width: "100%" },
  pressed: { opacity: 0.76 },
});
