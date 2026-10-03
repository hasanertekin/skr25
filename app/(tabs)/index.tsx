import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { QuickGratitudeModal } from "@/components/quick-gratitude-modal";
import { loadGratitudeEntries, saveGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { usePlayer } from "@/lib/player-context";
import { getGoalProgress, loadDailyGoal } from "@/lib/daily-goal";
import { loadPreferences } from "@/lib/app-preferences";
import { PlaylistPicker } from "@/components/playlist-picker";
import { ensureDefaultPlaylist, savePlaylists, type Playlist } from "@/lib/playlists";

const colors = {
  background: "#F8F6F0",
  surface: "#FFFFFF",
  ink: "#163B2B",
  muted: "#7B8A82",
  border: "#E6E8E2",
  primary: "#2F7D5A",
  primaryDark: "#1E6043",
  primarySoft: "#E1F0E8",
  orange: "#E9905E",
};

function formatEntryTime(date: Date) {
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function HomeScreen() {
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [quickVisible, setQuickVisible] = useState(false);
  const router = useRouter();
  const { playEntries, currentIndex, isPlaying, entries: playingEntries } = usePlayer();
  const inputRef = useRef<TextInput>(null);
  const [dailyGoal, setDailyGoal] = useState(5);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [pickerEntry, setPickerEntry] = useState<GratitudeEntry | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const listRef = useRef<FlatList<GratitudeEntry>>(null);

  const refreshEntries = useCallback(async () => {
    setRefreshing(true);
    const [loadedEntries, preferences, loadedPlaylists] = await Promise.all([loadGratitudeEntries(), loadPreferences(), ensureDefaultPlaylist()]);
    setEntries(preferences.entrySort === "oldest" ? [...loadedEntries].reverse() : loadedEntries);
    setPlaylists(loadedPlaylists);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshEntries();
    }, [refreshEntries]),
  );

  useFocusEffect(useCallback(() => { loadDailyGoal().then(setDailyGoal); }, []));


  const addEntry = useCallback(async () => {
    const text = draft.trim();
    if (!text || isSaving) return;

    setIsSaving(true);
    const nextEntry: GratitudeEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: new Date().toISOString(),
    };
    const nextEntries = [nextEntry, ...entries];
    setEntries(nextEntries);
    setDraft("");
    inputRef.current?.focus();
    try {
      await saveGratitudeEntries(nextEntries);
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setIsSaving(false);
    }
  }, [draft, entries, isSaving]);

  const openPlaylistPicker = async (entry: GratitudeEntry) => { setPlaylists(await ensureDefaultPlaylist()); setPickerEntry(entry); setPlaylistPickerOpen(true); };
  const addToPlaylist = async (playlist: Playlist) => { if (!pickerEntry) return; const nextEntries = entries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry); const nextLists = playlists.map((item) => item.id === playlist.id ? { ...item, entryIds: item.entryIds.includes(pickerEntry.id) ? item.entryIds : [...item.entryIds, pickerEntry.id] } : item); setEntries(nextEntries); setPlaylists(nextLists); await saveGratitudeEntries(nextEntries); await savePlaylists(nextLists); setPlaylistPickerOpen(false); };
  const createPlaylistForEntry = async (name: string) => { if (!pickerEntry) return; const created = { id: `playlist-${Date.now()}`, name, entryIds: [pickerEntry.id], createdAt: new Date().toISOString() }; const nextEntries = entries.map((entry) => entry.id === pickerEntry.id ? { ...entry, favorite: true } : entry); const nextLists = [...playlists, created]; setEntries(nextEntries); setPlaylists(nextLists); await saveGratitudeEntries(nextEntries); await savePlaylists(nextLists); setPlaylistPickerOpen(false); };

  const todayEntries = entries.filter((entry) => {
    const now = new Date();
    const date = new Date(entry.createdAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  });
  useEffect(() => { if (!isPlaying || playingEntries.length === 0) return; const activeId = playingEntries[currentIndex]?.id; const activeIndex = todayEntries.findIndex((entry) => entry.id === activeId); if (activeIndex >= 0) listRef.current?.scrollToIndex({ index: activeIndex, animated: true, viewPosition: 0.5 }); }, [currentIndex, isPlaying, playingEntries, todayEntries]);

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
                <View>
                  <View style={styles.brandRow}>
                    <View style={styles.brandMark}>
                      <Ionicons name="leaf" size={14} color="#FFFFFF" />
                    </View>
                    <Text style={styles.brandText}>ŞÜKÜR GÜNLÜĞÜ</Text>
                  </View>
                </View>
                <View style={styles.topActions}>
                  <Pressable onPress={() => setQuickVisible(true)} style={({ pressed }) => [styles.roundButton, styles.roundButtonFilled, pressed && styles.pressed]} accessibilityLabel="Hızlı şükran yaz"><Ionicons name="flash-outline" size={18} color="#FFFFFF" /></Pressable>
                  <Pressable onPress={() => router.push("/settings")} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]} accessibilityLabel="Ayarlar"><Ionicons name="settings-outline" size={18} color={colors.primary} /></Pressable>
                </View>
              </View>

              <PlaylistPicker visible={playlistPickerOpen} playlists={playlists} onClose={() => setPlaylistPickerOpen(false)} onSelect={addToPlaylist} onCreate={createPlaylistForEntry} />
              <QuickGratitudeModal visible={quickVisible} onClose={() => setQuickVisible(false)} onSave={async (text) => {
                const nextEntry: GratitudeEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, createdAt: new Date().toISOString() };
                const nextEntries = [nextEntry, ...entries];
                setEntries(nextEntries);
                await saveGratitudeEntries(nextEntries);
              }} />

              <View style={styles.goalCard}><View style={styles.goalHeader}><View style={styles.goalIcon}><Ionicons name={todayEntries.length >= dailyGoal ? "checkmark-circle-outline" : "locate-outline"} size={19} color={colors.primary} /></View><View style={styles.goalCopy}><Text style={styles.goalTitle}>Bugünün hedefi</Text><Text style={styles.goalText}>{todayEntries.length >= dailyGoal ? `Hedefini tamamladın. ${todayEntries.length} şükran kaydettin; istersen devam edebilirsin.` : `${dailyGoal - todayEntries.length} şükran daha eklediğinde hedefin tamamlanacak.`}</Text></View></View><View style={styles.goalTrack}><View style={[styles.goalFill, { width: `${Math.min(100, (getGoalProgress(todayEntries.length, dailyGoal)) * 100)}%` }]} />{todayEntries.length > dailyGoal ? <View style={[styles.goalOverflow, { width: `${((todayEntries.length - dailyGoal) / todayEntries.length) * 100}%` }]} /> : null}{todayEntries.length > dailyGoal ? <View style={[styles.goalMarker, { left: `${(dailyGoal / todayEntries.length) * 100}%` }]} /> : null}</View><Text style={styles.goalStatus}>{todayEntries.length > dailyGoal ? `Hedefinin %${Math.round((todayEntries.length / dailyGoal - 1) * 100)} üzerindesin` : todayEntries.length === dailyGoal ? "Hedef tamamlandı" : `${todayEntries.length}/${dailyGoal} şükran`}</Text></View>

              <View style={styles.composerCard}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  ref={inputRef}
                  placeholder="Bugün şükrettiğim şey..."
                  placeholderTextColor="#A9B1AB"
                  style={styles.input}
                  textAlignVertical="top"
                  blurOnSubmit={false}
                  returnKeyType="done"
                />
                <View style={styles.composerFooter}>
                  <Pressable
                    onPress={addEntry}
                    accessibilityRole="button"
                    accessibilityLabel="Şükür maddesi ekle"
                    style={({ pressed }) => [styles.addButton, pressed && styles.pressed, (!draft.trim() || isSaving) && styles.addButtonDisabled]}
                  >
                    <Text style={styles.addButtonText}>{isSaving ? "Ekleniyor" : "Ekle"}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>



              <View style={styles.listHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Şükürlerin</Text>
                </View>
                <View style={styles.listHeaderActions}>
                  <Pressable onPress={() => playEntries(todayEntries)} disabled={todayEntries.length === 0} style={({ pressed }) => [styles.listenTodayButton, pressed && styles.pressed, todayEntries.length === 0 && styles.listenTodayDisabled]} accessibilityLabel="Bugünün şükürlerini dinle">
                    <Ionicons name="volume-high-outline" size={15} color={colors.primary} />
                    <Text style={styles.listenTodayText}>Dinle</Text>
                  </Pressable>
                  <View style={styles.totalPill}><Text style={styles.totalPillText}>{todayEntries.length}</Text></View>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="leaf-outline" size={26} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Sayfan henüz boş</Text>
              <Text style={styles.emptyText}>Aklına gelen güzel bir şeyi yukarıya yaz. Her madde, kendine verdiğin küçük bir hediye.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.entryCard}>
              <View style={[styles.entryNumber, index === 0 && styles.entryNumberHighlight]}>
                <Text style={[styles.entryNumberText, index === 0 && styles.entryNumberTextHighlight]}>{String(todayEntries.length - index).padStart(2, "0")}</Text>
              </View>
              <View style={styles.entryCopy}>
                <Text style={styles.entryText}>{item.text}</Text>
                <View style={styles.entryMeta}>
                  <Text style={styles.entryMetaText}>{formatEntryTime(new Date(item.createdAt))}</Text>
                </View>
              </View>
              <Pressable onPress={() => playEntries(todayEntries, index)} style={styles.numberPlay} accessibilityLabel="Bu kayıttan oynat"><Ionicons name="play" size={20} color={colors.primary} /></Pressable>
              <Pressable onPress={() => openPlaylistPicker(item)} accessibilityLabel="Playlist’e ekle"><Ionicons name={playlists.some((playlist) => playlist.entryIds.includes(item.id)) ? "star" : "star-outline"} size={20} color={playlists.some((playlist) => playlist.entryIds.includes(item.id)) ? colors.orange : colors.muted} /></Pressable>
            </View>
          )}
        />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingHorizontal: 22, paddingBottom: 30 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 18,
  },
  brandRow: { alignItems: "center", flexDirection: "row", marginBottom: 15 },
  brandMark: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 9,
    height: 25,
    justifyContent: "center",
    marginRight: 8,
    width: 25,
  },
  brandText: { color: colors.primary, fontSize: 14, fontWeight: "800", letterSpacing: 1.5 },
  headerDot: { backgroundColor: colors.orange, borderRadius: 4, height: 8, marginTop: 12, width: 8 },
  topActions: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 0 },
  roundButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 21, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  roundButtonFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.8, lineHeight: 35 },
  todayCard: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    flexDirection: "row",
    marginTop: 24,
    padding: 15,
  },
  todayIcon: { alignItems: "center", backgroundColor: "#FCE3D1", borderRadius: 15, height: 38, justifyContent: "center", width: 38 },
  todayCopy: { flex: 1, marginLeft: 12 },
  todayLabel: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  todayCount: { color: colors.ink, fontSize: 22, fontWeight: "800", marginTop: 2 },
  todayUnit: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  todayLeaf: { alignItems: "center", backgroundColor: "#CDE7D8", borderRadius: 17, height: 34, justifyContent: "center", width: 34 },
  listenTodayButton: { alignItems: "center", alignSelf: "flex-start", backgroundColor: "#EEF5F0", borderRadius: 12, flexDirection: "row", gap: 7, marginTop: 9, paddingHorizontal: 14, paddingVertical: 11 },
  listenTodayDisabled: { opacity: 0.45 },
  listenTodayText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  listHeaderActions: { alignItems: "center", flexDirection: "row", gap: 7 },
  inspirationCard: { alignItems: "center", backgroundColor: "#FFF4E8", borderRadius: 15, flexDirection: "row", marginBottom: 12, padding: 12 }, inspirationText: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: "600", marginLeft: 8 },
  composerCard: {
    minHeight: 230,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 15,
    padding: 16,
  },
  composerTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  composerTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  input: { color: colors.ink, fontFamily: "PlayfairDisplay", fontSize: 16, lineHeight: 24, minHeight: 135, paddingTop: 15 },
  composerFooter: { alignItems: "center", flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  addButton: { alignItems: "center", backgroundColor: colors.primaryDark, borderRadius: 13, flexDirection: "row", gap: 8, paddingHorizontal: 15, paddingVertical: 10 },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  goalCard: { backgroundColor: "#EAF3ED", borderColor: "#D5E8DA", borderRadius: 20, borderWidth: 1, marginTop: 14, padding: 15 }, goalHeader: { alignItems: "center", flexDirection: "row" }, goalIcon: { alignItems: "center", backgroundColor: "#D2E9D9", borderRadius: 15, height: 32, justifyContent: "center", width: 32 }, goalCopy: { flex: 1, marginLeft: 10 }, goalTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" }, goalText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, goalTrack: { backgroundColor: "#CFE3D4", borderRadius: 4, height: 8, marginTop: 16, overflow: "visible", position: "relative" }, goalFill: { backgroundColor: colors.primary, borderRadius: 4, height: 8 }, goalOverflow: { backgroundColor: colors.primaryDark, borderRadius: 3, height: 7, position: "absolute", right: 0 }, goalMarker: { backgroundColor: colors.ink, height: 18, position: "absolute", top: -5, width: 2 }, goalStatus: { color: colors.primary, fontSize: 11, fontWeight: "800", marginTop: 10, textAlign: "right" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  listHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12, marginTop: 28 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  totalPill: { alignItems: "center", backgroundColor: colors.orange, borderRadius: 13, height: 28, justifyContent: "center", minWidth: 28, paddingHorizontal: 8 },
  totalPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  entryCard: { alignItems: "flex-start", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", marginBottom: 0, paddingVertical: 20 },
  entryNumber: { alignItems: "center", justifyContent: "flex-start", marginRight: 14, paddingTop: 3, width: 28 },
  entryNumberHighlight: { backgroundColor: colors.primarySoft },
  entryNumberText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  entryNumberTextHighlight: { color: colors.primary },
  entryCopy: { flex: 1, marginRight: 10 },
  entryText: { color: colors.ink, fontFamily: "OpenSans", fontSize: 15, fontWeight: "400", lineHeight: 27 },
  entryMeta: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 9 },
  entryMetaText: { color: colors.muted, fontFamily: "OpenSans", fontSize: 11 },
  numberPlay: { alignItems: "center", justifyContent: "center", marginLeft: 3, marginTop: 3, width: 28 },
  emptyState: { alignItems: "center", backgroundColor: "#F1EDE2", borderRadius: 20, paddingHorizontal: 24, paddingVertical: 27 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 19, height: 48, justifyContent: "center", marginBottom: 11, width: 48 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: "center" },
});
