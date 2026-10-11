import { useEffect, useRef, useState } from "react";
import { Alert, Animated, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { usePlayer } from "@/lib/player-context";
import { loadGratitudeEntries, saveGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { createLibraryId, ensureDefaultPlaylist, libraryItemsInFolder, loadPlaylistFolders, savePlaylists, type Playlist, type PlaylistFolder } from "@/lib/playlists";
import { useThemeContext } from "@/lib/theme-provider";
import { NowPlayingIndicator } from "@/components/now-playing-indicator";
import { PlaylistPicker } from "@/components/playlist-picker";

function FloatingRing({ size, top, left, duration, delay, color }: { size: number; top: number; left: number; duration: number; delay: number; color: string }) {
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(motion, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(motion, { toValue: 0, duration, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [delay, duration, motion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, {
        borderColor: color,
        width: size,
        height: size,
        borderRadius: size / 2,
        top,
        left,
        opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.28] }),
        transform: [
          { translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [-18, 22] }) },
          { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [16, -20] }) },
          { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) },
        ],
      }]}
    />
  );
}

export default function PlayerScreen() {
  const router = useRouter();
  const { entries, queueRevision, currentIndex, isPlaying, sourceLabel, toggle, next, previous, playIndex, hide, updateQueueEntry } = usePlayer();
  const { palette } = useThemeContext();
  const current = entries[currentIndex];
  const mainPressScale = useRef(new Animated.Value(1)).current;
  const queueRef = useRef<FlatList<GratitudeEntry>>(null);
  const userHasScrolledQueueRef = useRef(false);
  const queueBatchLoadedThisDragRef = useRef(false);
  const lastQueueFocusRef = useRef({ revision: -1, index: -1 });
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [queueView, setQueueView] = useState<{ revision: number; start: number; count: number }>({ revision: -1, start: 0, count: 4 });
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [folders, setFolders] = useState<PlaylistFolder[]>([]);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [pickerEntry, setPickerEntry] = useState<GratitudeEntry | null>(null);
  const pickerActionRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void Promise.all([ensureDefaultPlaylist(), loadPlaylistFolders()]).then(([loadedPlaylists, loadedFolders]) => {
      if (!mounted) return;
      setPlaylists(loadedPlaylists);
      setFolders(loadedFolders);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const initialQueueStart = Math.max(0, Math.min(currentIndex - 1, Math.max(0, entries.length - 4)));
  const isCurrentQueueView = queueView.revision === queueRevision;
  const visibleQueueStart = isCurrentQueueView ? queueView.start : initialQueueStart;
  const visibleQueueCount = isCurrentQueueView ? queueView.count : Math.min(4, entries.length);
  const visibleQueueEntries = entries.slice(visibleQueueStart, visibleQueueStart + visibleQueueCount);
  const visibleQueueCountRef = useRef(visibleQueueCount);
  visibleQueueCountRef.current = visibleQueueCount;
  const activeQueueIndexChanged = lastQueueFocusRef.current.revision !== queueRevision || lastQueueFocusRef.current.index !== currentIndex;
  const activeOutsideVisibleWindow = currentIndex < visibleQueueStart || currentIndex >= visibleQueueStart + visibleQueueCount;

  useEffect(() => {
    if (!entries.length) return;
    if (!isCurrentQueueView || (activeQueueIndexChanged && activeOutsideVisibleWindow)) {
      userHasScrolledQueueRef.current = false;
      queueBatchLoadedThisDragRef.current = false;
      setQueueView({ revision: queueRevision, start: initialQueueStart, count: Math.min(4, entries.length) });
    }
    lastQueueFocusRef.current = { revision: queueRevision, index: currentIndex };
  }, [activeOutsideVisibleWindow, activeQueueIndexChanged, currentIndex, entries.length, initialQueueStart, isCurrentQueueView, queueRevision]);

  useEffect(() => {
    if (!entries.length) return;
    const localIndex = currentIndex - visibleQueueStart;
    if (localIndex < 0 || localIndex >= visibleQueueCountRef.current) return;
    const frame = requestAnimationFrame(() => {
      try { queueRef.current?.scrollToIndex({ index: localIndex, animated: true, viewPosition: 0.5 }); }
      catch { queueRef.current?.scrollToOffset({ offset: Math.max(0, localIndex * 150), animated: false }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [currentIndex, entries.length, queueRevision, visibleQueueStart]);

  if (!current) {
    return (
      <ScreenContainer>
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: palette.soft }]}><Ionicons name="leaf-outline" size={26} color={palette.primary} /></View>
          <Text style={[styles.emptyTitle, { color: palette.foreground }]}>Dinlenecek bir not yok</Text>
          <Text style={[styles.emptyText, { color: palette.muted }]}>Günlüğüne dönüp bir not yazabilirsin.</Text>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backAction, { backgroundColor: palette.primary }, pressed && styles.pressed]}>
            <Text style={{ color: palette.onPrimary, fontWeight: "800" }}>Geri dön</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const closePlayer = () => {
    hide();
    router.back();
  };

  const openPlaylistPicker = async () => {
    if (!current) return;
    try {
      const [loadedPlaylists, storedEntries, loadedFolders] = await Promise.all([ensureDefaultPlaylist(), loadGratitudeEntries(), loadPlaylistFolders()]);
      setPlaylists(loadedPlaylists);
      setFolders(loadedFolders);
      setPickerEntry(storedEntries.find((entry) => entry.id === current.id) ?? current);
      setPlaylistPickerOpen(true);
    } catch {
      Alert.alert("Listeler açılamadı", "Kayıtların duruyor. Biraz sonra yeniden deneyebilirsin.");
    }
  };

  const addToPlaylist = async (playlist: Playlist) => {
    if (!pickerEntry || pickerActionRef.current) return;
    pickerActionRef.current = true;
    try {
      const [storedEntries, storedPlaylists] = await Promise.all([loadGratitudeEntries(), ensureDefaultPlaylist()]);
      const updated = storedEntries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry);
      const nextPlaylists = storedPlaylists.map((item) => item.id === playlist.id
        ? { ...item, entryIds: item.entryIds.includes(pickerEntry.id) ? item.entryIds : [...item.entryIds, pickerEntry.id] }
        : item);
      const updatedEntry = updated.find((entry) => entry.id === pickerEntry.id);
      await Promise.all([saveGratitudeEntries(updated), savePlaylists(nextPlaylists)]);
      if (updatedEntry) updateQueueEntry(updatedEntry);
      setPlaylists(nextPlaylists);
      setPlaylistPickerOpen(false);
    } catch {
      Alert.alert("Listeye eklenemedi", "Notun korunuyor. Biraz sonra yeniden deneyebilirsin.");
    } finally {
      pickerActionRef.current = false;
    }
  };

  const createPlaylistForEntry = async (name: string, folderId: string | null) => {
    if (!pickerEntry || pickerActionRef.current) return;
    pickerActionRef.current = true;
    try {
      const [storedEntries, storedPlaylists] = await Promise.all([loadGratitudeEntries(), ensureDefaultPlaylist()]);
      const created: Playlist = { id: createLibraryId("playlist"), name, entryIds: [pickerEntry.id], createdAt: new Date().toISOString(), folderId, sortOrder: libraryItemsInFolder(storedPlaylists, folders, folderId).length };
      const nextPlaylists = [...storedPlaylists, created];
      const updated = storedEntries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry);
      const updatedEntry = updated.find((entry) => entry.id === pickerEntry.id);
      await Promise.all([saveGratitudeEntries(updated), savePlaylists(nextPlaylists)]);
      if (updatedEntry) updateQueueEntry(updatedEntry);
      setPlaylists(nextPlaylists);
      setPlaylistPickerOpen(false);
    } catch {
      Alert.alert("Liste oluşturulamadı", "Notun korunuyor. Biraz sonra yeniden deneyebilirsin.");
    } finally {
      pickerActionRef.current = false;
    }
  };
  const animateMainPress = (toValue: number) => {
    Animated.timing(mainPressScale, { toValue, duration: 120, useNativeDriver: true }).start();
  };
  return (
    <ScreenContainer>
      <View style={[styles.screen, { backgroundColor: palette.background }]}>
        <FloatingRing size={260} top={80} left={-80} duration={7200} delay={0} color={palette.primary} />
        <FloatingRing size={330} top={360} left={250} duration={8600} delay={500} color={palette.primary} />
        <FloatingRing size={220} top={610} left={85} duration={9800} delay={1000} color={palette.primary} />
        <View style={styles.top}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.circleButton, { backgroundColor: palette.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Önceki ekrana dön">
            <Ionicons name="chevron-down" size={23} color={palette.foreground} />
          </Pressable>
          <View style={styles.topActions}>
            <Pressable onPress={() => void openPlaylistPicker()} style={({ pressed }) => [styles.circleButton, { backgroundColor: palette.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Hangi listeye ekleneceğini seç">
              <Ionicons name={playlists.some((playlist) => playlist.entryIds.includes(current.id)) ? "bookmark" : "bookmark-outline"} size={20} color={playlists.some((playlist) => playlist.entryIds.includes(current.id)) ? palette.primary : palette.foreground} />
            </Pressable>
            <Pressable onPress={closePlayer} style={({ pressed }) => [styles.circleButton, { backgroundColor: palette.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Oynatıcıyı kapat">
              <Ionicons name="close" size={20} color={palette.foreground} />
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={[styles.counter, { color: palette.primary }]}>{sourceLabel} · {currentIndex + 1} / {entries.length}</Text>
          <FlatList
            ref={queueRef}
            data={visibleQueueEntries}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            style={styles.queueList}
            contentContainerStyle={styles.queueContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews
            onScrollBeginDrag={() => {
              userHasScrolledQueueRef.current = true;
              queueBatchLoadedThisDragRef.current = false;
            }}
            onEndReached={() => {
              if (userHasScrolledQueueRef.current && !queueBatchLoadedThisDragRef.current) {
                queueBatchLoadedThisDragRef.current = true;
                setQueueView((view) => ({ revision: queueRevision, start: visibleQueueStart, count: Math.min(entries.length - visibleQueueStart, (view.revision === queueRevision ? view.count : visibleQueueCount) + 4) }));
              }
            }}
            onEndReachedThreshold={0.45}
            ListHeaderComponent={visibleQueueStart > 0 ? (
              <Pressable onPress={() => setQueueView({ revision: queueRevision, start: Math.max(0, visibleQueueStart - 4), count: Math.min(4, entries.length - Math.max(0, visibleQueueStart - 4)) })} style={styles.previousBatch} accessibilityRole="button" accessibilityLabel="Önceki dört şükranı göster">
                <Ionicons name="chevron-up" size={15} color={palette.primary} /><Text style={[styles.previousBatchText, { color: palette.primary }]}>Önceki şükranları göster</Text>
              </Pressable>
            ) : null}
            ListFooterComponent={visibleQueueStart + visibleQueueCount < entries.length ? (
              <Pressable
                onPress={() => {
                  queueBatchLoadedThisDragRef.current = true;
                  setQueueView((view) => ({ revision: queueRevision, start: visibleQueueStart, count: Math.min(entries.length - visibleQueueStart, (view.revision === queueRevision ? view.count : visibleQueueCount) + 4) }));
                }}
                style={({ pressed }) => [styles.nextBatch, { backgroundColor: palette.soft, borderColor: palette.border }, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Sonraki dört şükranı göster"
              >
                <Text style={[styles.previousBatchText, { color: palette.primary }]}>Sonraki şükranları göster</Text><Ionicons name="chevron-down" size={15} color={palette.primary} />
              </Pressable>
            ) : null}
            onScrollToIndexFailed={({ index, averageItemLength }) => {
              queueRef.current?.scrollToOffset({ offset: Math.max(0, averageItemLength * index - 120), animated: false });
              setTimeout(() => queueRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 }), 120);
            }}
            renderItem={({ item, index }) => {
              const queueIndex = visibleQueueStart + index;
              const active = queueIndex === currentIndex;
              return (
                <Pressable
                  onPress={() => { if (!active) playIndex(queueIndex); }}
                  disabled={active && isPlaying}
                  style={({ pressed }) => [styles.queueRow, { backgroundColor: active ? palette.soft : palette.surface, borderColor: active ? palette.primary : palette.border }, pressed && !active && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${active ? "Şimdi çalıyor" : "Bu kaydı çal"}: ${item.text}`}
                  accessibilityState={{ selected: active, disabled: active && isPlaying }}
                >
                  <View style={styles.queueRowLabelWrap}>
                    {active && isPlaying ? <NowPlayingIndicator color={palette.primary} size={12} /> : null}
                  <Text style={[styles.queueRowLabel, { color: active ? palette.primary : palette.muted }]}>{active ? "Şimdi çalıyor" : `${queueIndex + 1}. kayıt`}</Text>
                  </View>
                  <Text style={[styles.queueText, { color: palette.foreground }]}>{item.text}</Text>
                  {item.imageUri ? <Pressable onPress={() => setImagePreviewUri(item.imageUri ?? null)} accessibilityRole="button" accessibilityLabel="Notun fotoğrafını büyüt"><Image source={{ uri: item.imageUri }} style={styles.queueImage} resizeMode="contain" /></Pressable> : null}
                  {item.audioName ? <View style={styles.audioMeta}><Ionicons name="musical-note-outline" size={13} color={palette.muted} /><Text numberOfLines={1} style={[styles.audioMetaText, { color: palette.muted }]}>{item.audioName} · notun ekli sesi</Text></View> : null}
                </Pressable>
              );
            }}
          />
          <View style={[styles.controlsDock, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.progress, { backgroundColor: palette.border }]}>
              <View style={[styles.progressFill, { backgroundColor: palette.primary, width: `${((currentIndex + 1) / entries.length) * 100}%` }]} />
            </View>
            <View style={styles.controls}>
              <Pressable onPress={previous} disabled={currentIndex === 0} style={({ pressed }) => [styles.skip, currentIndex === 0 && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Önceki not" accessibilityState={{ disabled: currentIndex === 0 }}>
                <Ionicons name="play-skip-back" size={25} color={palette.foreground} />
              </Pressable>
              <Animated.View style={{ transform: [{ scale: mainPressScale }] }}>
                <Pressable onPress={toggle} onPressIn={() => animateMainPress(0.94)} onPressOut={() => animateMainPress(1)} style={({ pressed }) => [styles.mainPlay, { backgroundColor: palette.primary }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={isPlaying ? "Dinlemeyi duraklat" : "Notu dinle"}>
                  <Ionicons name={isPlaying ? "pause" : "play"} size={29} color={palette.onPrimary} />
                </Pressable>
              </Animated.View>
              <Pressable onPress={next} disabled={currentIndex >= entries.length - 1} style={({ pressed }) => [styles.skip, currentIndex >= entries.length - 1 && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Sonraki not" accessibilityState={{ disabled: currentIndex >= entries.length - 1 }}>
                <Ionicons name="play-skip-forward" size={25} color={palette.foreground} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
      <Modal visible={Boolean(imagePreviewUri)} transparent animationType="fade" onRequestClose={() => setImagePreviewUri(null)}>
        <Pressable style={styles.imagePreviewBackdrop} onPress={() => setImagePreviewUri(null)} accessibilityLabel="Fotoğraf önizlemesini kapat">
          {imagePreviewUri ? <Image source={{ uri: imagePreviewUri }} style={styles.imagePreview} resizeMode="contain" /> : null}
          <View style={styles.imagePreviewClose}><Ionicons name="close" size={22} color="#FFFFFF" /></View>
        </Pressable>
      </Modal>
      <PlaylistPicker visible={playlistPickerOpen} playlists={playlists} folders={folders} onClose={() => setPlaylistPickerOpen(false)} onSelect={addToPlaylist} onCreate={createPlaylistForEntry} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", paddingHorizontal: 24 },
  ring: { borderWidth: 2, position: "absolute" },
  top: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingTop: 15 },
  topActions: { alignItems: "center", flexDirection: "row", gap: 4 },
  circleButton: { alignItems: "center", borderRadius: 22, height: 42, justifyContent: "center", width: 42 },
  content: { flex: 1, paddingBottom: 17, paddingTop: 16 },
  counter: { fontFamily: "PlayfairDisplaySemiBold", fontSize: 12, letterSpacing: 1, textAlign: "center" },
  queueList: { flex: 1, marginTop: 10 },
  queueContent: { gap: 20, paddingBottom: 12, paddingHorizontal: 2, paddingVertical: 12 },
  previousBatch: { alignItems: "center", alignSelf: "center", flexDirection: "row", gap: 5, minHeight: 38, paddingHorizontal: 8 },
  nextBatch: { alignItems: "center", alignSelf: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 4, minHeight: 42, paddingHorizontal: 14 },
  previousBatchText: { fontSize: 11, fontWeight: "800" },
  queueRow: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 15 },
  queueRowLabelWrap: { alignItems: "center", flexDirection: "row", gap: 6, marginBottom: 8 },
  queueRowLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.7 },
  queueText: { fontFamily: "PlayfairDisplay", fontSize: 17, lineHeight: 26, textAlign: "center" },
  queueImage: { aspectRatio: 1.8, borderRadius: 12, marginTop: 12, width: "100%" },
  audioMeta: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 9 },
  audioMetaText: { flex: 1, fontSize: 11 },
  controlsDock: { borderRadius: 21, borderWidth: 1, elevation: 3, marginHorizontal: -5, marginTop: 12, paddingHorizontal: 13, paddingTop: 7, paddingBottom: 10, shadowColor: "#000000", shadowOpacity: 0.08, shadowRadius: 8 },
  progress: { borderRadius: 3, height: 5, marginTop: 10, overflow: "hidden" },
  progressFill: { borderRadius: 3, height: 5 },
  controls: { alignItems: "center", flexDirection: "row", justifyContent: "center", marginTop: 12 },
  skip: { alignItems: "center", height: 56, justifyContent: "center", width: 60 },
  mainPlay: { alignItems: "center", borderRadius: 32, elevation: 5, height: 64, justifyContent: "center", marginHorizontal: 20, shadowColor: "#000000", shadowOpacity: 0.15, shadowRadius: 8, width: 64 },
  disabled: { opacity: 0.25 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.97 }] },
  imagePreviewBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.9)", flex: 1, justifyContent: "center", padding: 20 },
  imagePreview: { height: "80%", width: "100%" },
  imagePreviewClose: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 22, height: 44, justifyContent: "center", marginTop: 16, width: 44 },
  empty: { alignItems: "center", flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  emptyIcon: { alignItems: "center", borderRadius: 26, height: 52, justifyContent: "center", width: 52 },
  emptyTitle: { fontFamily: "PlayfairDisplaySemiBold", fontSize: 19, marginTop: 15, textAlign: "center" },
  emptyText: { fontSize: 14, lineHeight: 21, marginTop: 7, textAlign: "center" },
  backAction: { alignItems: "center", borderRadius: 14, justifyContent: "center", marginTop: 17, minHeight: 46, paddingHorizontal: 18 },
});
