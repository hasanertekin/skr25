import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";

import { ScreenContainer } from "@/components/screen-container";
import { EmptyState } from "@/components/ui/common";
import { GratitudeEntryCard } from "@/components/gratitude-entry-card";
import { localDateKey, loadGratitudeEntries, saveGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { createLibraryId, ensureDefaultPlaylist, libraryItemsInFolder, loadPlaylistFolders, savePlaylists, type Playlist, type PlaylistFolder } from "@/lib/playlists";
import { usePlayer } from "@/lib/player-context";
import { useThemeContext } from "@/lib/theme-provider";
import { deleteManagedFile, persistImageAsset, persistPickedFile } from "@/lib/local-files";
import { PlaylistPicker } from "@/components/playlist-picker";
import { withPrivacyLockExemption } from "@/lib/privacy-lock-exemption";

function formatRecordingDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function HistoryDetailScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { playEntries, updateQueueEntry, removeQueueEntry, entries: playingEntries, currentIndex, isPlaying, pauseForRecording, settings: listeningSettings } = usePlayer();
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
    danger: palette.error,
  }), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [allEntries, setAllEntries] = useState<GratitudeEntry[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [folders, setFolders] = useState<PlaylistFolder[]>([]);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [pickerEntry, setPickerEntry] = useState<GratitudeEntry | null>(null);
  const [actionEntry, setActionEntry] = useState<GratitudeEntry | null>(null);
  const pickerActionRef = useRef(false);
  const [editing, setEditing] = useState<GratitudeEntry | null>(null);
  const [editText, setEditText] = useState("");
  const [editAudioUri, setEditAudioUri] = useState<string | null>(null);
  const [editAudioName, setEditAudioName] = useState("");
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [editImageName, setEditImageName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [recordingVisible, setRecordingVisible] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const recordingActionRef = useRef(false);

  const entries = useMemo(() => allEntries.filter((entry) => localDateKey(new Date(entry.createdAt)) === date), [allEntries, date]);
  const refresh = useCallback(async () => {
    const [loadedEntries, loadedPlaylists, loadedFolders] = await Promise.all([loadGratitudeEntries(), ensureDefaultPlaylist(), loadPlaylistFolders()]);
    setAllEntries(loadedEntries);
    setPlaylists(loadedPlaylists);
    setFolders(loadedFolders);
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const remove = (entry: GratitudeEntry) => Alert.alert(
    "Notu sil",
    "Bu notu günlüğünden kaldırmak istiyor musun?",
    [
      { text: "Vazgeç", style: "cancel" },
          { text: "Sil", style: "destructive", onPress: async () => {
            const next = allEntries.filter((item) => item.id !== entry.id);
            try {
              await saveGratitudeEntries(next);
              setAllEntries(next);
              const queueIndex = playingEntries.findIndex((item) => item.id === entry.id);
              if (queueIndex >= 0) removeQueueEntry(queueIndex);
              await Promise.all([deleteManagedFile(entry.audioUri), deleteManagedFile(entry.imageUri)]);
            } catch {
          Alert.alert("Silinemedi", "Notun korunuyor. Biraz sonra yeniden deneyebilirsin.");
        }
      } },
    ],
  );

  const openEdit = (entry: GratitudeEntry) => {
    setEditing(entry);
    setEditText(entry.text);
    setEditAudioUri(entry.audioUri ?? null);
    setEditAudioName(entry.audioName ?? "");
    setEditImageUri(entry.imageUri ?? null);
    setEditImageName(entry.imageName ?? "");
  };

  const restorePlaybackAudioMode = async () => {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: listeningSettings.backgroundPlayback, interruptionMode: "doNotMix" }).catch(() => undefined);
  };

  const startEditRecording = async () => {
    if (recordingActionRef.current || savingEdit) return;
    recordingActionRef.current = true;
    try {
      const permission = await withPrivacyLockExemption(() => AudioModule.requestRecordingPermissionsAsync());
      if (!permission.granted) {
        Alert.alert("Mikrofon izni gerekli", "Kendi sesini kaydetmek için mikrofon erişimine izin vermen gerekir.");
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

  const finishEditRecording = async () => {
    if (recordingActionRef.current || !recorder.isRecording) return;
    recordingActionRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      await restorePlaybackAudioMode();
      if (!uri) throw new Error("Recording URI is missing");
      if (editAudioUri && editAudioUri !== editing?.audioUri && editAudioUri !== uri) await FileSystem.deleteAsync(editAudioUri, { idempotent: true }).catch(() => undefined);
      setEditAudioUri(uri);
      setEditAudioName(`Ses kaydı · ${formatRecordingDuration(recorderState.durationMillis)}.m4a`);
      setRecordingVisible(false);
    } catch {
      await restorePlaybackAudioMode();
      Alert.alert("Kayıt tamamlanamadı", "Ses kaydın tamamlanamadı. Yeniden deneyebilirsin.");
    } finally {
      recordingActionRef.current = false;
    }
  };

  const cancelEditRecording = async () => {
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

  const removeEditAudio = async () => {
    if (editAudioUri && editAudioUri !== editing?.audioUri) await FileSystem.deleteAsync(editAudioUri, { idempotent: true }).catch(() => undefined);
    setEditAudioUri(null);
    setEditAudioName("");
  };

  const closeEdit = async () => {
    if (editAudioUri && editAudioUri !== editing?.audioUri) await FileSystem.deleteAsync(editAudioUri, { idempotent: true }).catch(() => undefined);
    setEditing(null);
  };

  const chooseEditImage = async () => {
    try {
      const permission = await withPrivacyLockExemption(() => ImagePicker.requestMediaLibraryPermissionsAsync());
      if (!permission.granted) {
        Alert.alert("Fotoğraf izni gerekli", "Bir anı fotoğrafı eklemek için fotoğraf kitaplığı izni vermen gerekir.");
        return;
      }
      const result = await withPrivacyLockExemption(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 }));
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 15 * 1024 * 1024) {
        Alert.alert("Fotoğraf çok büyük", "15 MB’tan küçük bir fotoğraf seç.");
        return;
      }
      setEditImageUri(asset.uri);
      setEditImageName(asset.fileName || "sukran-anisi.jpg");
    } catch {
      Alert.alert("Fotoğraf eklenemedi", "Başka bir görsel seçip yeniden deneyebilirsin.");
    }
  };

  const saveEdit = async () => {
    if (!editing || !editText.trim() || savingEdit) return;
    setSavingEdit(true);
    let storedAudioUri: string | null = editAudioUri;
    let storedImageUri: string | null = editImageUri;
    try {
      if (editAudioUri && editAudioUri !== editing.audioUri) storedAudioUri = await persistPickedFile(editAudioUri, editAudioName, "gratitude-audio");
      if (editImageUri && editImageUri !== editing.imageUri) storedImageUri = await persistImageAsset(editImageUri, editImageName, "gratitude-image");
      const updatedEntry: GratitudeEntry = {
        ...editing,
        text: editText.trim(),
        audioUri: storedAudioUri ?? undefined,
        audioName: storedAudioUri ? editAudioName : undefined,
        imageUri: storedImageUri ?? undefined,
        imageName: storedImageUri ? editImageName : undefined,
      };
      const next = allEntries.map((item) => item.id === editing.id ? updatedEntry : item);
      await saveGratitudeEntries(next);
      setAllEntries(next);
      updateQueueEntry(updatedEntry);
      if (editing.audioUri && editing.audioUri !== storedAudioUri) await deleteManagedFile(editing.audioUri);
      if (editing.imageUri && editing.imageUri !== storedImageUri) await deleteManagedFile(editing.imageUri);
      if (editAudioUri && editAudioUri !== editing.audioUri) await FileSystem.deleteAsync(editAudioUri, { idempotent: true }).catch(() => undefined);
      setEditing(null);
    } catch {
      if (storedAudioUri && storedAudioUri !== editing.audioUri) await deleteManagedFile(storedAudioUri);
      if (storedImageUri && storedImageUri !== editing.imageUri) await deleteManagedFile(storedImageUri);
      Alert.alert("Kaydedilemedi", "Düzenlemen korunuyor. Lütfen yeniden dene.");
    } finally {
      setSavingEdit(false);
    }
  };

  const openPlaylistPicker = async (entry: GratitudeEntry) => {
    try {
      setPlaylists(await ensureDefaultPlaylist());
      setPickerEntry(entry);
      setPlaylistPickerOpen(true);
    } catch {
      Alert.alert("Listeler açılamadı", "Kayıtların duruyor. Biraz sonra yeniden deneyebilirsin.");
    }
  };

  const addToPlaylist = async (playlist: Playlist) => {
    if (!pickerEntry || pickerActionRef.current) return;
    pickerActionRef.current = true;
    try {
      const [latestEntries, latestPlaylists] = await Promise.all([loadGratitudeEntries(), ensureDefaultPlaylist()]);
      const nextEntries = latestEntries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry);
      const nextPlaylists = latestPlaylists.map((item) => item.id === playlist.id
        ? { ...item, entryIds: item.entryIds.includes(pickerEntry.id) ? item.entryIds : [...item.entryIds, pickerEntry.id] }
        : item);
      await Promise.all([saveGratitudeEntries(nextEntries), savePlaylists(nextPlaylists)]);
      setAllEntries(nextEntries);
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
      const [latestEntries, latestPlaylists] = await Promise.all([loadGratitudeEntries(), ensureDefaultPlaylist()]);
      const created: Playlist = { id: createLibraryId("playlist"), name, entryIds: [pickerEntry.id], createdAt: new Date().toISOString(), folderId, sortOrder: libraryItemsInFolder(latestPlaylists, folders, folderId).length };
      const nextEntries = latestEntries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry);
      const nextPlaylists = [...latestPlaylists, created];
      await Promise.all([saveGratitudeEntries(nextEntries), savePlaylists(nextPlaylists)]);
      setAllEntries(nextEntries);
      setPlaylists(nextPlaylists);
      setPlaylistPickerOpen(false);
    } catch {
      Alert.alert("Liste oluşturulamadı", "Notun korunuyor. Biraz sonra yeniden deneyebilirsin.");
    } finally {
      pickerActionRef.current = false;
    }
  };

  const entrySavedToAnyPlaylist = (entryId: string) => playlists.some((playlist) => playlist.entryIds.includes(entryId));

  const runEntryAction = (action: "edit" | "list" | "delete") => {
    const entry = actionEntry;
    if (!entry) return;
    setActionEntry(null);
    if (action === "edit") openEdit(entry);
    else if (action === "list") void openPlaylistPicker(entry);
    else remove(entry);
  };

  const heading = entries[0]
    ? new Date(entries[0].createdAt).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (value) => value.toLocaleUpperCase("tr-TR"))
    : "Gün ayrıntısı";

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Geçmişe dön">
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>GEÇMİŞTEN BİR GÜN</Text>
            <Text style={styles.title}>{heading}</Text>
            <Text style={styles.subtitle}>{entries.length} {entries.length === 1 ? "not" : "not"}</Text>
          </View>
        </View>

        <View style={styles.toolbar}>
          <Text style={styles.toolbarTitle}>O günden kalanlar</Text>
          {entries.length ? (
            <Pressable onPress={() => playEntries(entries, 0, undefined, "Geçmiş")} style={({ pressed }) => [styles.listenAll, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Bu günün notlarını dinle">
              <Ionicons name="play" size={14} color={colors.onPrimary} />
              <Text style={styles.listenText}>Tümünü Dinle</Text>
            </Pressable>
          ) : null}
        </View>

        {entries.length ? entries.map((entry, index) => <GratitudeEntryCard key={entry.id} entry={entry} index={index} active={isPlaying && playingEntries[currentIndex]?.id === entry.id} onPlay={() => playEntries(entries, index, undefined, "Geçmiş")} onMore={() => setActionEntry(entry)} onImagePress={setImagePreviewUri} />) : <EmptyState title="Bu güne ait bir not bulunmuyor" description="Bu tarihe yeni bir şükran notu eklediğinde burada görünecek." />}
      </ScrollView>

      <Modal visible={Boolean(actionEntry)} transparent animationType="fade" onRequestClose={() => setActionEntry(null)}>
        <View style={styles.actionMenuBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionEntry(null)} accessibilityRole="button" accessibilityLabel="Eylem menüsünü kapat" />
          <View style={styles.actionMenuCard}>
            <Text style={styles.actionMenuEyebrow}>KAYIT İŞLEMLERİ</Text>
            <Text style={styles.actionMenuPreview} numberOfLines={2}>{actionEntry?.text}</Text>
            <View style={styles.actionMenuRow}>
              <Pressable onPress={() => runEntryAction("edit")} style={({ pressed }) => [styles.actionMenuOption, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Notu düzenle">
                <View style={styles.actionMenuIcon}><Ionicons name="pencil-outline" size={19} color={colors.primary} /></View>
                <Text style={styles.actionMenuLabel}>Düzenle</Text>
              </Pressable>
              <Pressable onPress={() => runEntryAction("list")} style={({ pressed }) => [styles.actionMenuOption, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Listelere ekle">
                <View style={styles.actionMenuIcon}><Ionicons name={actionEntry && entrySavedToAnyPlaylist(actionEntry.id) ? "bookmark" : "bookmark-outline"} size={19} color={colors.primary} /></View>
                <Text style={styles.actionMenuLabel}>Listelere ekle</Text>
              </Pressable>
              <Pressable onPress={() => runEntryAction("delete")} style={({ pressed }) => [styles.actionMenuOption, styles.actionMenuDanger, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Notu sil">
                <View style={styles.actionMenuIcon}><Ionicons name="trash-outline" size={19} color={colors.danger} /></View>
                <Text style={[styles.actionMenuLabel, styles.actionMenuDangerText]}>Sil</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(editing)} transparent animationType="fade" onRequestClose={() => void closeEdit()}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>NOTUNU DÜZENLE</Text>
            <Text style={styles.modalTitle}>Kelimelerini gözden geçir</Text>
            <TextInput value={editText} onChangeText={setEditText} multiline autoFocus style={styles.editInput} textAlignVertical="top" />
            <View style={styles.mediaEditRow}>
              <Pressable onPress={() => void startEditRecording()} style={styles.mediaEditButton} accessibilityRole="button" accessibilityLabel={editAudioUri ? "Kendi sesini yeniden kaydet" : "Kendi sesini kaydet"}>
                <Ionicons name="mic-outline" size={16} color={colors.primary} />
                <Text numberOfLines={1} style={styles.mediaEditText}>{editAudioUri ? "Sesi yeniden kaydet" : "Sesimi kaydet"}</Text>
              </Pressable>
              {editAudioUri ? <Pressable onPress={() => void removeEditAudio()} style={styles.mediaRemove} accessibilityRole="button" accessibilityLabel="Ekli sesi kaldır"><Ionicons name="close-circle" size={20} color={colors.danger} /></Pressable> : null}
            </View>
            <View style={styles.mediaEditRow}>
              <Pressable onPress={() => void chooseEditImage()} style={styles.mediaEditButton} accessibilityRole="button" accessibilityLabel={editImageUri ? "Ekli fotoğrafı değiştir" : "Notuna fotoğraf ekle"}>
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text numberOfLines={1} style={styles.mediaEditText}>{editImageUri ? editImageName || "Fotoğrafı değiştir" : "Fotoğraf ekle"}</Text>
              </Pressable>
              {editImageUri ? <Pressable onPress={() => { setEditImageUri(null); setEditImageName(""); }} style={styles.mediaRemove} accessibilityRole="button" accessibilityLabel="Ekli fotoğrafı kaldır"><Ionicons name="close-circle" size={20} color={colors.danger} /></Pressable> : null}
            </View>
            {editImageUri ? <Pressable onPress={() => setImagePreviewUri(editImageUri)} accessibilityRole="button" accessibilityLabel="Ekli fotoğrafı büyüt"><Image source={{ uri: editImageUri }} style={styles.editImagePreview} resizeMode="cover" /></Pressable> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => void closeEdit()} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={saveEdit} disabled={!editText.trim() || savingEdit} style={({ pressed }) => [styles.save, (!editText.trim() || savingEdit) && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ disabled: !editText.trim() || savingEdit }}><Text style={styles.saveText}>{savingEdit ? "Kaydediliyor" : "Kaydet"}</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={recordingVisible} transparent animationType="fade" onRequestClose={() => void cancelEditRecording()}>
        <View style={styles.recordingBackdrop}>
          <View style={styles.recordingCard}>
            <View style={styles.recordingIcon}><Ionicons name={recorderState.isRecording ? "mic" : "mic-outline"} size={22} color={recorderState.isRecording ? colors.danger : colors.primary} /></View>
            <Text style={styles.recordingTitle}>{recorderState.isRecording ? "Sesin kaydediliyor" : "Kayıt tamamlandı"}</Text>
            <Text style={styles.recordingHint}>{recorderState.isRecording ? "Hazır olduğunda kaydı bitir. Yalnızca kendi sesin bu nota eklenir." : "Kaydı notuna ekleyebilir veya yeniden kaydedebilirsin."}</Text>
            <Text style={styles.recordingTimer}>{formatRecordingDuration(recorderState.durationMillis)}</Text>
            <Pressable onPress={() => recorderState.isRecording ? void finishEditRecording() : setRecordingVisible(false)} style={[styles.recordingPrimary, recorderState.isRecording && styles.recordingStop]} accessibilityRole="button">
              <Ionicons name={recorderState.isRecording ? "stop" : "checkmark"} size={17} color="#FFFFFF" />
              <Text style={styles.recordingPrimaryText}>{recorderState.isRecording ? "Kaydı bitir" : "Kullan"}</Text>
            </Pressable>
            <Pressable onPress={() => void cancelEditRecording()} style={styles.recordingCancel} accessibilityRole="button"><Text style={styles.recordingCancelText}>Vazgeç</Text></Pressable>
          </View>
        </View>
      </Modal>
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

const createStyles = (colors: Record<string, string>) => StyleSheet.create({
  content: { paddingBottom: 38, paddingHorizontal: 22, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", marginBottom: 28 },
  back: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", marginRight: 12, width: 44 },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.15 },
  title: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 24, marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  toolbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 11 },
  toolbarTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19 },
  listenAll: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 42, paddingHorizontal: 13 },
  listenText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
  entryCard: { alignItems: "flex-start", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", paddingVertical: 16 },
  entryCurrent: { backgroundColor: colors.soft, borderColor: colors.primary, borderRadius: 13, borderWidth: 1, paddingHorizontal: 8 },
  entryMark: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 15, height: 36, justifyContent: "center", marginRight: 10, marginTop: 1, width: 36 },
  entryCopy: { flex: 1, paddingTop: 2 },
  entryText: { color: colors.ink, fontFamily: "OpenSans", fontSize: 15, lineHeight: 24, marginRight: 5 },
  entryImage: { aspectRatio: 1.6, borderRadius: 11, marginTop: 9, width: "100%" },
  audioMeta: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 8 },
  audioMetaText: { color: colors.muted, flex: 1, fontSize: 11 },
  nowPlayingRow: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 7 },
  nowPlayingLabel: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  entryMeta: { color: colors.muted, fontSize: 12, marginTop: 7 },
  actions: { alignItems: "center", flexDirection: "column", marginLeft: 3 },
  action: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  actionMenuBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.42)", flex: 1, justifyContent: "center", padding: 22 },
  actionMenuCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, maxWidth: 420, padding: 16, width: "100%" },
  actionMenuEyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  actionMenuPreview: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 16, lineHeight: 22, marginTop: 5 },
  actionMenuRow: { flexDirection: "row", gap: 8, marginTop: 15 },
  actionMenuOption: { alignItems: "center", backgroundColor: colors.background, borderColor: colors.border, borderRadius: 13, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 82, paddingHorizontal: 4, paddingVertical: 8 },
  actionMenuIcon: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 16, height: 32, justifyContent: "center", width: 32 },
  actionMenuLabel: { color: colors.ink, fontSize: 11, fontWeight: "800", marginTop: 6, textAlign: "center" },
  actionMenuDanger: { borderColor: colors.danger },
  actionMenuDangerText: { color: colors.danger },
  empty: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 10, padding: 23 },
  emptyText: { color: colors.muted, fontSize: 13, marginTop: 9 },
  modalBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.38)", flex: 1, justifyContent: "center", padding: 22 },
  modalCard: { backgroundColor: colors.background, borderRadius: 22, padding: 20, width: "100%" },
  modalEyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.15 },
  modalTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19, marginTop: 5 },
  editInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, fontFamily: "OpenSans", fontSize: 15, lineHeight: 23, marginTop: 16, minHeight: 120, padding: 13 },
  mediaEditRow: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 7 },
  mediaEditButton: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 11, flex: 1, flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 11 },
  mediaEditText: { color: colors.primary, flex: 1, fontSize: 12, fontWeight: "700" },
  mediaRemove: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  editImagePreview: { aspectRatio: 2.1, borderRadius: 10, marginTop: 8, width: "100%" },
  imagePreviewBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.9)", flex: 1, justifyContent: "center", padding: 20 },
  imagePreview: { height: "80%", width: "100%" },
  imagePreviewClose: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 22, height: 44, justifyContent: "center", marginTop: 16, width: 44 },
  recordingBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.58)", flex: 1, justifyContent: "center", padding: 22 },
  recordingCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, maxWidth: 440, padding: 24, width: "100%" },
  recordingIcon: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 26, height: 52, justifyContent: "center", width: 52 },
  recordingTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 20, marginTop: 14 },
  recordingHint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: "center" },
  recordingTimer: { color: colors.ink, fontSize: 30, fontVariant: ["tabular-nums"], fontWeight: "700", marginVertical: 18 },
  recordingPrimary: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 48, width: "100%" },
  recordingStop: { backgroundColor: colors.danger },
  recordingPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  recordingCancel: { alignItems: "center", justifyContent: "center", marginTop: 4, minHeight: 40, width: "100%" },
  recordingCancelText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 16 },
  cancel: { alignItems: "center", borderColor: colors.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: 15 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  save: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 11, justifyContent: "center", minHeight: 44, paddingHorizontal: 17 },
  saveText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
