import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { FOLDER_COVER_IDS, type FolderCoverId } from "@/lib/playlists";

export const FOLDER_COVERS: { id: FolderCoverId; title: string; source: number }[] = [
  { id: FOLDER_COVER_IDS[0], title: "Gün doğumu", source: require("@/assets/folder-covers/morning-lake-mobile.jpg") },
  { id: FOLDER_COVER_IDS[1], title: "Zeytin dalı", source: require("@/assets/folder-covers/olive-garden-mobile.jpg") },
  { id: FOLDER_COVER_IDS[2], title: "Bahçe yolu", source: require("@/assets/folder-covers/garden-path-mobile.jpg") },
];

export function FolderCoverPhoto({ coverId, coverUri, size = 40, palette }: { coverId?: FolderCoverId | null; coverUri?: string | null; size?: number; palette: Record<string, string> }) {
  if (coverUri) return <Image source={{ uri: coverUri }} resizeMode="cover" style={{ borderRadius: size * 0.28, height: size, width: size }} />;
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

export function FolderCoverThumbnail({ coverId, coverUri, palette, width = 78, height = 52 }: { coverId?: FolderCoverId | null; coverUri?: string | null; palette: Record<string, string>; width?: number; height?: number }) {
  if (coverUri) return <Image source={{ uri: coverUri }} resizeMode="cover" style={{ borderRadius: 12, height, width }} />;
  const cover = FOLDER_COVERS.find((item) => item.id === coverId);
  if (!cover) {
    return (
      <View style={{ alignItems: "center", backgroundColor: palette.soft, borderRadius: 12, height, justifyContent: "center", width }}>
        <Ionicons name="folder-outline" size={22} color={palette.primary} />
      </View>
    );
  }
  return <Image source={cover.source} resizeMode="cover" style={{ borderRadius: 12, height, width }} />;
}

export function FolderCoverHero({ coverId, coverUri, palette, children }: { coverId?: FolderCoverId | null; coverUri?: string | null; palette: Record<string, string>; children: ReactNode }) {
  const cover = FOLDER_COVERS.find((item) => item.id === coverId);
  return (
    <View style={heroStyles.hero}>
      {coverUri ? <Image source={{ uri: coverUri }} resizeMode="cover" style={heroStyles.image} /> : cover ? <Image source={cover.source} resizeMode="cover" style={heroStyles.image} /> : <View style={[heroStyles.image, { backgroundColor: palette.soft }]} />}
      <View style={heroStyles.tint} />
      <LinearGradient colors={["transparent", palette.background]} locations={[0.32, 1]} style={heroStyles.gradient} />
      <View style={heroStyles.content}>{children}</View>
    </View>
  );
}

export function FolderCoverSelector({ value, selectedUri, onChange, onUpload, palette }: { value: FolderCoverId; selectedUri?: string | null; onChange: (value: FolderCoverId) => void; onUpload?: () => void; palette: Record<string, string> }) {
  const styles = createStyles(palette);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Klasör kapağı</Text>
      <View style={styles.options}>
        {onUpload ? <Pressable onPress={onUpload} style={({ pressed }) => [styles.option, { backgroundColor: selectedUri ? palette.surface : palette.primary, borderColor: selectedUri ? palette.primary : palette.primary }, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: Boolean(selectedUri) }} accessibilityLabel="Telefondan kapak fotoğrafı yükle"><View style={[styles.imageFrame, selectedUri && { borderColor: palette.primary, borderWidth: 2 }]}>{selectedUri ? <Image source={{ uri: selectedUri }} resizeMode="cover" style={styles.image} /> : <View style={styles.uploadIcon}><Ionicons name="cloud-upload-outline" size={23} color={palette.onPrimary} /></View>}{selectedUri ? <View style={styles.check}><Ionicons name="checkmark" size={12} color={palette.onPrimary} /></View> : null}</View><Text numberOfLines={1} style={[styles.label, !selectedUri && styles.uploadLabel]}>{selectedUri ? "Seçili" : "Yükle"}</Text></Pressable> : null}
        {FOLDER_COVERS.map((cover) => {
          const selected = !selectedUri && value === cover.id;
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
  uploadIcon: { alignItems: "center", aspectRatio: 1.42, justifyContent: "center", width: "100%" },
  uploadLabel: { color: palette.onPrimary, fontSize: 9, fontWeight: "800", marginTop: 5, textAlign: "center", width: "100%" },
  check: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 10, height: 18, justifyContent: "center", position: "absolute", right: 4, top: 4, width: 18 },
  label: { color: palette.foreground, fontSize: 9, fontWeight: "700", marginTop: 5, textAlign: "center", width: "100%" },
  pressed: { opacity: 0.76 },
});

const heroStyles = StyleSheet.create({
  hero: { height: 236, overflow: "hidden", position: "relative" },
  image: { height: "100%", left: 0, position: "absolute", top: 0, width: "100%" },
  tint: { backgroundColor: "rgba(0,0,0,0.12)", bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  gradient: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  content: { flex: 1, justifyContent: "space-between", paddingBottom: 21, paddingHorizontal: 18, paddingTop: 16 },
});
