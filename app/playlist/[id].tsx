import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { FlatList as GestureFlatList } from "react-native-gesture-handler";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Speech from "expo-speech";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";

import { ScreenContainer } from "@/components/screen-container";
import { loadGratitudeEntries, saveGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { applyLibraryOrder, entriesForPlaylist, folderBreadcrumb, isDefaultPlaylist, libraryItemsInFolder, loadPlaylistFolders, loadPlaylists, savePlaylistFolders, savePlaylists, type Playlist, type PlaylistFolder } from "@/lib/playlists";
import { usePlayer } from "@/lib/player-context";
import { useThemeContext } from "@/lib/theme-provider";
import { deleteManagedFile, persistPickedFile } from "@/lib/local-files";
import { NowPlayingIndicator } from "@/components/now-playing-indicator";
import { withPrivacyLockExemption } from "@/lib/privacy-lock-exemption";

export default function PlaylistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [atmosphereName, setAtmosphereName] = useState("");
  const [atmosphereUri, setAtmosphereUri] = useState<string | null>(null);
  const [voiceIdentifier, setVoiceIdentifier] = useState<string | null>(null);
  const [speechRate, setSpeechRate] = useState<number | null>(null);
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [folders, setFolders] = useState<PlaylistFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [addEntriesOpen, setAddEntriesOpen] = useState(false);
  const [visibleEntryCount, setVisibleEntryCount] = useState(20);
  const addingEntriesRef = useRef(new Set<string>());
  const [entryOpen, setEntryOpen] = useState<GratitudeEntry | null>(null);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const originalOrder = useRef<string[]>([]);
  const listRef = useRef<GestureFlatList<GratitudeEntry>>(null);
  const { playEntries, entries: playingEntries, currentIndex: playingIndex, isPlaying, sourceLabel, removeQueueEntry, updateQueueEntry, settings: listeningSettings } = usePlayer();
  const router = useRouter();
  const navigation = useNavigation();
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const orderedFolders = useMemo(() => [...folders].sort((a, b) => folderBreadcrumb(folders, a.id).localeCompare(folderBreadcrumb(folders, b.id), "tr")), [folders]);

  const refresh = useCallback(async () => {
    const [lists, loaded, loadedFolders] = await Promise.all([loadPlaylists(), loadGratitudeEntries(), loadPlaylistFolders()]);
    setPlaylist(lists.find((item) => item.id === id) ?? null);
    setEntries(loaded);
    setFolders(loadedFolders);
  }, [id]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then((voices) => setAvailableVoices(voices
      .filter((voice) => voice.language.toLowerCase().replace("_", "-").startsWith("tr"))
      .sort((a, b) => a.name.localeCompare(b.name, "tr")))).catch(() => setAvailableVoices([]));
    // Speech is owned by the app-wide PlayerProvider. Unmounting this route must not stop its queue.
  }, []);

  const list = playlist ? entriesForPlaylist(entries, playlist) : [];
  const visibleSourceEntries = entries.slice(0, visibleEntryCount);
  const nowPlayingId = isPlaying ? playingEntries[playingIndex]?.id : undefined;
  const nowPlayingIndex = list.findIndex((entry) => entry.id === nowPlayingId);
  const hasUnsavedOrder = reorderMode && (list.length !== originalOrder.current.length || list.some((entry, index) => entry.id !== originalOrder.current[index]));

  useEffect(() => {
    if (nowPlayingIndex < 0 || listViewportHeight < 100) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: nowPlayingIndex, animated: true, viewPosition: 0.5 });
    }, 80);
    return () => clearTimeout(timer);
  }, [listViewportHeight, nowPlayingIndex, list.length, reorderMode]);

  const startReorder = () => {
    if (!playlist) return;
    originalOrder.current = [...playlist.entryIds];
    setReorderMode(true);
  };

  const discardOrder = () => {
    if (playlist) setPlaylist({ ...playlist, entryIds: originalOrder.current });
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
    if (!playlist || savingOrder) return false;
    setSavingOrder(true);
    const ids = list.map((entry) => entry.id);
    try {
      const nextLists = (await loadPlaylists()).map((item) => item.id === playlist.id ? { ...item, entryIds: ids } : item);
      await savePlaylists(nextLists);
      setPlaylist({ ...playlist, entryIds: ids });
      originalOrder.current = ids;
      setReorderMode(false);
      return true;
    } catch {
      Alert.alert("Sıralama kaydedilemedi", "Önceki sıralama korunuyor. Yeniden deneyebilirsin.");
      setPlaylist({ ...playlist, entryIds: originalOrder.current });
      setReorderMode(false);
      return false;
    } finally {
      setSavingOrder(false);
    }
  };

  usePreventRemove(hasUnsavedOrder, ({ data }) => {
    Alert.alert("Sıralama kaydedilsin mi?", "Bu sayfadan çıkarsan kaydedilmemiş sıralama değişiklikleri kaybolur.", [
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

  const chooseAtmosphere = async () => {
    const result = await withPrivacyLockExemption(() => DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true }));
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) {
      const storedUri = await persistPickedFile(asset.uri, asset.name, "playlist-atmosphere");
      setAtmosphereUri(storedUri);
      setAtmosphereName(asset.name);
    }
  };

  const saveName = async () => {
    if (!playlist || !nameDraft.trim()) return;
    const latest = await loadPlaylists();
    const current = latest.find((item) => item.id === playlist.id);
    if (!current) return;
    let nextPlaylists = latest;
    let nextFolders = folders;
    const previousFolderId = current.folderId ?? null;
    if (previousFolderId !== selectedFolderId) {
      const remainingInSource = libraryItemsInFolder(nextPlaylists, nextFolders, previousFolderId).filter((item) => item.kind !== "playlist" || item.id !== current.id);
      const sourceOrder = applyLibraryOrder(remainingInSource, nextPlaylists, nextFolders, previousFolderId);
      nextPlaylists = sourceOrder.playlists;
      nextFolders = sourceOrder.folders;
      const destinationItems = libraryItemsInFolder(nextPlaylists, nextFolders, selectedFolderId).filter((item) => item.kind !== "playlist" || item.id !== current.id);
      const destinationOrder = applyLibraryOrder(destinationItems, nextPlaylists, nextFolders, selectedFolderId);
      nextPlaylists = destinationOrder.playlists;
      nextFolders = destinationOrder.folders;
    }
    const destinationItems = libraryItemsInFolder(nextPlaylists, nextFolders, selectedFolderId).filter((item) => item.kind !== "playlist" || item.id !== current.id);
    nextPlaylists = nextPlaylists.map((item) => item.id === playlist.id
      ? { ...item, name: nameDraft.trim(), nameCustomized: true, atmosphereUri, atmosphereName, voiceIdentifier: voiceIdentifier ?? undefined, speechRate: speechRate ?? undefined, folderId: selectedFolderId, sortOrder: previousFolderId === selectedFolderId ? item.sortOrder : destinationItems.length }
      : item);
    await Promise.all([savePlaylists(nextPlaylists), savePlaylistFolders(nextFolders)]);
    setFolders(nextFolders);
    setPlaylist(nextPlaylists.find((item) => item.id === playlist.id) ?? null);
    setFolderPickerOpen(false);
    setRenameOpen(false);
  };

  const addEntryToPlaylist = async (entry: GratitudeEntry) => {
    if (!playlist || playlist.entryIds.includes(entry.id) || addingEntriesRef.current.has(entry.id)) return;
    addingEntriesRef.current.add(entry.id);
    try {
      const [latestEntries, latestPlaylists] = await Promise.all([loadGratitudeEntries(), loadPlaylists()]);
      const latestPlaylist = latestPlaylists.find((item) => item.id === playlist.id);
      if (!latestPlaylist || latestPlaylist.entryIds.includes(entry.id)) return;
      const nextPlaylist = { ...latestPlaylist, entryIds: [...latestPlaylist.entryIds, entry.id] };
      const nextEntries = latestEntries.map((item) => item.id === entry.id ? { ...item, favorite: true } : item);
      const nextPlaylists = latestPlaylists.map((item) => item.id === playlist.id ? nextPlaylist : item);
      await Promise.all([savePlaylists(nextPlaylists), saveGratitudeEntries(nextEntries)]);
      setEntries(nextEntries);
      setPlaylist(nextPlaylist);
    } catch {
      Alert.alert("Listeye eklenemedi", "Kayıtların korunuyor. Biraz sonra yeniden deneyebilirsin.");
    } finally {
      addingEntriesRef.current.delete(entry.id);
    }
  };

  const previewVoice = (identifier: string, language: string) => {
    if (isPlaying) {
      Alert.alert("Dinleme sürüyor", "Örnek sesi dinlemek için önce mevcut playlisti duraklat.");
      return;
    }
    if (previewingVoice === identifier) {
      void Speech.stop();
      setPreviewingVoice(null);
      return;
    }
    void Speech.stop();
    setPreviewingVoice(identifier);
    Speech.speak("Bugün şükrettiğim şey, içime huzur veren küçük bir an.", {
      language,
      voice: identifier,
      rate: speechRate ?? listeningSettings.rate,
      onDone: () => setPreviewingVoice(null),
      onStopped: () => setPreviewingVoice(null),
      onError: () => setPreviewingVoice(null),
    });
  };

  const openEditPlaylist = () => {
    setNameDraft(playlist?.name ?? "");
    setAtmosphereUri(playlist?.atmosphereUri ?? null);
    setAtmosphereName(playlist?.atmosphereName ?? "");
    setVoiceIdentifier(playlist?.voiceIdentifier ?? null);
    setSpeechRate(typeof playlist?.speechRate === "number" ? playlist.speechRate : null);
    setSelectedFolderId(playlist?.folderId ?? null);
    setFolderPickerOpen(false);
    setVoicePickerOpen(false);
    setRenameOpen(true);
  };

  const changeSpeechRate = (delta: number) => {
    const currentRate = speechRate ?? listeningSettings.rate;
    setSpeechRate(Number(Math.min(2, Math.max(0.5, currentRate + delta)).toFixed(1)));
  };

  const removePlaylist = () => {
    if (!playlist || isDefaultPlaylist(playlist)) return;
    Alert.alert("Playlisti sil?", `“${playlist.name}” playlisti silinecek. İçindeki şükran kayıtları korunur.`, [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: async () => {
        await savePlaylists((await loadPlaylists()).filter((item) => item.id !== playlist.id));
        router.back();
      } },
    ]);
  };

  const saveEntry = async () => {
    if (!entryOpen || !textDraft.trim()) return;
    const updatedEntry = { ...entryOpen, text: textDraft.trim() };
    const next = entries.map((entry) => entry.id === entryOpen.id ? updatedEntry : entry);
    await saveGratitudeEntries(next);
    setEntries(next);
    updateQueueEntry(updatedEntry);
    setEntryOpen(null);
  };

  const removeFromPlaylist = () => {
    if (!playlist || !entryOpen) return;
    Alert.alert("Playlistten çıkar?", "Kayıt silinmeyecek, sadece bu playlistten kaldırılacak.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkar", style: "destructive", onPress: async () => {
        const ids = playlist.entryIds.filter((entryId) => entryId !== entryOpen.id);
        const next = (await loadPlaylists()).map((item) => item.id === playlist.id ? { ...item, entryIds: ids } : item);
        await savePlaylists(next);
        setPlaylist({ ...playlist, entryIds: ids });
        const queueIndex = playingEntries.findIndex((item) => item.id === entryOpen.id);
        if (queueIndex >= 0 && sourceLabel === playlist.name) removeQueueEntry(queueIndex);
        setEntryOpen(null);
      } },
    ]);
  };

  const deleteEntry = () => {
    if (!entryOpen) return;
    Alert.alert("Kaydı sil?", "Bu kayıt günlüğünden ve tüm playlistlerden kaldırılır.", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Kaydı sil", style: "destructive", onPress: async () => {
        const nextEntries = entries.filter((entry) => entry.id !== entryOpen.id);
        const nextLists = (await loadPlaylists()).map((item) => ({
          ...item,
          entryIds: item.entryIds.filter((entryId) => entryId !== entryOpen.id),
        }));
        await saveGratitudeEntries(nextEntries);
        await savePlaylists(nextLists);
        setEntries(nextEntries);
        const queueIndex = playingEntries.findIndex((item) => item.id === entryOpen.id);
        if (queueIndex >= 0) removeQueueEntry(queueIndex);
        await Promise.all([deleteManagedFile(entryOpen.audioUri), deleteManagedFile(entryOpen.imageUri)]);
        setEntryOpen(null);
      } },
    ]);
  };

  const renderPlaylistEntry = (item: GratitudeEntry, index: number, drag?: () => void, isActive = false) => {
    const active = item.id === nowPlayingId;
    return (
      <View style={[styles.entry, active && styles.entryCurrent, isActive && styles.entryDragging]}>
        <Pressable
          onPress={() => { if (!reorderMode) playEntries(list, index, playlist?.atmosphereUri ?? undefined, playlist?.name ?? "Liste", playlist?.voiceIdentifier ?? undefined, playlist?.speechRate); }}
          onLongPress={reorderMode ? drag : undefined}
          delayLongPress={240}
          style={({ pressed }) => [styles.entryMain, pressed && !isActive && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${active ? "Şimdi çalıyor" : "Bu notu dinle"}: ${item.text}`}
          accessibilityHint={reorderMode ? "Sıralamayı değiştirmek için basılı tutup sürükleyin" : "Bu kaydı başlatır"}
        >
          <View style={[styles.entryIcon, active && styles.entryIconCurrent]}>
            <Ionicons name={reorderMode ? "reorder-three-outline" : "play"} size={16} color={active ? palette.onPrimary : palette.primary} />
          </View>
          <View style={styles.entryCopy}>
            <Text style={styles.entryText}>{item.text}</Text>
            {item.imageUri ? <Pressable onPress={() => setImagePreviewUri(item.imageUri ?? null)} accessibilityRole="button" accessibilityLabel="Notun fotoğrafını büyüt"><Image source={{ uri: item.imageUri }} style={styles.entryImage} resizeMode="contain" /></Pressable> : null}
            {item.audioName ? <View style={styles.audioMeta}><Ionicons name="musical-note-outline" size={13} color={palette.muted} /><Text numberOfLines={1} style={styles.audioMetaText}>{item.audioName}</Text></View> : null}
            {active ? <View style={styles.nowPlayingRow}><NowPlayingIndicator color={palette.primary} /><Text style={styles.nowPlayingLabel}>Şimdi çalıyor</Text></View> : null}
          </View>
        </Pressable>
        {reorderMode ? (
          <View style={styles.dragHint}><Ionicons name="hand-left-outline" size={18} color={palette.muted} /></View>
        ) : (
          <Pressable onPress={() => { setEntryOpen(item); setTextDraft(item.text); }} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Notu düzenle veya playlistten çıkar" hitSlop={4}>
            <Ionicons name="ellipsis-horizontal" size={19} color={palette.foreground} />
          </Pressable>
        )}
      </View>
    );
  };

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.primaryActions}>
        <Pressable
          onPress={() => playEntries(list, 0, playlist?.atmosphereUri ?? undefined, playlist?.name ?? "Liste", playlist?.voiceIdentifier ?? undefined, playlist?.speechRate)}
          disabled={!list.length || reorderMode}
          style={({ pressed }) => [styles.play, (!list.length || reorderMode) && styles.disabled, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Playlistteki tüm notları dinle"
          accessibilityState={{ disabled: !list.length || reorderMode }}
        >
          <Ionicons name="play" size={17} color={palette.onPrimary} />
          <Text style={styles.playText}>Tümünü Dinle</Text>
        </Pressable>
        <Pressable onPress={openEditPlaylist} disabled={reorderMode} style={({ pressed }) => [styles.primaryEdit, reorderMode && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Playlisti düzenle">
          <Ionicons name="pencil-outline" size={16} color={palette.primary} />
          <Text style={styles.primaryEditText}>Düzenle</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>{reorderMode ? "Bir notu basılı tutup sürükleyerek yerini değiştir." : "Dinlemek için bir nota dokun. Notun tamamı burada görünür."}</Text>
      <View style={styles.orderSection}>
        <View style={styles.orderTitleWrap}>
          <Text style={styles.sectionTitle}>Şükranlar</Text>
          <Text style={styles.sectionCount}>{list.length}</Text>
        </View>
        {reorderMode ? (
          <View style={styles.editActions}>
            <Pressable onPress={cancelReorder} disabled={savingOrder} style={styles.cancelOrderButton} accessibilityRole="button" accessibilityLabel="Sıralamayı iptal et">
              <Text style={styles.cancelOrderText}>İptal</Text>
            </Pressable>
            <Pressable onPress={() => void saveOrder()} disabled={savingOrder} style={[styles.saveOrderButton, savingOrder && styles.disabled]} accessibilityRole="button" accessibilityLabel="Şükran sıralamasını kaydet">
              <Ionicons name={savingOrder ? "hourglass-outline" : "checkmark"} size={16} color={palette.onPrimary} />
              <Text style={styles.saveOrderText}>{savingOrder ? "Kaydediliyor" : "Kaydet"}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.editActions}>
            <Pressable onPress={startReorder} disabled={!list.length} style={[styles.editButton, !list.length && styles.disabled]} accessibilityRole="button" accessibilityLabel="Sıralamayı değiştir">
              <Ionicons name="reorder-three-outline" size={17} color={palette.primary} />
              <Text style={styles.editText}>Sıralamayı değiştir</Text>
            </Pressable>
            <Pressable onPress={() => { setVisibleEntryCount(20); setAddEntriesOpen(true); }} style={styles.addEntryButton} accessibilityRole="button" accessibilityLabel="Günlükten nota ekle">
              <Ionicons name="add" size={20} color={palette.onPrimary} />
            </Pressable>
          </View>
        )}
      </View>
      {reorderMode ? <Text style={styles.reorderHint}>Sürükleyip bırak; bitince Kaydet’e dokun.</Text> : null}
    </View>
  );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Geri dön">
          <Ionicons name="chevron-back" size={23} color={palette.foreground} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.eyebrow}>PLAYLIST</Text>
          <View style={styles.playlistTitleRow}><Text style={styles.title} numberOfLines={1}>{playlist?.name ?? "Playlist"}</Text></View>
        </View>
        <View style={styles.headerActions}>
          {playlist && !isDefaultPlaylist(playlist) ? (
            <Pressable onPress={removePlaylist} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Playlisti sil">
              <Ionicons name="trash-outline" size={19} color={palette.error} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <DraggableFlatList
        ref={listRef}
        style={styles.list}
        data={list}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <View style={styles.emptyContent}>
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Ionicons name="leaf-outline" size={21} color={palette.primary} /></View>
              <Text style={styles.emptyTitle}>Bu playlist henüz boş</Text>
              <Text style={styles.emptyText}>İyi gelen bir anıyı geçmişinden eklediğinde burada bulabilirsin.</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!savingOrder}
        keyboardShouldPersistTaps="handled"
        activationDistance={reorderMode ? 0 : 1000}
        removeClippedSubviews={false}
        onLayout={(event) => setListViewportHeight(event.nativeEvent.layout.height)}
        onDragEnd={({ data }) => { if (reorderMode && playlist) setPlaylist({ ...playlist, entryIds: data.map((item) => item.id) }); }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          const itemLength = averageItemLength > 0 ? averageItemLength : 96;
          listRef.current?.scrollToOffset({ offset: Math.max(0, itemLength * index - listViewportHeight * 0.4), animated: false });
          setTimeout(() => { if (listViewportHeight > 100) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }); }, 180);
        }}
        renderItem={({ item, getIndex, drag, isActive }: RenderItemParams<GratitudeEntry>) => (
          <ScaleDecorator activeScale={1.02}>{renderPlaylistEntry(item, getIndex() ?? 0, reorderMode ? drag : undefined, isActive)}</ScaleDecorator>
        )}
      />

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.eyebrow}>PLAYLİSTİ DÜZENLE</Text>
            <TextInput autoFocus value={nameDraft} onChangeText={setNameDraft} style={styles.input} placeholder="Playlist adı" placeholderTextColor={palette.muted} returnKeyType="done" onSubmitEditing={saveName} />
            <View style={styles.folderSection}>
              <Text style={styles.folderTitle}>Klasör</Text>
              <Pressable onPress={() => setFolderPickerOpen((open) => !open)} style={styles.folderSelectButton} accessibilityRole="button" accessibilityLabel="Playlistin klasörünü seç">
                <Ionicons name="folder-outline" size={17} color={palette.primary} />
                <Text style={styles.folderSelectText} numberOfLines={1}>{selectedFolderId ? folderBreadcrumb(folders, selectedFolderId) : "Klasörsüz · Listeler"}</Text>
                <Ionicons name={folderPickerOpen ? "chevron-up" : "chevron-down"} size={16} color={palette.muted} />
              </Pressable>
              {folderPickerOpen ? (
                <ScrollView style={styles.folderOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  <Pressable onPress={() => { setSelectedFolderId(null); setFolderPickerOpen(false); }} style={styles.folderOption} accessibilityRole="button">
                    <Ionicons name={selectedFolderId === null ? "checkmark-circle" : "ellipse-outline"} size={17} color={selectedFolderId === null ? palette.primary : palette.muted} />
                    <Text style={styles.folderOptionText}>Klasörsüz · Listeler</Text>
                  </Pressable>
                  {orderedFolders.map((folder) => (
                    <Pressable key={folder.id} onPress={() => { setSelectedFolderId(folder.id); setFolderPickerOpen(false); }} style={styles.folderOption} accessibilityRole="button" accessibilityLabel={`${folderBreadcrumb(folders, folder.id)} klasörüne taşı`}>
                      <Ionicons name={selectedFolderId === folder.id ? "checkmark-circle" : "ellipse-outline"} size={17} color={selectedFolderId === folder.id ? palette.primary : palette.muted} />
                      <Text style={styles.folderOptionText} numberOfLines={1}>{folderBreadcrumb(folders, folder.id)}</Text>
                    </Pressable>
                  ))}
                  {!folders.length ? <Text style={styles.folderEmpty}>Henüz klasör oluşturulmadı. Listeler ekranından yeni klasör ekleyebilirsin.</Text> : null}
                </ScrollView>
              ) : null}
            </View>
            <Pressable onPress={chooseAtmosphere} style={styles.atmosphereButton} accessibilityRole="button">
              <Ionicons name="musical-note-outline" size={17} color={palette.primary} />
              <Text style={styles.atmosphereText}>{atmosphereName || "Bu playlist için atmosfer seç"}</Text>
            </Pressable>
            {atmosphereUri ? (
              <Pressable onPress={() => { setAtmosphereUri(null); setAtmosphereName(""); }} style={styles.removeAtmosphereButton} accessibilityRole="button" accessibilityLabel="Playlist atmosferini kaldır">
                <Ionicons name="close-circle-outline" size={17} color={palette.warning} />
                <Text style={styles.removeAtmosphereText}>Atmosferi kaldır</Text>
              </Pressable>
            ) : null}
            <Text style={styles.atmosphereHint}>Seçilirse genel atmosfer yerine yalnızca bu playlist çalar.</Text>
            <View style={styles.voiceSection}>
              <Text style={styles.voiceTitle}>TTS okuma sesi</Text>
              <Pressable onPress={() => setVoicePickerOpen((open) => !open)} style={styles.voiceSelectButton} accessibilityRole="button" accessibilityLabel="Playlist TTS sesini seç">
                <Ionicons name="chatbubble-ellipses-outline" size={17} color={palette.primary} />
                <Text style={styles.voiceSelectText} numberOfLines={1}>{availableVoices.find((voice) => voice.identifier === voiceIdentifier)?.name ?? "Uygulama ayarındaki sesi kullan"}</Text>
                <Ionicons name={voicePickerOpen ? "chevron-up" : "chevron-down"} size={16} color={palette.muted} />
              </Pressable>
              {voicePickerOpen ? (
                <View style={styles.voiceListWrap}>
                  <Pressable onPress={() => { setVoiceIdentifier(null); setVoicePickerOpen(false); }} style={styles.voiceRow} accessibilityRole="button">
                    <Ionicons name={voiceIdentifier ? "ellipse-outline" : "checkmark-circle"} size={18} color={voiceIdentifier ? palette.muted : palette.primary} />
                    <Text style={styles.voiceName}>Uygulama ayarındaki sesi kullan</Text>
                  </Pressable>
                  {availableVoices.length ? (
                    <ScrollView style={styles.voiceList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {availableVoices.map((voice) => (
                        <View key={voice.identifier} style={styles.voiceRow}>
                          <Pressable onPress={() => { setVoiceIdentifier(voice.identifier); setVoicePickerOpen(false); }} style={styles.voiceChoice} accessibilityRole="button" accessibilityLabel={`${voice.name} sesini seç`}>
                            <Ionicons name={voiceIdentifier === voice.identifier ? "checkmark-circle" : "ellipse-outline"} size={18} color={voiceIdentifier === voice.identifier ? palette.primary : palette.muted} />
                            <Text style={styles.voiceName} numberOfLines={1}>{voice.name}</Text>
                          </Pressable>
                          <Pressable onPress={() => previewVoice(voice.identifier, voice.language)} style={styles.voicePreview} accessibilityRole="button" accessibilityLabel={`${voice.name} sesini örnek dinle`}>
                            <Ionicons name={previewingVoice === voice.identifier ? "stop" : "play"} size={15} color={palette.primary} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : <Text style={styles.voiceEmpty}>Cihazda Türkçe ses bulunamadı. Uygulama ayarındaki ses kullanılacak.</Text>}
                </View>
              ) : null}
              <View style={styles.ratePanel}>
                <View style={styles.rateHeader}>
                  <Text style={styles.rateTitle}>Okuma hızı</Text>
                  <Text style={styles.rateValue}>{(speechRate ?? listeningSettings.rate).toFixed(1)}x</Text>
                </View>
                <View style={styles.rateControls}>
                  <Pressable onPress={() => changeSpeechRate(-0.1)} disabled={(speechRate ?? listeningSettings.rate) <= 0.5} style={[styles.rateButton, (speechRate ?? listeningSettings.rate) <= 0.5 && styles.disabled]} accessibilityRole="button" accessibilityLabel="Okuma hızını azalt">
                    <Ionicons name="remove" size={18} color={palette.primary} />
                  </Pressable>
                  <Text style={styles.rateCaption}>{speechRate === null ? "Uygulama ayarı" : "Bu playlist için"}</Text>
                  <Pressable onPress={() => changeSpeechRate(0.1)} disabled={(speechRate ?? listeningSettings.rate) >= 2} style={[styles.rateButton, (speechRate ?? listeningSettings.rate) >= 2 && styles.disabled]} accessibilityRole="button" accessibilityLabel="Okuma hızını artır">
                    <Ionicons name="add" size={18} color={palette.primary} />
                  </Pressable>
                </View>
                <Pressable onPress={() => setSpeechRate(null)} style={styles.rateReset} accessibilityRole="button" accessibilityLabel="Uygulama ayarındaki okuma hızını kullan">
                  <Text style={styles.rateResetText}>{speechRate === null ? "Uygulama ayarı kullanılıyor" : "Uygulama ayarını kullan"}</Text>
                </Pressable>
              </View>
              <Text style={styles.atmosphereHint}>Bu seçim yalnızca bu playlistteki metin okumalarını etkiler.</Text>
            </View>
            <View style={styles.row}>
              <Pressable onPress={() => setRenameOpen(false)} style={styles.cancel}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={saveName} style={styles.save}><Text style={styles.saveText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={addEntriesOpen} transparent animationType="fade" onRequestClose={() => setAddEntriesOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.addEntriesModal}>
            <View style={styles.addEntriesHeader}>
              <View style={styles.titleWrap}>
                <Text style={styles.eyebrow}>GÜNLÜĞÜNDEN SEÇ</Text>
                <Text style={styles.addEntriesTitle}>Listeye not ekle</Text>
              </View>
              <Pressable onPress={() => setAddEntriesOpen(false)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Not seçiciyi kapat"><Ionicons name="close" size={20} color={palette.foreground} /></Pressable>
            </View>
            <Text style={styles.addEntriesHint}>Bir nota dokunarak bu listeye ekle. İlk 20 kayıt gösterilir; aşağı kaydırdıkça yenileri yüklenir.</Text>
            <FlatList
              data={visibleSourceEntries}
              keyExtractor={(item) => item.id}
              initialNumToRender={20}
              windowSize={5}
              onEndReached={() => setVisibleEntryCount((current) => Math.min(current + 20, entries.length))}
              onEndReachedThreshold={0.45}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.addEntriesList}
              ListEmptyComponent={<Text style={styles.voiceEmpty}>Henüz eklenecek bir şükran kaydın yok.</Text>}
              renderItem={({ item }) => {
                const alreadyAdded = Boolean(playlist?.entryIds.includes(item.id));
                return (
                  <Pressable onPress={() => void addEntryToPlaylist(item)} disabled={alreadyAdded} style={[styles.sourceEntry, alreadyAdded && styles.sourceEntryAdded]} accessibilityRole="button" accessibilityLabel={`${alreadyAdded ? "Listede" : "Listeye ekle"}: ${item.text}`}>
                    <Text style={styles.sourceEntryText}>{item.text}</Text>
                    <View style={[styles.sourceEntryAction, alreadyAdded && styles.sourceEntryActionAdded]}>
                      <Ionicons name={alreadyAdded ? "checkmark" : "add"} size={17} color={alreadyAdded ? palette.primary : palette.onPrimary} />
                      <Text style={[styles.sourceEntryActionText, alreadyAdded && styles.sourceEntryActionTextAdded]}>{alreadyAdded ? "Listede" : "Ekle"}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(entryOpen)} transparent animationType="fade" onRequestClose={() => setEntryOpen(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.eyebrow}>ŞÜKRANI DÜZENLE</Text>
            <TextInput value={textDraft} onChangeText={setTextDraft} multiline style={styles.entryInput} accessibilityLabel="Şükür notu metni" />
            <Pressable onPress={saveEntry} style={styles.saveWide}><Text style={styles.saveText}>Metni kaydet</Text></Pressable>
            <Pressable onPress={removeFromPlaylist} style={styles.outButton}><Text style={styles.outText}>Playlistten çıkar</Text></Pressable>
            <Pressable onPress={deleteEntry} style={styles.deleteButton}><Text style={styles.deleteText}>Kaydı sil</Text></Pressable>
            <Pressable onPress={() => setEntryOpen(null)} style={styles.cancelWide}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(imagePreviewUri)} transparent animationType="fade" onRequestClose={() => setImagePreviewUri(null)}>
        <Pressable style={styles.imagePreviewBackdrop} onPress={() => setImagePreviewUri(null)} accessibilityLabel="Fotoğraf önizlemesini kapat">
          {imagePreviewUri ? <Image source={{ uri: imagePreviewUri }} style={styles.imagePreview} resizeMode="contain" /> : null}
          <View style={styles.imagePreviewClose}><Ionicons name="close" size={22} color="#FFFFFF" /></View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", gap: 9, paddingHorizontal: 14, paddingVertical: 12 },
  backButton: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  titleWrap: { flex: 1, minWidth: 0 },
  playlistTitleRow: { alignItems: "center", flexDirection: "row", gap: 6, minWidth: 0 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 2 },
  headerButton: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 42 },
  eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 23, marginTop: 2 },
  listHeader: { flexShrink: 0, paddingHorizontal: 0, paddingTop: 5 },
  list: { flex: 1, minHeight: 0, width: "100%" },
  scrollContent: { flexGrow: 1, paddingBottom: 32, paddingHorizontal: 14, paddingTop: 5 },
  emptyContent: { flexGrow: 1, paddingBottom: 24, paddingHorizontal: 14, paddingTop: 5 },
  primaryActions: { flexDirection: "row", gap: 8 },
  play: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 14, flex: 1, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  playText: { color: palette.onPrimary, fontSize: 14, fontWeight: "800" },
  primaryEdit: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 48, paddingHorizontal: 12 },
  primaryEditText: { color: palette.primary, fontSize: 13, fontWeight: "800" },
  hint: { color: palette.muted, fontSize: 12, lineHeight: 18, marginHorizontal: 18, marginTop: 12 },
  orderSection: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 23, rowGap: 8 },
  orderTitleWrap: { alignItems: "center", flexDirection: "row", gap: 8 },
  sectionTitle: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19 },
  sectionCount: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 11, color: palette.primary, fontSize: 11, fontWeight: "800", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  editActions: { alignItems: "center", flexDirection: "row", gap: 6, flexShrink: 0 },
  editButton: { alignItems: "center", borderColor: palette.border, borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 42, paddingHorizontal: 9 },
  editText: { color: palette.primary, fontSize: 11, fontWeight: "800" },
  addEntryButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, height: 42, justifyContent: "center", width: 42 },
  cancelOrderButton: { alignItems: "center", borderRadius: 11, justifyContent: "center", minHeight: 42, paddingHorizontal: 8 },
  cancelOrderText: { color: palette.muted, fontSize: 12, fontWeight: "700" },
  saveOrderButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 42, paddingHorizontal: 11 },
  saveOrderText: { color: palette.onPrimary, fontSize: 12, fontWeight: "800" },
  reorderHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginHorizontal: 4, marginTop: 5 },
  entry: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 6, marginBottom: 9, padding: 10 },
  entryCurrent: { backgroundColor: palette.soft, borderColor: palette.primary, borderWidth: 1.5 },
  entryDragging: { elevation: 4, shadowColor: palette.foreground, shadowOpacity: 0.12, shadowRadius: 8 },
  entryMain: { alignItems: "flex-start", flex: 1, flexDirection: "row", gap: 9, minHeight: 48, minWidth: 0, paddingHorizontal: 3, paddingVertical: 2 },
  entryIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 16, height: 32, justifyContent: "center", width: 32 },
  entryIconCurrent: { backgroundColor: palette.primary },
  entryCopy: { flex: 1, minWidth: 0 },
  entryText: { color: palette.foreground, fontFamily: "OpenSans", fontSize: 14, lineHeight: 21 },
  entryImage: { aspectRatio: 1.7, borderRadius: 11, marginTop: 9, width: "100%" },
  audioMeta: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 8 },
  audioMetaText: { color: palette.muted, flex: 1, fontSize: 11 },
  nowPlayingRow: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 7 },
  nowPlayingLabel: { color: palette.primary, fontSize: 10, fontWeight: "800" },
  iconButton: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 36 },
  dragHint: { alignItems: "center", height: 40, justifyContent: "center", width: 36 },
  disabled: { opacity: 0.28 },
  pressed: { opacity: 0.68 },
  emptyCard: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 20, borderWidth: 1, margin: 16, paddingHorizontal: 22, paddingVertical: 28 },
  emptyIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 22, height: 46, justifyContent: "center", width: 46 },
  emptyTitle: { color: palette.foreground, fontSize: 15, fontWeight: "800", marginTop: 12 },
  emptyText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  backdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.36)", flex: 1, justifyContent: "center", padding: 18 },
  modal: { backgroundColor: palette.background, borderRadius: 21, maxWidth: 500, padding: 20, width: "100%" },
  imagePreviewBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.9)", flex: 1, justifyContent: "center", padding: 20 },
  imagePreview: { height: "80%", width: "100%" },
  imagePreviewClose: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 22, height: 44, justifyContent: "center", marginTop: 16, width: 44 },
  input: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 12, borderWidth: 1, color: palette.foreground, fontSize: 15, height: 50, marginTop: 16, paddingHorizontal: 12 },
  folderSection: { marginTop: 13 },
  folderTitle: { color: palette.foreground, fontSize: 12, fontWeight: "800", marginBottom: 7 },
  folderSelectButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 11, flexDirection: "row", gap: 8, minHeight: 42, paddingHorizontal: 11 },
  folderSelectText: { color: palette.foreground, flex: 1, fontSize: 12, fontWeight: "700" },
  folderOptions: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 11, borderWidth: 1, marginTop: 7, maxHeight: 128, paddingHorizontal: 7 },
  folderOption: { alignItems: "center", borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8, minHeight: 40, paddingHorizontal: 5 },
  folderOptionText: { color: palette.foreground, flex: 1, fontSize: 12, fontWeight: "600" },
  folderEmpty: { color: palette.muted, fontSize: 11, lineHeight: 16, padding: 10 },
  entryInput: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 12, borderWidth: 1, color: palette.foreground, fontSize: 14, height: 120, marginTop: 16, padding: 12, textAlignVertical: "top" },
  atmosphereButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 11, flexDirection: "row", gap: 8, marginTop: 12, minHeight: 44, paddingHorizontal: 12 },
  atmosphereText: { color: palette.foreground, flex: 1, fontSize: 13, fontWeight: "700" },
  removeAtmosphereButton: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 7, marginTop: 8, minHeight: 36, paddingHorizontal: 8 },
  removeAtmosphereText: { color: palette.warning, fontSize: 12, fontWeight: "700" },
  atmosphereHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  voiceSection: { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingTop: 13 },
  voiceTitle: { color: palette.foreground, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  voiceSelectButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 11, flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 11 },
  voiceSelectText: { color: palette.foreground, flex: 1, fontSize: 12, fontWeight: "700" },
  voiceListWrap: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 12, borderWidth: 1, marginTop: 8, paddingHorizontal: 7 },
  voiceList: { maxHeight: 150 },
  voiceRow: { alignItems: "center", borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 42, paddingHorizontal: 5 },
  voiceChoice: { alignItems: "center", flex: 1, flexDirection: "row", gap: 8, minHeight: 42 },
  voiceName: { color: palette.foreground, flex: 1, fontSize: 12, fontWeight: "600" },
  voicePreview: { alignItems: "center", height: 38, justifyContent: "center", width: 40 },
  voiceEmpty: { color: palette.muted, fontSize: 12, lineHeight: 18, padding: 12 },
  ratePanel: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 13, borderWidth: 1, marginTop: 10, padding: 10 },
  rateHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  rateTitle: { color: palette.foreground, fontSize: 12, fontWeight: "800" },
  rateValue: { color: palette.primary, fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "800" },
  rateControls: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  rateButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 10, height: 36, justifyContent: "center", width: 42 },
  rateCaption: { color: palette.muted, flex: 1, fontSize: 11, fontWeight: "700", textAlign: "center" },
  rateReset: { alignSelf: "flex-end", justifyContent: "center", minHeight: 30, paddingHorizontal: 4 },
  rateResetText: { color: palette.primary, fontSize: 10, fontWeight: "700" },
  addEntriesModal: { backgroundColor: palette.background, borderColor: palette.border, borderRadius: 22, borderWidth: 1, height: "82%", maxWidth: 520, padding: 18, width: "100%" },
  addEntriesHeader: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  addEntriesTitle: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 20, marginTop: 3 },
  closeButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 22, height: 42, justifyContent: "center", width: 42 },
  addEntriesHint: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  addEntriesList: { paddingBottom: 20, paddingTop: 13 },
  sourceEntry: { alignItems: "flex-start", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, marginBottom: 9, padding: 12 },
  sourceEntryAdded: { backgroundColor: palette.soft, borderColor: palette.primary },
  sourceEntryText: { color: palette.foreground, flex: 1, fontFamily: "OpenSans", fontSize: 13, lineHeight: 20 },
  sourceEntryAction: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 10, flexDirection: "row", gap: 4, justifyContent: "center", minHeight: 34, paddingHorizontal: 8 },
  sourceEntryActionAdded: { backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1 },
  sourceEntryActionText: { color: palette.onPrimary, fontSize: 10, fontWeight: "800" },
  sourceEntryActionTextAdded: { color: palette.primary },
  row: { flexDirection: "row", gap: 9, justifyContent: "flex-end", marginTop: 16 },
  cancel: { alignItems: "center", borderColor: palette.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  cancelText: { color: palette.muted, fontWeight: "800" },
  save: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, justifyContent: "center", minHeight: 44, paddingHorizontal: 18 },
  saveWide: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 11, justifyContent: "center", marginTop: 12, minHeight: 46 },
  saveText: { color: palette.onPrimary, fontWeight: "800" },
  outButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 11, justifyContent: "center", marginTop: 9, minHeight: 44 },
  outText: { color: palette.warning, fontWeight: "800" },
  deleteButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 11, justifyContent: "center", marginTop: 9, minHeight: 44 },
  deleteText: { color: palette.error, fontWeight: "800" },
  cancelWide: { alignItems: "center", justifyContent: "center", marginTop: 13, minHeight: 42 },
});
