import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ScreenContainer } from "@/components/screen-container";
import { AppTopActions } from "@/components/app-top-actions";
import { localDateKey, loadGratitudeEntries, pickRandomEntries, type GratitudeEntry } from "@/lib/gratitude";
import { getMonthGrid } from "@/lib/calendar";
import { usePlayer } from "@/lib/player-context";
import { useThemeContext } from "@/lib/theme-provider";

type DayGroup = { key: string; date: Date; entries: GratitudeEntry[] };

function formatDay(date: Date) {
  return date.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (value) => value.toLocaleUpperCase("tr-TR"));
}

export default function HistoryScreen() {
  const router = useRouter();
  const { playEntries } = usePlayer();
  const { palette } = useThemeContext();
  const colors = useMemo(() => ({
    surface: palette.surface,
    ink: palette.foreground,
    muted: palette.muted,
    border: palette.border,
    primary: palette.primary,
    soft: palette.soft,
    onPrimary: palette.onPrimary,
  }), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [search, setSearch] = useState("");
  const [visibleGroupCount, setVisibleGroupCount] = useState(20);
  const loadMoreLock = useRef(false);
  const [randomCount, setRandomCount] = useState("7");
  const [refreshing, setRefreshing] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 12);
  });

  const refreshEntries = useCallback(async () => {
    setRefreshing(true);
    try {
      setEntries(await loadGratitudeEntries());
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void refreshEntries(); }, [refreshEntries]));

  const groups = useMemo<DayGroup[]>(() => {
    const byDate = new Map<string, DayGroup>();
    entries.forEach((entry) => {
      const date = new Date(entry.createdAt);
      const key = localDateKey(date);
      const group = byDate.get(key);
      if (group) group.entries.push(entry);
      else byDate.set(key, { key, date, entries: [entry] });
    });
    return Array.from(byDate.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [entries]);
  const visibleGroups = groups.slice(0, visibleGroupCount);

  const query = search.trim().toLocaleLowerCase("tr-TR");
  const filtered = useMemo(() => query
    ? entries.filter((entry) => entry.text.toLocaleLowerCase("tr-TR").includes(query))
    : [], [entries, query]);

  const calendarDays = useMemo(() => getMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()), [calendarMonth]);
  const entryCountsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const key = localDateKey(new Date(entry.createdAt));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [entries]);
  const todayKey = localDateKey(new Date());
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth()).padStart(2, "0")}`;
  const shownMonthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()).padStart(2, "0")}`;
  const canGoForward = shownMonthKey < currentMonthKey;
  const changeMonth = (delta: -1 | 1) => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1, 12));

  const playRandom = () => {
    const count = Math.max(1, Math.min(entries.length, Number.parseInt(randomCount, 10) || 1));
    if (entries.length) playEntries(pickRandomEntries(entries, count), 0, undefined, "Geçmiş · rastgele");
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshEntries} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={200}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const nearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 260;
          if (query && loadMoreLock.current) loadMoreLock.current = false;
          if (!nearBottom) loadMoreLock.current = false;
          if (!query && nearBottom && !loadMoreLock.current && visibleGroupCount < groups.length) {
            loadMoreLock.current = true;
            setVisibleGroupCount((count) => Math.min(count + 20, groups.length));
          }
        }}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ZAMANDA KÜÇÜK BİR YOLCULUK</Text>
            <Text style={styles.title}>Geçmişin</Text>
          </View>
          <AppTopActions />
        </View>
        <Text style={styles.intro}>İyi gelen anlarına dilediğin zaman geri dön.</Text>

        {!query ? (
          <>
            <View style={styles.listenCard}>
              <View style={styles.listenIcon}><Ionicons name="shuffle-outline" size={20} color={colors.primary} /></View>
              <View style={styles.listenCopy}>
                <Text style={styles.listenTitle}>Rastgele notlarını dinle</Text>
                <Text style={styles.listenSubtitle}>Kaç kayıt çalsın?</Text>
              </View>
              <TextInput
                value={randomCount}
                onChangeText={(value) => setRandomCount(value.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                maxLength={3}
                style={styles.randomInput}
                accessibilityLabel="Rastgele çalınacak kayıt sayısı"
                selectTextOnFocus
              />
              <Pressable
                onPress={playRandom}
                disabled={!entries.length}
                style={({ pressed }) => [styles.randomButton, !entries.length && styles.disabled, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Seçilen sayıda rastgele notu dinle"
                accessibilityState={{ disabled: !entries.length }}
              >
                <Ionicons name="play" size={17} color={colors.onPrimary} />
              </Pressable>
            </View>
            <View style={styles.calendarCard}>
              <View style={styles.calendarHeader}>
                <Text style={styles.calendarTitle}>{calendarMonth.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }).replace(/^./, (letter) => letter.toLocaleUpperCase("tr-TR"))}</Text>
                <View style={styles.calendarNav}>
                  <Pressable onPress={() => changeMonth(-1)} style={({ pressed }) => [styles.calendarNavButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Önceki ay" hitSlop={4}>
                    <Ionicons name="chevron-back" size={18} color={colors.ink} />
                  </Pressable>
                  <Pressable onPress={() => changeMonth(1)} disabled={!canGoForward} style={({ pressed }) => [styles.calendarNavButton, !canGoForward && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Sonraki ay" accessibilityState={{ disabled: !canGoForward }} hitSlop={4}>
                    <Ionicons name="chevron-forward" size={18} color={colors.ink} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.calendarGrid}>
                {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"].map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
                {calendarDays.map((date, index) => {
                  if (!date) return <View key={`blank-${index}`} style={styles.calendarDay} />;
                  const dateKey = localDateKey(date);
                  const count = entryCountsByDate.get(dateKey) ?? 0;
                  const isToday = dateKey === todayKey;
                  const future = dateKey > todayKey;
                  return (
                    <Pressable
                      key={dateKey}
                      onPress={() => router.push({ pathname: "/history/[date]", params: { date: dateKey } })}
                      disabled={future}
                      style={({ pressed }) => [styles.calendarDay, count > 0 && styles.calendarDayHasEntry, isToday && styles.calendarToday, future && styles.calendarFuture, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`${date.getDate()} ${calendarMonth.toLocaleDateString("tr-TR", { month: "long" })}${count ? `, ${count} şükran kaydı` : ", kayıt yok"}`}
                      accessibilityState={{ disabled: future }}
                      hitSlop={4}
                    >
                      <Text style={[styles.calendarDayText, count > 0 && styles.calendarDayTextHasEntry, isToday && styles.calendarTodayText]}>{date.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.calendarHint}>İşaretli günlerde kayıtların var; bir güne dokunup açabilirsin.</Text>
            </View>
          </>
        ) : null}

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={19} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Notlarında ara"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="Geçmişindeki notlarda ara"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
              <Ionicons name="close-circle" size={19} color={colors.muted} />
            </Pressable>
          ) : null}
          <Text style={styles.searchCount}>{query ? filtered.length : entries.length}</Text>
        </View>

        {query ? (
          filtered.length ? (
            <View>
              <View style={styles.resultsHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Eşleşen notlar</Text>
                  <Text style={styles.sectionSubtitle}>{filtered.length} şükran bulundu</Text>
                </View>
                <Pressable onPress={() => playEntries(filtered, 0, undefined, "Geçmiş · arama")} style={({ pressed }) => [styles.listenAll, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Bulunan notları dinle">
                  <Ionicons name="play" size={14} color={colors.onPrimary} />
                  <Text style={styles.listenAllText}>Dinle</Text>
                </Pressable>
              </View>
              {filtered.map((entry, index) => (
                <Pressable key={entry.id} onPress={() => playEntries(filtered, index, undefined, "Geçmiş · arama")} style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Bu notu dinle">
                  <View style={styles.resultMark}><Ionicons name="leaf-outline" size={16} color={colors.primary} /></View>
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultText}>{entry.text}</Text>
                    <Text style={styles.resultMeta}>{new Date(entry.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={23} color={colors.primary} />
              <Text style={styles.emptyTitle}>Bu sözlerle eşleşen bir not yok</Text>
              <Text style={styles.emptyText}>Başka bir kelime deneyebilir ya da aramayı temizleyebilirsin.</Text>
            </View>
          )
        ) : groups.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Ionicons name="book-outline" size={24} color={colors.primary} /></View>
            <Text style={styles.emptyTitle}>Geçmişin zamanla oluşacak</Text>
            <Text style={styles.emptyText}>Yazdığın notlar burada gün gün, istediğin zaman dönmen için saklanır.</Text>
          </View>
        ) : (
          <View style={styles.dayList}>
            {visibleGroups.map((group) => {
              const isToday = group.key === localDateKey(new Date());
              return (
                <Pressable
                  key={group.key}
                  onPress={() => router.push({ pathname: "/history/[date]", params: { date: group.key } })}
                  style={({ pressed }) => [styles.dayCard, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${isToday ? "Bugün" : formatDay(group.date)}, ${group.entries.length} not`}
                >
                  <View style={styles.dayIcon}><Ionicons name={isToday ? "sunny-outline" : "calendar-outline"} size={19} color={colors.primary} /></View>
                  <View style={styles.dayCopy}>
                    <Text style={styles.dayTitle}>{isToday ? "Bugün" : formatDay(group.date)}</Text>
                  </View>
                  <View style={styles.dayCount}><Text style={styles.dayCountText}>{group.entries.length}</Text></View>
                  <Ionicons name="chevron-forward" size={19} color={colors.muted} />
                </Pressable>
              );
            })}
            {visibleGroups.length < groups.length ? <Text style={styles.loadMoreHint}>Aşağı kaydırdıkça daha eski günler yüklenecek.</Text> : null}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const createStyles = (colors: Record<string, string>) => StyleSheet.create({
  content: { paddingBottom: 38, paddingHorizontal: 22, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 30, marginTop: 4 },
  intro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 18, marginTop: 6 },
  listenCard: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 18, flexDirection: "row", marginBottom: 14, minHeight: 75, padding: 12 },
  calendarCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginBottom: 14, padding: 13 },
  calendarHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  calendarTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 17 },
  calendarNav: { flexDirection: "row", gap: 5 },
  calendarNavButton: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { color: colors.muted, fontSize: 11, fontWeight: "700", height: 28, lineHeight: 24, textAlign: "center", width: "14.2857%" },
  calendarDay: { alignItems: "center", aspectRatio: 1, borderColor: "transparent", borderRadius: 20, borderWidth: 1, justifyContent: "center", position: "relative", width: "14.2857%" },
  calendarDayHasEntry: { backgroundColor: colors.soft, borderRadius: 18 },
  calendarToday: { borderColor: colors.primary },
  calendarFuture: { opacity: 0.35 },
  calendarDayText: { color: colors.ink, fontSize: 13, fontWeight: "600", height: 28, includeFontPadding: false, lineHeight: 20, paddingBottom: 0, paddingTop: 0, textAlign: "center", textAlignVertical: "center", transform: [{ translateY: -2 }], width: 28 },
  calendarDayTextHasEntry: { color: colors.primary, fontWeight: "800" },
  calendarTodayText: { fontWeight: "900" },
  calendarHint: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 7 },
  listenIcon: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 16, height: 40, justifyContent: "center", width: 40 },
  listenCopy: { flex: 1, marginHorizontal: 10 },
  listenTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  listenSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  randomInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.ink, fontSize: 16, fontWeight: "800", height: 42, marginRight: 7, paddingHorizontal: 8, textAlign: "center", width: 50 },
  randomButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 22, height: 42, justifyContent: "center", width: 42 },
  searchBox: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 15, borderWidth: 1, flexDirection: "row", marginBottom: 16, minHeight: 50, paddingHorizontal: 13 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 14, height: 48, marginLeft: 9 },
  clearButton: { alignItems: "center", height: 40, justifyContent: "center", width: 34 },
  searchCount: { color: colors.primary, fontSize: 12, fontWeight: "800", marginLeft: 4, minWidth: 18, textAlign: "right" },
  resultsHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 9 },
  sectionTitle: { color: colors.ink, fontFamily: "PlayfairDisplaySemiBold", fontSize: 18 },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  listenAll: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 40, paddingHorizontal: 12 },
  listenAllText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
  resultCard: { alignItems: "flex-start", borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", paddingVertical: 16 },
  resultMark: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 14, height: 34, justifyContent: "center", marginRight: 11, width: 34 },
  resultCopy: { flex: 1 },
  resultText: { color: colors.ink, fontFamily: "PlayfairDisplay", fontSize: 17, lineHeight: 26 },
  resultMeta: { color: colors.muted, fontSize: 12, marginTop: 7 },
  emptyState: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginTop: 24, paddingHorizontal: 24, paddingVertical: 26 },
  emptyIcon: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 21, height: 48, justifyContent: "center", marginBottom: 11, width: 48 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", marginTop: 10, textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 5, textAlign: "center" },
  dayList: { gap: 9 },
  loadMoreHint: { color: colors.muted, fontSize: 11, lineHeight: 17, paddingVertical: 12, textAlign: "center" },
  dayCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 17, borderWidth: 1, flexDirection: "row", minHeight: 68, paddingHorizontal: 13, paddingVertical: 12 },
  dayIcon: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 17, height: 38, justifyContent: "center", width: 38 },
  dayCopy: { flex: 1, marginLeft: 11 },
  dayTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  dayCount: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 12, height: 30, justifyContent: "center", marginRight: 9, minWidth: 30, paddingHorizontal: 8 },
  dayCountText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
