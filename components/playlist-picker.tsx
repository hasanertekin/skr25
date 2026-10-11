import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { FolderCoverPhoto } from "@/components/folder-cover";
import { folderBreadcrumb, libraryItemsInFolder, type Playlist, type PlaylistFolder } from "@/lib/playlists";
import { useThemeContext } from "@/lib/theme-provider";

type Props = {
  visible: boolean;
  playlists: Playlist[];
  folders?: PlaylistFolder[];
  onClose: () => void;
  onSelect: (playlist: Playlist) => void;
  onCreate: (name: string, folderId: string | null) => void;
};

export function PlaylistPicker({ visible, playlists, folders = [], onClose, onSelect, onCreate }: Props) {
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const items = useMemo(() => libraryItemsInFolder(playlists, folders, folderId), [folderId, folders, playlists]);
  const currentFolder = folderId ? folders.find((folder) => folder.id === folderId) : null;

  useEffect(() => {
    if (!visible) {
      setCreateOpen(false);
      setName("");
      setFolderId(null);
    }
  }, [visible]);

  const create = () => {
    const value = name.trim();
    if (!value) return;
    onCreate(value, folderId);
    setName("");
    setCreateOpen(false);
  };

  const goBack = () => {
    if (createOpen) { setCreateOpen(false); return; }
    if (folderId) {
      const parentId = currentFolder?.parentId ?? null;
      setFolderId(parentId);
      return;
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={goBack}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel={folderId ? "Üst klasöre dön" : "Kapat"}>
              <Ionicons name={folderId || createOpen ? "chevron-back" : "close"} size={19} color={palette.foreground} />
            </Pressable>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>{createOpen ? "YENİ PLAYLİST" : "ŞÜKRANI SAKLA"}</Text>
              <Text numberOfLines={1} style={styles.title}>{createOpen ? "Listeyi adlandır" : currentFolder?.name ?? "Hangi listeye ekleyelim?"}</Text>
            </View>
          </View>

          {createOpen ? (
            <View style={styles.createSection}>
              <TextInput
                autoFocus
                value={name}
                onChangeText={setName}
                placeholder="Liste adı"
                placeholderTextColor={palette.muted}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={create}
                accessibilityLabel="Yeni liste adı"
              />
              <Text style={styles.createLocation}>{folderId ? `Konum: ${folderBreadcrumb(folders, folderId)}` : "Konum: Listeler"}</Text>
              <View style={styles.row}>
                <Pressable onPress={() => setCreateOpen(false)} style={styles.cancel} accessibilityRole="button"><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
                <Pressable onPress={create} disabled={!name.trim()} style={[styles.create, !name.trim() && styles.disabled]} accessibilityRole="button" accessibilityState={{ disabled: !name.trim() }}><Text style={styles.createText}>Oluştur</Text></Pressable>
              </View>
            </View>
          ) : (
            <ScrollView style={styles.playlistScroll} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => setCreateOpen(true)} style={styles.newButton} accessibilityRole="button">
                <Ionicons name="add-circle-outline" size={20} color={palette.primary} />
                <Text style={styles.newText}>Yeni liste oluştur</Text>
              </Pressable>
              {items.map((item) => item.kind === "folder" ? (
                <Pressable key={`folder:${item.id}`} onPress={() => setFolderId(item.id)} style={({ pressed }) => [styles.playlist, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${item.folder.name} klasörünü aç`}>
                  <FolderCoverPhoto coverId={item.folder.coverId} size={36} palette={palette} />
                  <View style={styles.rowCopy}><Text numberOfLines={1} style={styles.playlistName}>{item.folder.name}</Text></View>
                  <Ionicons name="chevron-forward" size={18} color={palette.muted} />
                </Pressable>
              ) : (
                <Pressable key={`playlist:${item.id}`} onPress={() => onSelect(item.playlist)} style={({ pressed }) => [styles.playlist, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${item.playlist.name} listesine ekle`}>
                  <View style={styles.icon}><Ionicons name="bookmark-outline" size={16} color={palette.primary} /></View>
                  <View style={styles.rowCopy}><Text numberOfLines={1} style={styles.playlistName}>{item.playlist.name}</Text></View>
                  <Ionicons name="chevron-forward" size={18} color={palette.muted} />
                </Pressable>
              ))}
              {!items.length ? <Text style={styles.empty}>{folderId ? "Bu klasörde henüz içerik yok." : "Henüz liste veya klasör oluşturulmamış."}</Text> : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.48)", flex: 1, justifyContent: "center", padding: 20 },
  modal: { backgroundColor: palette.background, borderColor: palette.border, borderRadius: 24, borderWidth: 1, elevation: 18, maxHeight: "82%", maxWidth: 480, padding: 18, shadowColor: "#000000", shadowOpacity: 0.3, shadowRadius: 20, width: "100%" },
  header: { alignItems: "center", flexDirection: "row", gap: 10, marginBottom: 14 },
  back: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 22, height: 42, justifyContent: "center", width: 42 },
  heading: { alignItems: "center", flex: 1, minWidth: 0 },
  eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, textAlign: "center" },
  title: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 17, marginTop: 3, textAlign: "center" },
  playlistScroll: { flexGrow: 0 },
  listContent: { paddingBottom: 2 },
  createSection: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 16, borderWidth: 1, padding: 12 },
  input: { backgroundColor: palette.background, borderColor: palette.border, borderRadius: 12, borderWidth: 1, color: palette.foreground, fontSize: 15, height: 48, paddingHorizontal: 13 },
  createLocation: { color: palette.muted, fontSize: 11, marginTop: 10 },
  row: { flexDirection: "row", gap: 9, justifyContent: "flex-end", marginTop: 13 },
  cancel: { alignItems: "center", borderColor: palette.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  cancelText: { color: palette.muted, fontWeight: "800" },
  create: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, justifyContent: "center", minHeight: 44, paddingHorizontal: 18 },
  createText: { color: palette.onPrimary, fontWeight: "800" },
  newButton: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 9, marginBottom: 9, minHeight: 46, paddingHorizontal: 13 },
  newText: { color: palette.primary, fontSize: 13, fontWeight: "800" },
  playlist: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 13, borderWidth: 1, flexDirection: "row", gap: 2, marginBottom: 8, minHeight: 52, paddingHorizontal: 10 },
  icon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 16, height: 32, justifyContent: "center", width: 32 },
  rowCopy: { flex: 1, justifyContent: "center", minHeight: 44, minWidth: 0 },
  playlistName: { color: palette.foreground, flexShrink: 1, fontSize: 13, fontWeight: "700", marginHorizontal: 8, textAlignVertical: "center" },
  empty: { color: palette.muted, fontSize: 12, paddingVertical: 16, textAlign: "center" },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
});
