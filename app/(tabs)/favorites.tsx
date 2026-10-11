import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";

import { ScreenContainer } from "@/components/screen-container";
import { FolderCoverPhoto, FolderCoverSelector } from "@/components/folder-cover";
import { AppTopActions } from "@/components/app-top-actions";
import { applyLibraryOrder, createLibraryId, entriesForPlaylist, ensureDefaultPlaylist, FOLDER_COVER_IDS, libraryItemsInFolder, loadPlaylistFolders, savePlaylistFolders, savePlaylists, type FolderCoverId, type LibraryItem, type Playlist, type PlaylistFolder } from "@/lib/playlists";
import { loadGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { usePlayer } from "@/lib/player-context";
import { useThemeContext } from "@/lib/theme-provider";

export default function FavoritesScreen() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [folders, setFolders] = useState<PlaylistFolder[]>([]);
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderCoverId, setFolderCoverId] = useState<FolderCoverId>(FOLDER_COVER_IDS[0]);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const operationLock = useRef(false);
  const originalOrder = useRef<LibraryItem[]>([]);
  const router = useRouter();
  const navigation = useNavigation();
  const { playEntries, stop, isPlaying, entries: playingEntries, sourceLabel } = usePlayer();
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const libraryItems = useMemo(() => libraryItemsInFolder(playlists, folders, null), [playlists, folders]);
  const orderDirty = libraryItems.length !== originalOrder.current.length || libraryItems.some((item, index) => item.kind !== originalOrder.current[index]?.kind || item.id !== originalOrder.current[index]?.id);

  const refresh = useCallback(async () => {
    const [loadedPlaylists, loadedEntries, loadedFolders] = await Promise.all([ensureDefaultPlaylist(), loadGratitudeEntries(), loadPlaylistFolders()]);
    const validFolderIds = new Set(loadedFolders.map((folder) => folder.id));
    const safePlaylists = loadedPlaylists.map((playlist) => playlist.folderId && !validFolderIds.has(playlist.folderId) ? { ...playlist, folderId: null } : playlist);
    if (safePlaylists.some((playlist, index) => playlist !== loadedPlaylists[index])) await savePlaylists(safePlaylists);
    setPlaylists(safePlaylists);
    setEntries(loadedEntries);
    setFolders(loadedFolders);
    originalOrder.current = libraryItemsInFolder(safePlaylists, loadedFolders, null);
    setReorderMode(false);
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const create = async () => {
    const value = name.trim();
    if (!value || savingItem || operationLock.current) return;
    operationLock.current = true;
    setSavingItem(true);
    try {
      const currentItems = libraryItemsInFolder(playlists, folders, null);
      const ordered = applyLibraryOrder(currentItems, playlists, folders, null);
      const created: Playlist = { id: createLibraryId("playlist"), name: value, entryIds: [], createdAt: new Date().toISOString(), folderId: null, sortOrder: currentItems.length };
      const nextPlaylists = [...ordered.playlists, created];
      await Promise.all([savePlaylists(nextPlaylists), savePlaylistFolders(ordered.folders)]);
      setPlaylists(nextPlaylists);
      setFolders(ordered.folders);
      setName("");
      setCreateOpen(false);
    } catch {
      Alert.alert("Liste oluşturulamadı", "Değişikliklerin kaydedilemedi. Yeniden deneyebilirsin.");
    } finally {
      operationLock.current = false;
      setSavingItem(false);
    }
  };

  const createFolder = async () => {
    const value = folderDraft.trim();
    if (!value || savingItem || operationLock.current) return;
    if (folders.some((folder) => (folder.parentId ?? null) === null && folder.name.trim().toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"))) {
      Alert.alert("Bu klasör zaten var", "Aynı düzeyde farklı bir klasör adı seç.");
      return;
    }
    operationLock.current = true;
    setSavingItem(true);
    try {
      const currentItems = libraryItemsInFolder(playlists, folders, null);
      const ordered = applyLibraryOrder(currentItems, playlists, folders, null);
      const created: PlaylistFolder = { id: createLibraryId("folder"), name: value, createdAt: new Date().toISOString(), coverId: folderCoverId, parentId: null, sortOrder: currentItems.length };
      const nextFolders = [...ordered.folders, created];
      await Promise.all([savePlaylists(ordered.playlists), savePlaylistFolders(nextFolders)]);
      setPlaylists(ordered.playlists);
      setFolders(nextFolders);
      setFolderDraft("");
      setFolderModalOpen(false);
    } catch {
      Alert.alert("Klasör oluşturulamadı", "Değişikliklerin kaydedilemedi. Yeniden deneyebilirsin.");
    } finally {
      operationLock.current = false;
      setSavingItem(false);
    }
  };

  const startReorder = () => {
    originalOrder.current = libraryItems;
    setReorderMode(true);
  };

  const discardReorder = () => {
    const restored = applyLibraryOrder(originalOrder.current, playlists, folders, null);
    setPlaylists(restored.playlists);
    setFolders(restored.folders);
    setReorderMode(false);
  };

  const cancelReorder = () => {
    if (!orderDirty) { discardReorder(); return; }
    Alert.alert("Sıralama kaydedilsin mi?", "Yaptığın değişiklikler henüz kaydedilmedi.", [
      { text: "Ekranda kal", style: "cancel" },
      { text: "Değişiklikleri at", style: "destructive", onPress: discardReorder },
      { text: "Kaydet", onPress: () => { void saveOrder(); } },
    ]);
  };

  usePreventRemove(reorderMode && orderDirty, ({ data }) => {
    Alert.alert("Sıralama kaydedilmedi", "Çıkmadan önce sıralama değişikliğini kaydetmek ister misin?", [
      { text: "Ekranda kal", style: "cancel" },
      { text: "Değişiklikleri at", style: "destructive", onPress: () => { discardReorder(); setTimeout(() => navigation.dispatch(data.action), 50); } },
      { text: "Kaydet", onPress: () => { void (async () => { if (await saveOrder()) setTimeout(() => navigation.dispatch(data.action), 50); })(); } },
    ]);
  });

  const saveOrder = async (): Promise<boolean> => {
    if (savingOrder) return false;
    setSavingOrder(true);
    try {
      await Promise.all([savePlaylists(playlists), savePlaylistFolders(folders)]);
      originalOrder.current = libraryItems;
      setReorderMode(false);
      return true;
    } catch {
      Alert.alert("Sıralama kaydedilemedi", "Önceki sıralama korunuyor. Yeniden deneyebilirsin.");
      const restored = applyLibraryOrder(originalOrder.current, playlists, folders, null);
      setPlaylists(restored.playlists);
      setFolders(restored.folders);
      setReorderMode(false);
      return false;
    } finally {
      setSavingOrder(false);
    }
  };

  const playlistIsPlaying = (playlist: Playlist, playlistEntries: GratitudeEntry[]) =>
    isPlaying && sourceLabel === playlist.name && playingEntries.length === playlistEntries.length && playingEntries.every((entry, index) => entry.id === playlistEntries[index]?.id);

  const renderItem = ({ item, drag, isActive }: RenderItemParams<LibraryItem>) => {
    const row = item.kind === "folder" ? (
      <View style={[styles.folderCard, isActive && styles.rowActive]}>
        <Pressable
          onPress={() => { if (!reorderMode) router.push({ pathname: "/folder/[id]", params: { id: item.folder.id } } as unknown as Href); }}
          onLongPress={reorderMode ? drag : undefined}
          delayLongPress={250}
          style={({ pressed }) => [styles.itemInfo, pressed && !isActive && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={reorderMode ? `${item.folder.name} klasörü, taşımak için basılı tut` : `${item.folder.name} klasörünü aç`}
        >
          <FolderCoverPhoto coverId={item.folder.coverId} size={38} palette={palette} />
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.itemName}>{item.folder.name}</Text>
            <Text style={styles.meta}>{libraryItemsInFolder(playlists, folders, item.folder.id).length} öğe · klasör</Text>
          </View>
        </Pressable>
        {reorderMode ? <View style={styles.dragHint}><Ionicons name="hand-left-outline" size={18} color={palette.muted} /></View> : null}
      </View>
    ) : (() => {
      const playlist = item.playlist;
      const playlistEntries = entriesForPlaylist(entries, playlist);
      const active = playlistIsPlaying(playlist, playlistEntries);
      return (
        <View style={[styles.playlist, active && styles.playlistActive, isActive && styles.rowActive]}>
          <Pressable
            onPress={() => { if (!reorderMode) router.push(`/playlist/${playlist.id}`); }}
            onLongPress={reorderMode ? drag : undefined}
            delayLongPress={250}
            style={({ pressed }) => [styles.itemInfo, pressed && !isActive && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={reorderMode ? `${playlist.name}, taşımak için basılı tut` : `${playlist.name}, ${playlistEntries.length} kayıt`}
          >
          <View style={styles.itemIcon}><Ionicons name={reorderMode ? "reorder-three-outline" : "bookmark-outline"} size={19} color={palette.primary} /></View>
            <View style={styles.copy}>
              <Text numberOfLines={1} style={styles.itemName}>{playlist.name}</Text>
              <Text style={styles.meta}>{active ? "Şimdi çalıyor" : `${playlistEntries.length} not`}</Text>
            </View>
          </Pressable>
          {reorderMode ? <View style={styles.dragHint}><Ionicons name="hand-left-outline" size={18} color={palette.muted} /></View> : (
            <Pressable
              onPress={() => active ? stop() : playEntries(playlistEntries, 0, playlist.atmosphereUri ?? undefined, playlist.name, playlist.voiceIdentifier ?? undefined, playlist.speechRate)}
              disabled={!active && !playlistEntries.length}
              style={({ pressed }) => [styles.playButton, !active && !playlistEntries.length && styles.disabled, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={active ? `${playlist.name} dinlemesini durdur` : `${playlist.name} listesini dinle`}
              accessibilityState={{ disabled: !active && !playlistEntries.length }}
              hitSlop={4}
            ><Ionicons name={active ? "stop" : "play"} size={active ? 15 : 16} color={palette.onPrimary} /></Pressable>
          )}
        </View>
      );
    })();
    return <ScaleDecorator activeScale={1.02}>{row}</ScaleDecorator>;
  };

  const listHeader = (
    <View>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>KÜTÜPHANEN</Text><Text style={styles.title}>Listeler</Text></View>
        <AppTopActions />
      </View>
      <Text style={styles.intro}>Listelerini ve klasörlerini kendi düzenine göre bir arada tut.</Text>
      <View style={styles.sectionHeader}><Text style={styles.section}>Koleksiyonların</Text><Text style={styles.count}>{libraryItems.length}</Text></View>
      {reorderMode ? (
        <View style={[styles.sectionActions, styles.reorderActions]}>
          <Pressable onPress={cancelReorder} disabled={savingOrder} style={styles.cancelButton}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
          <Pressable onPress={() => void saveOrder()} disabled={savingOrder} style={[styles.saveButton, savingOrder && styles.disabled]}><Ionicons name={savingOrder ? "hourglass-outline" : "checkmark"} size={16} color={palette.onPrimary} /><Text style={styles.saveText}>{savingOrder ? "Kaydediliyor" : "Sıralamayı kaydet"}</Text></Pressable>
        </View>
      ) : (
        <View style={styles.sectionActions}>
          <View style={styles.createActions}>
            <Pressable onPress={() => { setName(""); setCreateOpen(true); }} style={({ pressed }) => [styles.actionButton, styles.createButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Yeni liste"><Ionicons name="add" size={17} color={palette.onPrimary} /><Text style={styles.createText}>Yeni liste</Text></Pressable>
            <Pressable onPress={() => { setFolderDraft(""); setFolderCoverId(FOLDER_COVER_IDS[0]); setFolderModalOpen(true); }} style={({ pressed }) => [styles.actionButton, styles.folderCreateButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Yeni klasör"><Ionicons name="folder-outline" size={17} color={palette.primary} /><Text style={styles.folderCreateText}>Yeni klasör</Text></Pressable>
          </View>
          <Pressable onPress={startReorder} disabled={libraryItems.length < 2} style={({ pressed }) => [styles.reorderButton, libraryItems.length < 2 && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Sıralamayı değiştir"><Ionicons name="reorder-three-outline" size={18} color={palette.primary} /><Text style={styles.editText}>Sıralamayı değiştir</Text></Pressable>
        </View>
      )}
      {reorderMode ? <Text style={styles.reorderHint}>Playlist ve klasörleri basılı tutup sürükleyerek birlikte sırala.</Text> : null}
    </View>
  );

  return (
    <ScreenContainer>
      <DraggableFlatList
        data={libraryItems}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        renderItem={renderItem}
        onDragEnd={({ data }) => {
          const ordered = applyLibraryOrder(data, playlists, folders, null);
          setPlaylists(ordered.playlists);
          setFolders(ordered.folders);
        }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name="albums-outline" size={24} color={palette.primary} /></View>
            <Text style={styles.emptyTitle}>Koleksiyonların burada başlayacak</Text>
            <Text style={styles.emptyText}>Bir liste oluştur veya klasör ekle; hepsini daha sonra dilediğin gibi düzenleyebilirsin.</Text>
          </View>
        )}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        activationDistance={reorderMode ? 0 : 1000}
        scrollEnabled={!savingOrder}
        removeClippedSubviews={false}
      />

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} accessibilityLabel="Pencereyi kapat" />
          <View style={styles.modal}>
            <Text style={styles.modalEyebrow}>YENİ LİSTE</Text>
            <Text style={styles.modalTitle}>Nasıl adlandırmak istersin?</Text>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder="Örn. Küçük mutluluklar" placeholderTextColor={palette.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void create()} maxLength={40} accessibilityLabel="Liste adı" />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={() => void create()} disabled={!name.trim() || savingItem} style={({ pressed }) => [styles.saveButton, (!name.trim() || savingItem) && styles.disabled, pressed && styles.pressed]}><Text style={styles.saveText}>{savingItem ? "Kaydediliyor" : "Oluştur"}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={folderModalOpen} transparent animationType="fade" onRequestClose={() => setFolderModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFolderModalOpen(false)} accessibilityLabel="Pencereyi kapat" />
          <View style={styles.modal}>
            <Text style={styles.modalEyebrow}>YENİ KLASÖR</Text>
            <Text style={styles.modalTitle}>Playlistlerini bir arada tut</Text>
            <TextInput autoFocus value={folderDraft} onChangeText={setFolderDraft} placeholder="Örn. Akşam dinlemeleri" placeholderTextColor={palette.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void createFolder()} maxLength={40} accessibilityLabel="Klasör adı" />
            <FolderCoverSelector value={folderCoverId} onChange={setFolderCoverId} palette={palette} />
            <Text style={styles.modalHint}>Klasörlerin içine alt klasörler ve playlistler ekleyebilirsin.</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setFolderModalOpen(false)} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={() => void createFolder()} disabled={!folderDraft.trim() || savingItem} style={({ pressed }) => [styles.saveButton, (!folderDraft.trim() || savingItem) && styles.disabled, pressed && styles.pressed]}><Text style={styles.saveText}>{savingItem ? "Kaydediliyor" : "Oluştur"}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 40, paddingHorizontal: 22, paddingTop: 20 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 30, marginTop: 4 },
  intro: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between", marginTop: 27 },
  section: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19 },
  count: { backgroundColor: palette.soft, borderRadius: 10, color: palette.primary, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: 7, paddingVertical: 4 },
  sectionActions: { alignItems: "stretch", marginTop: 9 },
  reorderActions: { flexDirection: "row", gap: 8 },
  createActions: { flexDirection: "row", gap: 8 },
  actionButton: { alignItems: "center", borderRadius: 12, flex: 1, flexDirection: "row", gap: 3, justifyContent: "center", minHeight: 46, paddingHorizontal: 5 },
  createButton: { backgroundColor: palette.primary },
  createText: { color: palette.onPrimary, fontSize: 11, fontWeight: "800", textAlign: "center" },
  folderCreateButton: { backgroundColor: palette.soft, borderColor: palette.border, borderWidth: 1 },
  folderCreateText: { color: palette.primary, fontSize: 11, fontWeight: "800", textAlign: "center" },
  editButton: { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 },
  reorderButton: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 7, minHeight: 44, paddingHorizontal: 12, width: "100%" },
  editText: { color: palette.primary, fontSize: 12, fontWeight: "800", textAlign: "center" },
  reorderHint: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  folderCard: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 15, borderWidth: 1, flexDirection: "row", marginTop: 9, minHeight: 70, paddingHorizontal: 9 },
  playlist: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 16, borderWidth: 1, flexDirection: "row", marginTop: 9, minHeight: 70, paddingHorizontal: 9 },
  playlistActive: { borderColor: palette.primary, elevation: 4, shadowColor: palette.foreground, shadowOpacity: 0.12, shadowRadius: 8 },
  rowActive: { borderColor: palette.primary, elevation: 4, shadowColor: palette.foreground, shadowOpacity: 0.12, shadowRadius: 8 },
  itemInfo: { alignItems: "center", flex: 1, flexDirection: "row", minHeight: 60, minWidth: 0, paddingLeft: 2 },
  itemIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 17, height: 38, justifyContent: "center", width: 38 },
  itemEmoji: { fontSize: 21 },
  copy: { flex: 1, marginHorizontal: 10, minWidth: 0 },
  itemName: { color: palette.foreground, fontSize: 14, fontWeight: "800" },
  meta: { color: palette.muted, fontSize: 12, marginTop: 4 },
  playButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  dragHint: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  emptyState: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 20, borderWidth: 1, marginTop: 13, paddingHorizontal: 22, paddingVertical: 28 },
  emptyIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 22, height: 48, justifyContent: "center", width: 48 },
  emptyTitle: { color: palette.foreground, fontSize: 15, fontWeight: "800", marginTop: 12 },
  emptyText: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 6, textAlign: "center" },
  backdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.48)", flex: 1, justifyContent: "center", padding: 22 },
  modal: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 22, borderWidth: 1, elevation: 18, padding: 21, shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 18, width: "100%" },
  modalEyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  modalTitle: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19, marginTop: 5 },
  modalHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  input: { backgroundColor: palette.background, borderColor: palette.border, borderRadius: 12, borderWidth: 1, color: palette.foreground, fontSize: 14, height: 50, marginTop: 17, paddingHorizontal: 12 },
  modalActions: { flexDirection: "row", gap: 9, justifyContent: "flex-end", marginTop: 17 },
  cancelButton: { alignItems: "center", borderColor: palette.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  cancelText: { color: palette.muted, fontSize: 13, fontWeight: "700" },
  saveButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 44, paddingHorizontal: 17 },
  saveText: { color: palette.onPrimary, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.75 },
});
