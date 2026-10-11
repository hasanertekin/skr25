import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { SortOrderModal, type SortOrderItem } from "@/components/sort-order-modal";

import { ScreenContainer } from "@/components/screen-container";
import { FolderCoverPhoto, FolderCoverSelector } from "@/components/folder-cover";
import { applyLibraryOrder, createLibraryId, deleteFolderAndReparent, entriesForPlaylist, ensureDefaultPlaylist, FOLDER_COVER_IDS, folderBreadcrumb, libraryItemsInFolder, loadPlaylistFolders, savePlaylistFolders, savePlaylists, type FolderCoverId, type LibraryItem, type Playlist, type PlaylistFolder } from "@/lib/playlists";
import { loadGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { usePlayer } from "@/lib/player-context";
import { useThemeContext } from "@/lib/theme-provider";

export default function PlaylistFolderScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const folderId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";
  const router = useRouter();
  const navigation = useNavigation();
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { playEntries, stop, isPlaying, entries: playingEntries, sourceLabel } = usePlayer();
  const [folders, setFolders] = useState<PlaylistFolder[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [createFolderCoverId, setCreateFolderCoverId] = useState<FolderCoverId>(FOLDER_COVER_IDS[0]);
  const [folderCoverDraft, setFolderCoverDraft] = useState<FolderCoverId>(FOLDER_COVER_IDS[0]);
  const [reorderMode, setReorderMode] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [folderLoading, setFolderLoading] = useState(true);
  const [folderLoadError, setFolderLoadError] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const operationLock = useRef(false);
  const originalOrder = useRef<LibraryItem[]>([]);

  const refresh = useCallback(async () => {
    setFolderLoading(true);
    setFolderLoadError(false);
    try {
      const [nextFolders, nextPlaylists, nextEntries] = await Promise.all([loadPlaylistFolders(), ensureDefaultPlaylist(), loadGratitudeEntries()]);
      const validFolderIds = new Set(nextFolders.map((folder) => folder.id));
      const safePlaylists = nextPlaylists.map((playlist) => playlist.folderId && !validFolderIds.has(playlist.folderId) ? { ...playlist, folderId: null } : playlist);
      if (safePlaylists.some((playlist, index) => playlist !== nextPlaylists[index])) await savePlaylists(safePlaylists);
      setFolders(nextFolders);
      setPlaylists(safePlaylists);
      setEntries(nextEntries);
      originalOrder.current = libraryItemsInFolder(safePlaylists, nextFolders, folderId);
      setReorderMode(false);
    } catch {
      setFolderLoadError(true);
    } finally {
      setFolderLoading(false);
    }
  }, [folderId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const folder = folders.find((item) => item.id === folderId);
  const libraryItems = useMemo(() => libraryItemsInFolder(playlists, folders, folderId), [playlists, folders, folderId]);
  const folderEntries = useMemo(() => {
    const playlistIds: string[] = [];
    const visited = new Set<string>();
    const collect = (parentId: string) => {
      if (visited.has(parentId)) return;
      visited.add(parentId);
      for (const item of libraryItemsInFolder(playlists, folders, parentId)) {
        if (item.kind === "playlist") playlistIds.push(item.playlist.id);
        else collect(item.folder.id);
      }
    };
    collect(folderId);
    const seenEntryIds = new Set<string>();
    const result: GratitudeEntry[] = [];
    for (const playlistId of playlistIds) {
      const playlist = playlists.find((item) => item.id === playlistId);
      if (!playlist) continue;
      for (const entry of entriesForPlaylist(entries, playlist)) {
        if (seenEntryIds.has(entry.id)) continue;
        seenEntryIds.add(entry.id);
        result.push(entry);
      }
    }
    return result;
  }, [entries, folderId, folders, playlists]);
  const folderSourceLabel = `Klasör · ${folderBreadcrumb(folders, folderId)}`;
  const isFolderPlaying = isPlaying && sourceLabel === folderSourceLabel;
  const hasUnsavedOrder = reorderMode && (libraryItems.length !== originalOrder.current.length || libraryItems.some((item, index) => item.kind !== originalOrder.current[index]?.kind || item.id !== originalOrder.current[index]?.id));

  const createPlaylist = async () => {
    const value = name.trim();
    if (!value || !folder || savingItem || operationLock.current) return;
    operationLock.current = true;
    setSavingItem(true);
    try {
      const currentItems = libraryItemsInFolder(playlists, folders, folderId);
      const ordered = applyLibraryOrder(currentItems, playlists, folders, folderId);
      const created: Playlist = { id: createLibraryId("playlist"), name: value, entryIds: [], createdAt: new Date().toISOString(), folderId, sortOrder: currentItems.length };
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
    const value = newFolderName.trim();
    if (!value || !folder || savingItem || operationLock.current) return;
    if (folders.some((item) => (item.parentId ?? null) === folderId && item.name.trim().toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"))) {
      Alert.alert("Bu klasör zaten var", "Aynı düzeyde farklı bir klasör adı seç.");
      return;
    }
    operationLock.current = true;
    setSavingItem(true);
    try {
      const currentItems = libraryItemsInFolder(playlists, folders, folderId);
      const ordered = applyLibraryOrder(currentItems, playlists, folders, folderId);
      const created: PlaylistFolder = { id: createLibraryId("folder"), name: value, createdAt: new Date().toISOString(), coverId: createFolderCoverId, parentId: folderId, sortOrder: currentItems.length };
      const nextFolders = [...ordered.folders, created];
      await Promise.all([savePlaylists(ordered.playlists), savePlaylistFolders(nextFolders)]);
      setPlaylists(ordered.playlists);
      setFolders(nextFolders);
      setNewFolderName("");
      setCreateFolderOpen(false);
    } catch {
      Alert.alert("Alt klasör oluşturulamadı", "Değişikliklerin kaydedilemedi. Yeniden deneyebilirsin.");
    } finally {
      operationLock.current = false;
      setSavingItem(false);
    }
  };

  const startReorder = () => setSortOpen(true);
  const sortItems: SortOrderItem[] = libraryItems.map((item) => item.kind === "folder"
    ? { id: `folder:${item.folder.id}`, title: item.folder.name, subtitle: "Alt klasör", icon: "folder-outline" }
    : { id: `playlist:${item.playlist.id}`, title: item.playlist.name, subtitle: `${entriesForPlaylist(entries, item.playlist).length} not`, icon: "bookmark-outline" });
  const saveSort = async (ids: string[]) => {
    const byId = new Map(libraryItems.map((item) => [`${item.kind}:${item.id}`, item]));
    const ordered = ids.map((id) => byId.get(id)).filter((item): item is LibraryItem => Boolean(item));
    const next = applyLibraryOrder(ordered, playlists, folders, folderId);
    await Promise.all([savePlaylists(next.playlists), savePlaylistFolders(next.folders)]);
    setPlaylists(next.playlists); setFolders(next.folders); setSortOpen(false);
  };

  const discardOrder = () => {
    const restored = applyLibraryOrder(originalOrder.current, playlists, folders, folderId);
    setPlaylists(restored.playlists);
    setFolders(restored.folders);
    setReorderMode(false);
  };

  const cancelReorder = () => {
    if (!hasUnsavedOrder) { discardOrder(); return; }
    Alert.alert("Sıralama kaydedilsin mi?", "Yaptığın değişiklikler henüz kaydedilmedi.", [
      { text: "Ekranda kal", style: "cancel" },
      { text: "Değişiklikleri at", style: "destructive", onPress: discardOrder },
      { text: "Kaydet", onPress: () => { void saveOrder(); } },
    ]);
  };

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
      const restored = applyLibraryOrder(originalOrder.current, playlists, folders, folderId);
      setPlaylists(restored.playlists);
      setFolders(restored.folders);
      setReorderMode(false);
      return false;
    } finally {
      setSavingOrder(false);
    }
  };

  usePreventRemove(hasUnsavedOrder, ({ data }) => {
    Alert.alert("Sıralama kaydedilsin mi?", "Bu klasörden çıkarsan kaydedilmemiş sıralama değişiklikleri kaybolur.", [
      { text: "Ekranda kal", style: "cancel" },
      { text: "Değişiklikleri at", style: "destructive", onPress: () => {
        discardOrder();
        setTimeout(() => navigation.dispatch(data.action), 50);
      } },
      { text: "Kaydet", onPress: () => { void (async () => {
        if (await saveOrder()) setTimeout(() => navigation.dispatch(data.action), 50);
      })(); } },
    ]);
  });

  const renameFolder = () => {
    if (!folder) return;
    setFolderNameDraft(folder.name);
    setFolderCoverDraft(folder.coverId ?? FOLDER_COVER_IDS[0]);
    setRenameOpen(true);
  };

  const saveFolderName = async () => {
    const nextName = folderNameDraft.trim();
    if (!folder || !nextName) return;
    if (folders.some((item) => item.id !== folderId && (item.parentId ?? null) === (folder.parentId ?? null) && item.name.trim().toLocaleLowerCase("tr-TR") === nextName.toLocaleLowerCase("tr-TR"))) {
      Alert.alert("Bu klasör zaten var", "Aynı düzeyde farklı bir klasör adı seç.");
      return;
    }
    const nextFolders = folders.map((item) => item.id === folderId ? { ...item, name: nextName, coverId: folderCoverDraft } : item);
    try {
      await savePlaylistFolders(nextFolders);
      setFolders(nextFolders);
      setRenameOpen(false);
    } catch {
      Alert.alert("Klasör adı kaydedilemedi", "Biraz sonra yeniden deneyebilirsin.");
    }
  };

  const deleteFolder = () => {
    if (!folder) return;
    const parent = folder.parentId ? folders.find((item) => item.id === folder.parentId) : undefined;
    const destination = parent ? `“${parent.name}” klasörüne` : "Listeler köküne";
    Alert.alert("Klasör silinsin mi?", `İçindeki playlistler ve alt klasörler silinmez; ${destination} taşınır.`, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Klasörü sil", style: "destructive", onPress: () => { void (async () => {
        try {
          const [latestFolders, latestPlaylists] = await Promise.all([loadPlaylistFolders(), ensureDefaultPlaylist()]);
          const updated = deleteFolderAndReparent(folderId, latestPlaylists, latestFolders);
          await Promise.all([savePlaylists(updated.playlists), savePlaylistFolders(updated.folders)]);
          router.back();
        } catch {
          Alert.alert("Klasör silinemedi", "İçindeki playlistler ve klasörler korunuyor. Biraz sonra yeniden deneyebilirsin.");
        }
      })(); } },
    ]);
  };

  const playlistIsPlaying = (playlist: Playlist, playlistEntries: GratitudeEntry[]) =>
    isPlaying && sourceLabel === playlist.name && playingEntries.length === playlistEntries.length && playingEntries.every((entry, index) => entry.id === playlistEntries[index]?.id);

  const renderLibraryRow = (item: LibraryItem, drag?: () => void, isActive = false) => {
    if (item.kind === "folder") {
      return (
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
              <Text style={styles.meta}>{libraryItemsInFolder(playlists, folders, item.folder.id).length} öğe · alt klasör</Text>
            </View>
          </Pressable>
          {reorderMode ? <View style={styles.dragHint}><Ionicons name="hand-left-outline" size={18} color={palette.muted} /></View> : null}
        </View>
      );
    }
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
          accessibilityLabel={reorderMode ? `${playlist.name}, taşımak için basılı tut` : `${playlist.name}, ${playlistEntries.length} not`}
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
          ><Ionicons name={active ? "stop" : "play"} size={active ? 15 : 16} color={palette.onPrimary} /></Pressable>
        )}
      </View>
    );
  };

  const renderDraggableItem = ({ item, drag, isActive }: RenderItemParams<LibraryItem>) => (
    <ScaleDecorator activeScale={1.02}>{renderLibraryRow(item, drag, isActive)}</ScaleDecorator>
  );

  if (!folder) {
    return (
      <ScreenContainer>
        <View style={styles.missing}>
          <Ionicons name={folderLoading ? "hourglass-outline" : folderLoadError ? "cloud-offline-outline" : "folder-open-outline"} size={30} color={palette.primary} />
          <Text style={styles.title}>{folderLoading ? "Klasör yükleniyor…" : folderLoadError ? "Klasör açılamadı" : "Klasör bulunamadı"}</Text>
          <Text style={styles.emptyText}>{folderLoadError ? "Klasör ve playlist verileri okunamadı. İçeriği yeniden yüklemeyi deneyebilirsin." : "Klasör artık mevcut olmayabilir veya başka bir konuma taşınmış olabilir."}</Text>
          {!folderLoading ? <Pressable onPress={() => void refresh()} style={styles.back}><Text style={styles.backText}>Yeniden yükle</Text></Pressable> : null}
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>Geri dön</Text></Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const listHeader = (
    <View>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backIcon} accessibilityRole="button" accessibilityLabel="Üst klasöre dön"><Ionicons name="chevron-back" size={22} color={palette.foreground} /></Pressable>
        <FolderCoverPhoto coverId={folder.coverId} size={42} palette={palette} />
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.eyebrow}>{folderBreadcrumb(folders, folderId)}</Text>
          <Text numberOfLines={1} style={styles.title}>{folder.name}</Text>
        </View>
        <Pressable onPress={renameFolder} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="Klasör adını ve kapağını düzenle"><Ionicons name="pencil-outline" size={18} color={palette.primary} /></Pressable>
        <Pressable onPress={deleteFolder} style={styles.headerAction} accessibilityRole="button" accessibilityLabel="Klasörü sil"><Ionicons name="trash-outline" size={18} color={palette.error} /></Pressable>
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.section}>İçerik</Text>
        <Text style={styles.count}>{libraryItems.length}</Text>
        <Pressable
          onPress={() => isFolderPlaying ? stop() : playEntries(folderEntries.filter((entry) => entry.text.trim()), 0, undefined, folderSourceLabel)}
          disabled={!folderEntries.some((entry) => entry.text.trim()) || reorderMode}
          style={({ pressed }) => [styles.folderPlayButton, (!folderEntries.some((entry) => entry.text.trim()) || reorderMode) && styles.disabled, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={isFolderPlaying ? "Klasördeki notları durdur" : "Klasördeki tüm notları dinle"}
          accessibilityState={{ disabled: !folderEntries.length || reorderMode }}
        >
          <Ionicons name={isFolderPlaying ? "stop" : "play"} size={14} color={palette.onPrimary} />
          <Text style={styles.folderPlayText}>{isFolderPlaying ? "Durdur" : "Tümünü Dinle"}</Text>
        </Pressable>
      </View>
      {reorderMode ? (
        <View style={styles.actions}>
          <Pressable onPress={cancelReorder} disabled={savingOrder} style={styles.cancelButton}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
          <Pressable onPress={() => void saveOrder()} disabled={savingOrder} style={[styles.saveButton, savingOrder && styles.disabled]}><Ionicons name={savingOrder ? "hourglass-outline" : "checkmark"} size={16} color={palette.onPrimary} /><Text style={styles.saveText}>{savingOrder ? "Kaydediliyor" : "Sıralamayı kaydet"}</Text></Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <View style={styles.createActions}>
            <Pressable onPress={() => { setName(""); setCreateOpen(true); }} style={[styles.actionButton, styles.createButton]} accessibilityRole="button" accessibilityLabel="Yeni liste"><Ionicons name="add" size={17} color={palette.onPrimary} /><Text style={styles.createText}>Yeni liste</Text></Pressable>
            <Pressable onPress={() => { setNewFolderName(""); setCreateFolderCoverId(FOLDER_COVER_IDS[0]); setCreateFolderOpen(true); }} style={[styles.actionButton, styles.folderCreateButton]} accessibilityRole="button" accessibilityLabel="Yeni alt klasör"><Ionicons name="folder-outline" size={17} color={palette.primary} /><Text style={styles.folderCreateText}>Yeni klasör</Text></Pressable>
          </View>
          <Pressable onPress={startReorder} disabled={libraryItems.length < 2} style={[styles.reorderButton, libraryItems.length < 2 && styles.disabled]} accessibilityRole="button" accessibilityLabel="Sıralamayı değiştir"><Ionicons name="reorder-three-outline" size={18} color={palette.primary} /><Text style={styles.reorderText}>Sıralamayı değiştir</Text></Pressable>
        </View>
      )}
      {reorderMode ? <Text style={styles.hint}>Playlist ve alt klasörleri basılı tutup sürükleyerek birlikte sırala.</Text> : null}
    </View>
  );

  return (
    <ScreenContainer>
      <SortOrderModal visible={sortOpen} title="Klasör içeriğinin sırası" description="Alt klasör ve playlistleri yukarı ve aşağı oklarla düzenle." items={sortItems} onClose={() => setSortOpen(false)} onSave={(ids) => { void saveSort(ids); }} palette={palette} />
      <View style={styles.screen}>
        <DraggableFlatList
          style={styles.list}
          data={libraryItems}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          renderItem={renderDraggableItem}
          onDragEnd={({ data }) => {
            if (!reorderMode) return;
            const ordered = applyLibraryOrder(data, playlists, folders, folderId);
            setPlaylists(ordered.playlists);
            setFolders(ordered.folders);
          }}
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          activationDistance={reorderMode ? 0 : 1000}
          scrollEnabled={!savingOrder}
          removeClippedSubviews={false}
          ListEmptyComponent={<EmptyFolder palette={palette} styles={styles} />}
        />
      </View>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} accessibilityLabel="Pencereyi kapat" />
          <View style={styles.modal}>
            <Text style={styles.eyebrow}>YENİ PLAYLIST</Text>
            <Text style={styles.modalTitle}>Bu klasörde yeni bir liste oluştur</Text>
            <TextInput autoFocus value={name} onChangeText={setName} placeholder="Örn. Küçük mutluluklar" placeholderTextColor={palette.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void createPlaylist()} maxLength={40} accessibilityLabel="Playlist adı" />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={() => void createPlaylist()} disabled={!name.trim() || savingItem} style={[styles.saveButton, (!name.trim() || savingItem) && styles.disabled]}><Text style={styles.saveText}>{savingItem ? "Kaydediliyor" : "Oluştur"}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={createFolderOpen} transparent animationType="fade" onRequestClose={() => setCreateFolderOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateFolderOpen(false)} accessibilityLabel="Pencereyi kapat" />
          <View style={styles.modal}>
            <Text style={styles.eyebrow}>YENİ ALT KLASÖR</Text>
            <Text style={styles.modalTitle}>Bu klasörün içinde bir klasör oluştur</Text>
            <TextInput autoFocus value={newFolderName} onChangeText={setNewFolderName} placeholder="Örn. Sabah dinlemeleri" placeholderTextColor={palette.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void createFolder()} maxLength={40} accessibilityLabel="Alt klasör adı" />
            <FolderCoverSelector value={createFolderCoverId} onChange={setCreateFolderCoverId} palette={palette} />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateFolderOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={() => void createFolder()} disabled={!newFolderName.trim() || savingItem} style={[styles.saveButton, (!newFolderName.trim() || savingItem) && styles.disabled]}><Text style={styles.saveText}>{savingItem ? "Kaydediliyor" : "Oluştur"}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameOpen(false)} accessibilityLabel="Pencereyi kapat" />
          <View style={styles.modal}>
            <Text style={styles.eyebrow}>KLASÖRÜ DÜZENLE</Text>
            <Text style={styles.modalTitle}>Klasör adını değiştir</Text>
            <TextInput autoFocus value={folderNameDraft} onChangeText={setFolderNameDraft} placeholder="Klasör adı" placeholderTextColor={palette.muted} style={styles.input} returnKeyType="done" onSubmitEditing={() => void saveFolderName()} maxLength={40} accessibilityLabel="Klasör adı" />
            <FolderCoverSelector value={folderCoverDraft} onChange={setFolderCoverDraft} palette={palette} />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setRenameOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={() => void saveFolderName()} disabled={!folderNameDraft.trim()} style={[styles.saveButton, !folderNameDraft.trim() && styles.disabled]}><Text style={styles.saveText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

function EmptyFolder({ palette, styles }: { palette: Record<string, string>; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name="folder-open-outline" size={22} color={palette.primary} /></View>
      <Text style={styles.emptyTitle}>Bu klasör henüz boş</Text>
      <Text style={styles.emptyText}>Buraya playlist veya başka klasör ekleyebilirsin. Notlar playlistlerin içinde kalır.</Text>
    </View>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  screen: { flex: 1, minHeight: 0, paddingHorizontal: 18 },
  header: { alignItems: "center", flexDirection: "row", gap: 8, paddingBottom: 14, paddingTop: 14 },
  backIcon: { alignItems: "center", height: 42, justifyContent: "center", width: 38 },
  titleWrap: { flex: 1, minWidth: 0 },
  eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 23, marginTop: 3 },
  headerAction: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 21, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 12 },
  section: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 20 },
  count: { backgroundColor: palette.soft, borderRadius: 10, color: palette.primary, fontSize: 11, fontWeight: "800", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4 },
  folderPlayButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, flexDirection: "row", gap: 5, justifyContent: "center", marginLeft: "auto", minHeight: 38, paddingHorizontal: 10 },
  folderPlayText: { color: palette.onPrimary, fontSize: 10, fontWeight: "800" },
  actionButton: { alignItems: "center", borderRadius: 12, flex: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 46, minWidth: 0, paddingHorizontal: 8 },
  createButton: { backgroundColor: palette.primary },
  createText: { color: palette.onPrimary, fontSize: 10, fontWeight: "800", textAlign: "center" },
  folderCreateButton: { backgroundColor: palette.soft, borderColor: palette.border, borderWidth: 1 },
  folderCreateText: { color: palette.primary, fontSize: 10, fontWeight: "800", textAlign: "center" },
  reorderButton: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 7, minHeight: 44, paddingHorizontal: 12, width: "100%" },
  reorderText: { color: palette.primary, fontSize: 12, fontWeight: "800", textAlign: "center" },
  actions: { marginTop: 11 },
  createActions: { flexDirection: "row", gap: 8 },
  list: { flex: 1, minHeight: 0, width: "100%" },
  hint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 7 },
  listContent: { flexGrow: 1, paddingBottom: 28, paddingTop: 5 },
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
  empty: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 18, borderWidth: 1, marginTop: 16, paddingHorizontal: 22, paddingVertical: 25 },
  emptyIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 23, height: 48, justifyContent: "center", width: 48 },
  emptyTitle: { color: palette.foreground, fontSize: 15, fontWeight: "800", marginTop: 12 },
  emptyText: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 6, textAlign: "center" },
  missing: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  back: { backgroundColor: palette.primary, borderRadius: 12, marginTop: 16, paddingHorizontal: 18, paddingVertical: 12 },
  backText: { color: palette.onPrimary, fontWeight: "800" },
  backdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.48)", flex: 1, justifyContent: "center", padding: 22 },
  modal: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 22, borderWidth: 1, elevation: 18, padding: 21, width: "100%" },
  modalTitle: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 18, marginTop: 5 },
  input: { backgroundColor: palette.background, borderColor: palette.border, borderRadius: 12, borderWidth: 1, color: palette.foreground, fontSize: 14, height: 50, marginTop: 17, paddingHorizontal: 12 },
  modalActions: { flexDirection: "row", gap: 9, justifyContent: "flex-end", marginTop: 17 },
  cancelButton: { alignItems: "center", borderColor: palette.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  cancelText: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  saveButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 44, paddingHorizontal: 16 },
  saveText: { color: palette.onPrimary, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.75 },
});
