import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

import { ScreenContainer } from "@/components/screen-container";
import { QuickGratitudeModal } from "@/components/quick-gratitude-modal";
import { loadGratitudeEntries, saveGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { usePlayer } from "@/lib/player-context";
import { loadDailyGoal } from "@/lib/daily-goal";
import { loadPreferences } from "@/lib/app-preferences";
import { createLibraryId, ensureDefaultPlaylist, libraryItemsInFolder, loadPlaylistFolders, savePlaylists, type Playlist, type PlaylistFolder } from "@/lib/playlists";
import { useThemeContext } from "@/lib/theme-provider";
import { PlaylistPicker } from "@/components/playlist-picker";
import { motivationalQuotes } from "@/lib/motivational-quotes";
import { deleteManagedFile, persistImageAsset, persistPickedFile } from "@/lib/local-files";
import { GratitudeEntryCard } from "@/components/gratitude-entry-card";
import { withPrivacyLockExemption } from "@/lib/privacy-lock-exemption";

function formatRecordingDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function HomeScreen() {
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [audioDraft, setAudioDraft] = useState<{ uri: string; name: string } | null>(null);
  const [recordingVisible, setRecordingVisible] = useState(false);
  const [imageDraft, setImageDraft] = useState<{ uri: string; name: string } | null>(null);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [photoAssets, setPhotoAssets] = useState<MediaLibrary.Asset[]>([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoHasNext, setPhotoHasNext] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [quickVisible, setQuickVisible] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(5);
  const [hapticsOnSave, setHapticsOnSave] = useState(true);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [pickerEntry, setPickerEntry] = useState<GratitudeEntry | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistFolders, setPlaylistFolders] = useState<PlaylistFolder[]>([]);
  const [actionEntry, setActionEntry] = useState<GratitudeEntry | null>(null);
  const [editingEntry, setEditingEntry] = useState<GratitudeEntry | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [entrySort, setEntrySort] = useState<"newest" | "oldest">("newest");
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * motivationalQuotes.length));
  const saveLockRef = useRef(false);
  const recordingActionRef = useRef(false);
  const photoCursorRef = useRef<string | null>(null);
  const photoLoadLockRef = useRef(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const router = useRouter();
  const { playEntries, currentIndex, isPlaying, entries: playingEntries, pauseForRecording, removeQueueEntry, updateQueueEntry, settings: listeningSettings } = usePlayer();
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<GratitudeEntry>>(null);
  const { palette } = useThemeContext();
  const colors = useMemo(() => ({
    background: palette.background,
    surface: palette.surface,
    ink: palette.foreground,
    muted: palette.muted,
    border: palette.border,
    primary: palette.primary,
    soft: palette.soft,
    onPrimary: palette.onPrimary,
    warning: palette.warning,
    error: palette.error,
  }), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const refreshEntries = useCallback(async () => {
    setRefreshing(true);
    try {
      const [loadedEntries, preferences, loadedPlaylists, loadedGoal, loadedFolders] = await Promise.all([
        loadGratitudeEntries(),
        loadPreferences(),
        ensureDefaultPlaylist(),
        loadDailyGoal(),
        loadPlaylistFolders(),
      ]);
      setEntrySort(preferences.entrySort);
      setHapticsOnSave(preferences.hapticsOnSave);
      setEntries(preferences.entrySort === "oldest" ? [...loadedEntries].reverse() : loadedEntries);
      setPlaylists(loadedPlaylists);
      setPlaylistFolders(loadedFolders);
      setDailyGoal(loadedGoal);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void refreshEntries(); }, [refreshEntries]));

  const todayEntries = useMemo(() => {
    const now = new Date();
    return entries.filter((entry) => {
      const date = new Date(entry.createdAt);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
    });
  }, [entries]);

  useEffect(() => {
    if (!isPlaying || playingEntries.length === 0) return;
    const activeId = playingEntries[currentIndex]?.id;
    const activeIndex = todayEntries.findIndex((entry) => entry.id === activeId);
    if (activeIndex >= 0) listRef.current?.scrollToIndex({ index: activeIndex, animated: true, viewPosition: 0.5 });
  }, [currentIndex, isPlaying, playingEntries, todayEntries]);

  const restorePlaybackAudioMode = async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldPlayInBackground: listeningSettings.backgroundPlayback,
      interruptionMode: "doNotMix",
    }).catch(() => undefined);
  };

  const beginVoiceRecording = async () => {
    if (recordingActionRef.current || isSaving) return;
    recordingActionRef.current = true;
    try {
      const permission = await withPrivacyLockExemption(() => AudioModule.requestRecordingPermissionsAsync());
      if (!permission.granted) {
        Alert.alert("Mikrofon izni gerekli", "Şükran notuna kendi sesini kaydetmek için mikrofon izni vermen gerekir.");
        return;
      }
      if (isPlaying) pauseForRecording();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldPlayInBackground: listeningSettings.backgroundPlayback, interruptionMode: "mixWithOthers" });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingVisible(true);
    } catch {
      await restorePlaybackAudioMode();
      Alert.alert("Kayıt başlatılamadı", "Mikrofon kullanılamadı. İzni ve cihaz mikrofonunu kontrol edip yeniden dene.");
    } finally {
      recordingActionRef.current = false;
    }
  };

  const finishVoiceRecording = async () => {
    if (recordingActionRef.current || !recorder.isRecording) return;
    recordingActionRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      await restorePlaybackAudioMode();
      if (!uri) throw new Error("Recording URI is missing");
      if (audioDraft && audioDraft.uri !== uri) await FileSystem.deleteAsync(audioDraft.uri, { idempotent: true }).catch(() => undefined);
      setAudioDraft({ uri, name: `Ses kaydı · ${formatRecordingDuration(recorderState.durationMillis)}.m4a` });
      setRecordingVisible(false);
    } catch {
      await restorePlaybackAudioMode();
      Alert.alert("Kayıt tamamlanamadı", "Kaydedilen ses saklanamadı. Yeniden kayıt başlatabilirsin.");
    } finally {
      recordingActionRef.current = false;
    }
  };

  const cancelVoiceRecording = async () => {
    if (recordingActionRef.current) return;
    recordingActionRef.current = true;
    try {
      if (recorder.isRecording) await recorder.stop();
      const uri = recorder.uri;
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      setRecordingVisible(false);
      await restorePlaybackAudioMode();
    } finally {
      recordingActionRef.current = false;
    }
  };

  const removeAudioDraft = async () => {
    if (audioDraft) await FileSystem.deleteAsync(audioDraft.uri, { idempotent: true }).catch(() => undefined);
    setAudioDraft(null);
  };

  const loadPhotoPage = async (reset = false) => {
    if (photoLoadLockRef.current) return;
    photoLoadLockRef.current = true;
    setPhotoLoading(true);
    setPhotoError(null);
    if (reset) {
      photoCursorRef.current = null;
      setPhotoAssets([]);
      setPhotoHasNext(false);
    }
    try {
      const permission = await withPrivacyLockExemption(() => MediaLibrary.requestPermissionsAsync(false, ["photo"]));
      if (!permission.granted) {
        setPhotoError("Fotoğraflarını gösterebilmem için fotoğraf erişim izni gerekiyor.");
        return;
      }
      const page = await MediaLibrary.getAssetsAsync({
        first: 48,
        ...(reset || !photoCursorRef.current ? {} : { after: photoCursorRef.current }),
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      photoCursorRef.current = page.endCursor || null;
      setPhotoAssets((current) => reset ? page.assets : [...current, ...page.assets]);
      setPhotoHasNext(page.hasNextPage);
      if (page.totalCount === 0) setPhotoError("Fotoğraf kitaplığında henüz görsel yok.");
    } catch {
      setPhotoError("Fotoğraflar yüklenemedi. İzni kontrol edip yeniden deneyebilirsin.");
    } finally {
      photoLoadLockRef.current = false;
      setPhotoLoading(false);
    }
  };

  const chooseImage = async () => {
    if (Platform.OS === "web") {
      const result = await withPrivacyLockExemption(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 }));
      if (!result.canceled && result.assets[0]) setImageDraft({ uri: result.assets[0].uri, name: result.assets[0].fileName || "sukran-anisi.jpg" });
      return;
    }
    photoCursorRef.current = null;
    setPhotoAssets([]);
    setPhotoPickerOpen(true);
    void loadPhotoPage(true);
  };

  const selectPhoto = async (asset: MediaLibrary.Asset) => {
    const selectedName = asset.filename || "Fotoğraf";
    if (imageDraft) await deleteManagedFile(imageDraft.uri);
    setImageDraft({ uri: asset.uri, name: selectedName });
    setPhotoPickerOpen(false);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
      const candidates = [...new Set([info.localUri, info.uri, asset.uri].filter((value): value is string => Boolean(value)))];
      let storedUri: string | null = null;
      for (const sourceUri of candidates) {
        try { storedUri = await persistImageAsset(sourceUri, asset.filename || "sukran-anisi.jpg", "gratitude-image-draft"); break; } catch { /* try next provider URI */ }
      }
      if (storedUri) setImageDraft({ uri: storedUri, name: selectedName });
    } catch {
      // The provider URI remains selected; saving will retry normalization.
    }
  };

  const removeImageDraft = async () => {
    if (imageDraft) await deleteManagedFile(imageDraft.uri);
    setImageDraft(null);
  };

  const addEntry = useCallback(async () => {
    const text = draft.trim();
    if ((!text && !audioDraft && !imageDraft) || isSaving || saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    let storedAudioUri: string | undefined;
    let storedImageUri: string | undefined;
    try {
      if (audioDraft) storedAudioUri = await persistPickedFile(audioDraft.uri, audioDraft.name, "gratitude-audio");
      if (imageDraft) storedImageUri = imageDraft.uri.startsWith(FileSystem.documentDirectory ?? "\u0000")
        ? imageDraft.uri
        : await persistImageAsset(imageDraft.uri, imageDraft.name, "gratitude-image");
      const nextEntry: GratitudeEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: text || (storedImageUri ? "Görüntü kaydı" : "Ses kaydı"),
        createdAt: new Date().toISOString(),
        ...(storedAudioUri ? { audioUri: storedAudioUri, audioName: audioDraft?.name } : {}),
        ...(storedImageUri ? { imageUri: storedImageUri, imageName: imageDraft?.name } : {}),
      };
      const nextEntries = entrySort === "oldest" ? [...entries, nextEntry] : [nextEntry, ...entries];
      await saveGratitudeEntries(entrySort === "oldest" ? [...nextEntries].reverse() : nextEntries);
      setEntries(nextEntries);
      setDraft("");
      if (audioDraft) await FileSystem.deleteAsync(audioDraft.uri, { idempotent: true }).catch(() => undefined);
      setAudioDraft(null);
      setImageDraft(null);
      if (Platform.OS !== "web" && hapticsOnSave) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      if (storedAudioUri) await deleteManagedFile(storedAudioUri);
      if (storedImageUri && storedImageUri !== imageDraft?.uri) await deleteManagedFile(storedImageUri);
      Alert.alert("Kaydedilemedi", "Notun bu kez saklanamadı. Metnin ve eklerin duruyor; yeniden deneyebilirsin.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
      if (text) requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [audioDraft, draft, entries, entrySort, hapticsOnSave, imageDraft, isSaving]);

  const saveQuickEntry = async (text: string) => {
    if (saveLockRef.current) {
      Alert.alert("Bir kayıt sürüyor", "Bu kayıt tamamlanınca hızlı notunu yeniden kaydedebilirsin.");
      throw new Error("A gratitude save is already in progress.");
    }
    saveLockRef.current = true;
    setIsSaving(true);
    const nextEntry: GratitudeEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, createdAt: new Date().toISOString() };
    const nextEntries = entrySort === "oldest" ? [...entries, nextEntry] : [nextEntry, ...entries];
    setEntries(nextEntries);
    try {
      await saveGratitudeEntries(entrySort === "oldest" ? [...nextEntries].reverse() : nextEntries);
      if (Platform.OS !== "web" && hapticsOnSave) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setEntries(entries);
      Alert.alert("Kaydedilemedi", "Hızlı not saklanamadı. Lütfen yeniden dene.");
      throw error;
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  };

  const openPlaylistPicker = async (entry: GratitudeEntry) => {
    const [loadedPlaylists, loadedFolders] = await Promise.all([ensureDefaultPlaylist(), loadPlaylistFolders()]);
    setPlaylists(loadedPlaylists);
    setPlaylistFolders(loadedFolders);
    setPickerEntry(entry);
    setPlaylistPickerOpen(true);
  };

  const addToPlaylist = async (playlist: Playlist) => {
    if (!pickerEntry) return;
    const nextEntries = entries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry);
    const nextPlaylists = playlists.map((item) => item.id === playlist.id
      ? { ...item, entryIds: item.entryIds.includes(pickerEntry.id) ? item.entryIds : [...item.entryIds, pickerEntry.id] }
      : item);
    setEntries(nextEntries);
    setPlaylists(nextPlaylists);
    await saveGratitudeEntries(entrySort === "oldest" ? [...nextEntries].reverse() : nextEntries);
    await savePlaylists(nextPlaylists);
    setPlaylistPickerOpen(false);
  };

  const createPlaylistForEntry = async (name: string, folderId: string | null) => {
    if (!pickerEntry) return;
    const created: Playlist = { id: createLibraryId("playlist"), name, entryIds: [pickerEntry.id], createdAt: new Date().toISOString(), folderId, sortOrder: libraryItemsInFolder(playlists, playlistFolders, folderId).length };
    const nextEntries = entries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry);
    const nextPlaylists = [...playlists, created];
    setEntries(nextEntries);
    setPlaylists(nextPlaylists);
    await saveGratitudeEntries(entrySort === "oldest" ? [...nextEntries].reverse() : nextEntries);
    await savePlaylists(nextPlaylists);
    setPlaylistPickerOpen(false);
  };

  const startEditEntry = (entry: GratitudeEntry) => {
    setActionEntry(null);
    setEditingEntry(entry);
    setEditDraft(entry.text);
  };

  const saveEntryEdit = async () => {
    if (!editingEntry || !editDraft.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const latest = await loadGratitudeEntries();
      const updatedEntry = { ...editingEntry, text: editDraft.trim() };
      const next = latest.map((entry) => entry.id === editingEntry.id ? updatedEntry : entry);
      await saveGratitudeEntries(next);
      setEntries(entrySort === "oldest" ? [...next].reverse() : next);
      updateQueueEntry(updatedEntry);
      setEditingEntry(null);
    } catch {
      Alert.alert("Düzenlenemedi", "Notun korunuyor. Biraz sonra yeniden deneyebilirsin.");
    } finally { setSavingEdit(false); }
  };

  const deleteEntry = (entry: GratitudeEntry) => Alert.alert("Notu sil", "Bu not günlüğünden ve tüm listelerinden kaldırılacak.", [
    { text: "Vazgeç", style: "cancel" },
    { text: "Sil", style: "destructive", onPress: () => { void (async () => {
      try {
        const [latestEntries, latestPlaylists] = await Promise.all([loadGratitudeEntries(), ensureDefaultPlaylist()]);
        const nextEntries = latestEntries.filter((item) => item.id !== entry.id);
        const nextPlaylists = latestPlaylists.map((playlist) => ({ ...playlist, entryIds: playlist.entryIds.filter((id) => id !== entry.id) }));
        await Promise.all([saveGratitudeEntries(nextEntries), savePlaylists(nextPlaylists)]);
        setEntries(entrySort === "oldest" ? [...nextEntries].reverse() : nextEntries);
        setPlaylists(nextPlaylists);
        const queueIndex = playingEntries.findIndex((item) => item.id === entry.id);
        if (queueIndex >= 0) removeQueueEntry(queueIndex);
        await Promise.all([deleteManagedFile(entry.audioUri), deleteManagedFile(entry.imageUri)]);
      } catch { Alert.alert("Silinemedi", "Notun ve listelerin korunuyor. Biraz sonra yeniden dene."); }
    })(); } },
  ]);

  const runEntryAction = (action: "edit" | "list" | "delete") => {
    const entry = actionEntry;
    if (!entry) return;
    setActionEntry(null);
    if (action === "edit") startEditEntry(entry);
    else if (action === "list") void openPlaylistPicker(entry);
    else deleteEntry(entry);
  };

  const showRandomQuote = useCallback(() => {
    setQuoteIndex((current) => {
      if (motivationalQuotes.length < 2) return current;
      const next = Math.floor(Math.random() * (motivationalQuotes.length - 1));
      return next >= current ? next + 1 : next;
    });
  }, []);

  const goalComplete = todayEntries.length >= dailyGoal;
  const goalPercent = dailyGoal > 0 ? Math.round((todayEntries.length / dailyGoal) * 100) : 0;

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <FlatList
          ref={listRef}
          data={todayEntries}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshEntries} tintColor={colors.primary} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <View style={styles.brandRow}>
                  <View style={styles.brandMark}><Ionicons name="leaf-outline" size={17} color={colors.primary} /></View>
                  <Text style={styles.brandText}>ŞÜKRAN GÜNLÜĞÜ</Text>
                </View>
                <View style={styles.headerActions}>
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setTimeout(() => setQuickVisible(true), Platform.OS === "android" ? 100 : 0);
                    }}
                    style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Hızlı şükran yaz"
                    hitSlop={6}
                  >
                    <Ionicons name="flash-outline" size={18} color={colors.onPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => router.push("/settings")}
                    style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Ayarları aç"
                    hitSlop={6}
                  >
                    <Ionicons name="settings-outline" size={19} color={colors.primary} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <View style={styles.goalIcon}><Ionicons name={goalComplete ? "checkmark-circle-outline" : "locate-outline"} size={18} color={colors.primary} /></View>
                  <View style={styles.goalCopy}>
                    <Text style={styles.goalTitle}>Günlük hedef</Text>
                    <Text style={styles.goalText}>
                      {goalComplete
                        ? `Bugün ${todayEntries.length} not bıraktın. Dilersen devam edebilirsin.`
                        : `İstersen bugün ${Math.max(0, dailyGoal - todayEntries.length)} not daha ekleyebilirsin.`}
                    </Text>
                  </View>
                  <Pressable onPress={() => router.push({ pathname: "/settings", params: { section: "goal" } })} style={styles.goalEdit} accessibilityRole="button" accessibilityLabel="Günlük hedef ayarlarına git" hitSlop={6}>
                    <Ionicons name="settings-outline" size={17} color={colors.primary} />
                  </Pressable>
                </View>
                <View style={styles.goalTrack}>
                  <View style={[styles.goalFill, { width: `${Math.min(goalPercent, 100)}%` }]} />
                  {todayEntries.length > dailyGoal ? <View style={[styles.goalOverflow, { width: `${((todayEntries.length - dailyGoal) / todayEntries.length) * 100}%` }]} /> : null}
                  {todayEntries.length > dailyGoal ? <View style={[styles.goalMarker, { left: `${(dailyGoal / todayEntries.length) * 100}%` }]} /> : null}
                </View>
                <Text style={styles.goalStatus}>
                  {todayEntries.length}/{dailyGoal} · %{goalPercent}{todayEntries.length > dailyGoal ? ` · hedefin %${goalPercent - 100} üstünde` : ""}
                </Text>
              </View>

              <View style={styles.composerCard}>
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  placeholder="Bugün şükrettiğim şey..."
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  textAlignVertical="top"
                  blurOnSubmit={false}
                  returnKeyType="default"
                  accessibilityLabel="Bugün için şükür notun"
                />
                {audioDraft ? (
                  <View style={styles.attachmentChip}>
                    <Ionicons name="volume-high-outline" size={16} color={colors.primary} />
                    <Text numberOfLines={1} style={styles.attachmentName}>{audioDraft.name}</Text>
                    <Pressable onPress={() => void removeAudioDraft()} style={styles.attachmentRemove} accessibilityRole="button" accessibilityLabel="Kaydedilen sesi kaldır"><Ionicons name="close" size={17} color={colors.muted} /></Pressable>
                  </View>
                ) : null}
                {imageDraft ? (
                  <View style={styles.imageDraftWrap}>
                    <Pressable onPress={() => setImagePreviewUri(imageDraft.uri)} accessibilityRole="button" accessibilityLabel="Ekli fotoğrafı büyüt">
                      <Image source={{ uri: imageDraft.uri }} style={styles.imageDraft} resizeMode="contain" />
                    </Pressable>
                    <Pressable onPress={() => void removeImageDraft()} style={styles.imageRemove} accessibilityRole="button" accessibilityLabel="Ekli fotoğrafı kaldır"><Ionicons name="close" size={17} color="#FFFFFF" /></Pressable>
                  </View>
                ) : null}
                <View style={styles.composerFooter}>
                  <View style={styles.attachmentActions}>
                    <Pressable onPress={() => void beginVoiceRecording()} disabled={isSaving || recorderState.isRecording} style={({ pressed }) => [styles.attachmentIconButton, (isSaving || recorderState.isRecording) && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={audioDraft ? "Ses kaydını yeniden yap" : "Kendi sesini kaydet"} hitSlop={4}>
                      <Ionicons name="mic-outline" size={20} color={colors.primary} />
                    </Pressable>
                    <Pressable onPress={() => void chooseImage()} style={({ pressed }) => [styles.attachmentIconButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Şükür notuna fotoğraf ekle" hitSlop={4}>
                      <Ionicons name="image-outline" size={20} color={colors.primary} />
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={addEntry}
                    disabled={(!draft.trim() && !audioDraft && !imageDraft) || isSaving || recorderState.isRecording}
                    accessibilityRole="button"
                    accessibilityLabel={draft.trim() ? "Notu kaydet" : "Ses kaydını kaydet"}
                    accessibilityState={{ disabled: (!draft.trim() && !audioDraft && !imageDraft) || isSaving || recorderState.isRecording }}
                    style={({ pressed }) => [styles.addButton, ((!draft.trim() && !audioDraft && !imageDraft) || isSaving || recorderState.isRecording) && styles.addButtonDisabled, pressed && styles.pressed]}
                  >
                    <Text style={styles.addButtonText}>{isSaving ? "Kaydediliyor" : recorderState.isRecording ? "Önce kaydı bitir" : "Kaydet"}</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.onPrimary} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.listHeader}>
                <Text style={styles.sectionTitle}>Şükürlerin</Text>
                <View style={styles.listHeaderActions}>
                  {todayEntries.length > 0 ? (
                    <Pressable onPress={() => playEntries(todayEntries, 0, undefined, "Bugün")} style={({ pressed }) => [styles.listenButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Bugünkü notları dinle">
                      <Ionicons name="volume-high-outline" size={17} color={colors.primary} />
                      <Text style={styles.listenText}>Tümünü Dinle</Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.totalPill}><Text style={styles.totalPillText}>{todayEntries.length}</Text></View>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><Ionicons name="leaf-outline" size={25} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>Bugün sayfan boş</Text>
              <Text style={styles.emptyText}>Hazır olduğunda, burada saklamak istediğin bir anı yazabilirsin.</Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.quoteCard}>
              <Text style={styles.quoteText} accessibilityLiveRegion="polite">{motivationalQuotes[quoteIndex]}</Text>
              <Pressable
                onPress={showRandomQuote}
                style={({ pressed }) => [styles.quoteButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Rastgele başka bir söz göster"
                hitSlop={5}
              >
                <Ionicons name="shuffle-outline" size={19} color={colors.primary} />
              </Pressable>
            </View>
          }
          renderItem={({ item, index }) => {
            const isNowPlaying = isPlaying && playingEntries[currentIndex]?.id === item.id;
            return <GratitudeEntryCard entry={item} index={index} active={isNowPlaying} onPlay={() => playEntries(todayEntries, index, undefined, "Bugün")} onMore={() => setActionEntry(item)} onImagePress={setImagePreviewUri} />;
          }}
        />
        <Modal visible={Boolean(actionEntry)} transparent animationType="fade" onRequestClose={() => setActionEntry(null)}>
          <View style={styles.entryMenuBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionEntry(null)} accessibilityLabel="Kayıt menüsünü kapat" />
            <View style={styles.entryMenuCard}>
              <Text style={styles.entryMenuEyebrow}>KAYIT İŞLEMLERİ</Text>
              <Text style={styles.entryMenuPreview} numberOfLines={2}>{actionEntry?.text}</Text>
              <View style={styles.entryMenuRow}>
                <Pressable onPress={() => runEntryAction("edit")} style={styles.entryMenuOption} accessibilityRole="button" accessibilityLabel="Notu düzenle">
                  <Ionicons name="pencil-outline" size={20} color={colors.primary} /><Text style={styles.entryMenuText}>Düzenle</Text>
                </Pressable>
                <Pressable onPress={() => runEntryAction("list")} style={styles.entryMenuOption} accessibilityRole="button" accessibilityLabel="Listelere ekle">
                  <Ionicons name="bookmark-outline" size={20} color={colors.primary} /><Text style={styles.entryMenuText}>Listelere ekle</Text>
                </Pressable>
                <Pressable onPress={() => runEntryAction("delete")} style={[styles.entryMenuOption, styles.entryMenuDanger]} accessibilityRole="button" accessibilityLabel="Notu sil">
                  <Ionicons name="trash-outline" size={20} color={colors.error} /><Text style={[styles.entryMenuText, styles.entryMenuDangerText]}>Sil</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal visible={Boolean(editingEntry)} transparent animationType="fade" onRequestClose={() => setEditingEntry(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.entryEditBackdrop}>
            <View style={styles.entryEditCard}>
              <Text style={styles.entryMenuEyebrow}>NOTUNU DÜZENLE</Text>
              <Text style={styles.entryEditTitle}>Kelimelerini gözden geçir</Text>
              <TextInput value={editDraft} onChangeText={setEditDraft} multiline autoFocus style={styles.entryEditInput} textAlignVertical="top" accessibilityLabel="Şükran metnini düzenle" />
              <View style={styles.entryEditActions}>
                <Pressable onPress={() => setEditingEntry(null)} style={styles.entryEditCancel}><Text style={styles.entryEditCancelText}>Vazgeç</Text></Pressable>
                <Pressable onPress={() => void saveEntryEdit()} disabled={!editDraft.trim() || savingEdit} style={[styles.entryEditSave, (!editDraft.trim() || savingEdit) && styles.disabled]}><Text style={styles.entryEditSaveText}>{savingEdit ? "Kaydediliyor" : "Kaydet"}</Text></Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
        <Modal visible={Boolean(imagePreviewUri)} transparent animationType="fade" onRequestClose={() => setImagePreviewUri(null)}>
          <Pressable style={styles.imagePreviewBackdrop} onPress={() => setImagePreviewUri(null)} accessibilityLabel="Fotoğraf önizlemesini kapat">
            {imagePreviewUri ? <Image source={{ uri: imagePreviewUri }} style={styles.imagePreview} resizeMode="contain" /> : null}
            <View style={styles.imagePreviewClose}><Ionicons name="close" size={22} color="#FFFFFF" /></View>
          </Pressable>
        </Modal>
        <Modal visible={photoPickerOpen} transparent animationType="slide" onRequestClose={() => setPhotoPickerOpen(false)}>
          <View style={styles.galleryBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoPickerOpen(false)} accessibilityLabel="Fotoğraf galerisini kapat" />
            <View style={styles.gallerySheet}>
              <View style={styles.galleryHeader}>
                <View style={styles.galleryHeading}><Text style={styles.galleryTitle}>Bir fotoğraf seç</Text><Text style={styles.galleryHint}>Fotoğraf kırpılmadan eklenecek.</Text></View>
                <Pressable onPress={() => setPhotoPickerOpen(false)} style={styles.galleryClose} accessibilityRole="button" accessibilityLabel="Galeriyi kapat"><Ionicons name="close" size={20} color={colors.ink} /></Pressable>
              </View>
              {photoError ? <View style={styles.galleryMessage}><Ionicons name={photoAssets.length ? "information-circle-outline" : "images-outline"} size={25} color={colors.primary} /><Text style={styles.galleryMessageText}>{photoError}</Text>{!photoAssets.length ? <Pressable onPress={() => void loadPhotoPage(true)} style={styles.galleryRetry}><Text style={styles.galleryRetryText}>Yeniden dene</Text></Pressable> : null}</View> : null}
              <FlatList
                data={photoAssets}
                keyExtractor={(asset) => asset.id}
                numColumns={3}
                columnWrapperStyle={styles.galleryRow}
                contentContainerStyle={styles.galleryGrid}
                showsVerticalScrollIndicator={false}
                onEndReached={() => { if (photoHasNext && !photoLoading) void loadPhotoPage(false); }}
                onEndReachedThreshold={0.45}
                renderItem={({ item }) => <Pressable onPress={() => void selectPhoto(item)} style={({ pressed }) => [styles.galleryTile, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${item.filename} fotoğrafını seç`}><Image source={{ uri: item.uri }} style={styles.galleryThumb} resizeMode="cover" /></Pressable>}
                ListEmptyComponent={photoLoading ? <Text style={styles.galleryEmpty}>Fotoğraflar yükleniyor…</Text> : photoError ? null : <Text style={styles.galleryEmpty}>Fotoğraf bulunamadı.</Text>}
                ListFooterComponent={photoLoading && photoAssets.length > 0 ? <Text style={styles.galleryEmpty}>Diğer fotoğraflar yükleniyor…</Text> : photoHasNext ? <Text style={styles.galleryEmpty}>Daha fazla görmek için aşağı kaydır.</Text> : null}
              />
            </View>
          </View>
        </Modal>
        <Modal visible={recordingVisible} transparent animationType="fade" onRequestClose={() => void cancelVoiceRecording()}>
          <View style={styles.recordingBackdrop}>
            <View style={styles.recordingCard}>
              <View style={styles.recordingIcon}><Ionicons name={recorderState.isRecording ? "mic" : "mic-outline"} size={22} color={recorderState.isRecording ? colors.error : colors.primary} /></View>
              <Text style={styles.recordingTitle}>{recorderState.isRecording ? "Sesin kaydediliyor" : "Kayıt tamamlandı"}</Text>
              <Text style={styles.recordingHint}>{recorderState.isRecording ? "Hazır olduğunda kaydı bitir. Yalnızca kendi sesin bu nota eklenir." : "Kaydı notuna ekleyebilirsin; istersen yeniden kaydedebilirsin."}</Text>
              <Text style={styles.recordingTimer}>{formatRecordingDuration(recorderState.durationMillis)}</Text>
              <Pressable onPress={() => recorderState.isRecording ? void finishVoiceRecording() : setRecordingVisible(false)} style={[styles.recordingPrimary, recorderState.isRecording && styles.recordingStop]} accessibilityRole="button">
                <Ionicons name={recorderState.isRecording ? "stop" : "checkmark"} size={17} color="#FFFFFF" />
                <Text style={styles.recordingPrimaryText}>{recorderState.isRecording ? "Kaydı bitir" : "Kullan"}</Text>
              </Pressable>
              {!recorderState.isRecording ? <Pressable onPress={() => void beginVoiceRecording()} style={styles.recordingSecondary} accessibilityRole="button"><Ionicons name="refresh-outline" size={16} color={colors.primary} /><Text style={styles.recordingSecondaryText}>Yeniden kaydet</Text></Pressable> : null}
              <Pressable onPress={() => void cancelVoiceRecording()} style={styles.recordingCancel} accessibilityRole="button"><Text style={styles.recordingCancelText}>Vazgeç</Text></Pressable>
            </View>
          </View>
        </Modal>
        <QuickGratitudeModal visible={quickVisible} onClose={() => setQuickVisible(false)} onSave={saveQuickEntry} />
        <PlaylistPicker visible={playlistPickerOpen} playlists={playlists} folders={playlistFolders} onClose={() => setPlaylistPickerOpen(false)} onSelect={addToPlaylist} onCreate={createPlaylistForEntry} />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const createStyles = (colors: Record<string, string>) => StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingHorizontal: 22, paddingBottom: 36 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingTop: 16 },
  brandRow: { alignItems: "center", flexDirection: "row", gap: 9 },
  brandMark: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 13, height: 34, justifyContent: "center", width: 34 },
  brandText: { color: colors.primary, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  quickButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  settingsButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  goalCard: { backgroundColor: "transparent", borderColor: "transparent", borderRadius: 14, borderWidth: 0, marginBottom: 17, marginTop: 29, paddingHorizontal: 3, paddingVertical: 8 },
  goalHeader: { alignItems: "center", flexDirection: "row" },
  goalIcon: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 15, height: 34, justifyContent: "center", width: 34 },
  goalCopy: { flex: 1, marginLeft: 11 },
  goalTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  goalText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  goalEdit: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  goalTrack: { backgroundColor: colors.border, borderRadius: 4, height: 6, marginTop: 10, overflow: "visible", position: "relative" },
  goalFill: { backgroundColor: colors.primary, borderRadius: 5, height: 8 },
  goalOverflow: { backgroundColor: colors.warning, borderRadius: 5, height: 8, position: "absolute", right: 0, top: 0 },
  goalMarker: { backgroundColor: colors.ink, height: 18, position: "absolute", top: -5, width: 2 },
  goalStatus: { color: colors.primary, fontSize: 12, fontWeight: "800", marginTop: 9, textAlign: "right" },
  composerCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, marginTop: 14, padding: 17 },
  input: { color: colors.ink, fontFamily: "PlayfairDisplay", fontSize: 17, lineHeight: 27, minHeight: 118, padding: 0, paddingTop: 2 },
  attachmentActions: { alignItems: "center", flex: 1, flexDirection: "row", gap: 7, justifyContent: "flex-start" },
  attachmentIconButton: { alignItems: "center", backgroundColor: colors.soft, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  attachmentChip: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 10, flexDirection: "row", gap: 7, marginTop: 9, minHeight: 42, paddingLeft: 11, paddingRight: 4 },
  attachmentName: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: "700" },
  attachmentRemove: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  imageDraftWrap: { alignSelf: "flex-start", marginTop: 10, position: "relative" },
  imageDraft: { borderRadius: 12, height: 92, width: 122 },
  imageRemove: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 15, height: 30, justifyContent: "center", position: "absolute", right: 5, top: 5, width: 30 },
  composerFooter: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: 8, justifyContent: "space-between", marginTop: 11, paddingTop: 12 },
  addButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 13, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 44, paddingHorizontal: 14 },
  addButtonDisabled: { opacity: 0.48 },
  addButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },
  listHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 5, marginTop: 31 },
  listHeaderActions: { alignItems: "center", flexDirection: "row", gap: 8 },
  sectionTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 20 },
  listenButton: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 40, paddingHorizontal: 11 },
  listenText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  totalPill: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 13, height: 30, justifyContent: "center", minWidth: 30, paddingHorizontal: 8 },
  totalPillText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  emptyState: { alignItems: "center", paddingHorizontal: 24, paddingTop: 30 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 23, height: 50, justifyContent: "center", marginBottom: 12, width: 50 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 5, textAlign: "center" },
  quoteCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flexDirection: "row", gap: 12, marginTop: 17, padding: 15 },
  quoteText: { color: colors.ink, flex: 1, fontFamily: "PlayfairDisplay", fontSize: 15, lineHeight: 24 },
  quoteButton: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 21, height: 42, justifyContent: "center", width: 42 },
  entryCard: { alignItems: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: "row", marginBottom: 10, paddingHorizontal: 13, paddingVertical: 14 },
  entryCardPlaying: { backgroundColor: colors.soft, borderColor: colors.primary, borderWidth: 1.5 },
  entryIndexColumn: { alignItems: "center", marginRight: 11, width: 44 },
  entryCopy: { flex: 1, paddingTop: 2 },
  entryText: { color: colors.ink, fontFamily: "OpenSans", fontSize: 15, lineHeight: 24 },
  entryImage: { aspectRatio: 1.65, borderRadius: 12, marginTop: 10, width: "100%" },
  entryAttachment: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 8 },
  entryAttachmentText: { color: colors.muted, flex: 1, fontSize: 11 },
  nowPlayingRow: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 7 },
  entryMeta: { color: colors.muted, fontSize: 11, fontWeight: "600", marginTop: 9 },
  nowPlayingLabel: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  entryAction: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 22, height: 44, justifyContent: "center", marginTop: 4, width: 44 },
  imagePreviewBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.9)", flex: 1, justifyContent: "center", padding: 20 },
  entryMenuBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.48)", flex: 1, justifyContent: "center", padding: 22 },
  entryMenuCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, maxWidth: 420, padding: 17, width: "100%" },
  entryMenuEyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  entryMenuPreview: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 16, lineHeight: 22, marginTop: 5 },
  entryMenuRow: { flexDirection: "row", gap: 7, marginTop: 14 },
  entryMenuOption: { alignItems: "center", backgroundColor: colors.background, borderColor: colors.border, borderRadius: 13, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 78, paddingHorizontal: 4, paddingVertical: 8 },
  entryMenuText: { color: colors.ink, fontSize: 10, fontWeight: "800", marginTop: 7, textAlign: "center" },
  entryMenuDanger: { borderColor: colors.error },
  entryMenuDangerText: { color: colors.error },
  entryEditBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.48)", flex: 1, justifyContent: "center", padding: 22 },
  entryEditCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, maxWidth: 440, padding: 20, width: "100%" },
  entryEditTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19, marginTop: 5 },
  entryEditInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, fontFamily: "OpenSans", fontSize: 15, lineHeight: 22, marginTop: 15, maxHeight: 260, minHeight: 130, padding: 12 },
  entryEditActions: { flexDirection: "row", gap: 9, justifyContent: "flex-end", marginTop: 15 },
  entryEditCancel: { alignItems: "center", borderColor: colors.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 16 },
  entryEditCancelText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  entryEditSave: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 11, justifyContent: "center", minHeight: 44, paddingHorizontal: 20 },
  entryEditSaveText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
  imagePreview: { height: "80%", width: "100%" },
  imagePreviewClose: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 22, height: 44, justifyContent: "center", marginTop: 16, width: 44 },
  galleryBackdrop: { backgroundColor: "rgba(0,0,0,0.55)", flex: 1, justifyContent: "flex-end" },
  gallerySheet: { backgroundColor: colors.surface, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, height: "84%", paddingHorizontal: 14, paddingTop: 16 },
  galleryHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  galleryHeading: { flex: 1, minWidth: 0 },
  galleryTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 20 },
  galleryHint: { color: colors.muted, fontSize: 12, marginTop: 3 },
  galleryClose: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  galleryGrid: { paddingBottom: 20 },
  galleryRow: { gap: 5, marginBottom: 5 },
  galleryTile: { aspectRatio: 1, borderRadius: 10, flex: 1, overflow: "hidden" },
  galleryThumb: { height: "100%", width: "100%" },
  galleryMessage: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 14, gap: 8, marginBottom: 12, padding: 13 },
  galleryMessageText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  galleryRetry: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 10, minHeight: 38, justifyContent: "center", marginTop: 2, paddingHorizontal: 14 },
  galleryRetryText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
  galleryEmpty: { color: colors.muted, fontSize: 12, paddingVertical: 15, textAlign: "center" },
  recordingBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.58)", flex: 1, justifyContent: "center", padding: 22 },
  recordingCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, maxWidth: 440, padding: 24, width: "100%" },
  recordingIcon: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 26, height: 52, justifyContent: "center", width: 52 },
  recordingTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 20, marginTop: 14 },
  recordingHint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: "center" },
  recordingTimer: { color: colors.ink, fontSize: 30, fontVariant: ["tabular-nums"], fontWeight: "700", marginVertical: 18 },
  recordingPrimary: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48, width: "100%" },
  recordingStop: { backgroundColor: colors.error },
  recordingPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  recordingSecondary: { alignItems: "center", flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 12, minHeight: 42, paddingHorizontal: 12 },
  recordingSecondaryText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  recordingCancel: { alignItems: "center", justifyContent: "center", marginTop: 4, minHeight: 40, width: "100%" },
  recordingCancelText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
