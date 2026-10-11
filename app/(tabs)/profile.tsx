import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Alert, Animated, Image, Modal, PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/ui/screen-header";
import { getDayChart, getMonthsOfYearChart, getWeeksChart, getYearsChart, isToday, isWithinCurrentMonth, isWithinCurrentWeek, loadGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { loadProfilePreferences, saveProfilePreferences, type ProfilePreferences } from "@/lib/app-preferences";
import { getLevelForCount, getRankForCount, RANKS } from "@/lib/profile-ranks";
import { getBadges, type Badge } from "@/lib/gamification";
import { persistPickedFile } from "@/lib/local-files";
import { withPrivacyLockExemption } from "@/lib/privacy-lock-exemption";
import { useThemeContext } from "@/lib/theme-provider";

type ChartRange = "day" | "week" | "month" | "year";
const rankIcons = { Piyon: "♟", At: "♞", Fil: "♝", Kale: "♜", Vezir: "♛", Şah: "♚" } as const;
const rangeLabels: Record<ChartRange, string> = { day: "Gün", week: "Hafta", month: "Ay", year: "Yıl" };

function GamificationPanel({ entries }: { entries: GratitudeEntry[] }) {
  const { palette } = useThemeContext();
  const colors = palette;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const allBadges = getBadges(entries);
  const [allOpen, setAllOpen] = useState(false);
  const badges = allBadges.filter((badge) => badge.unlocked).slice(-6).reverse();
  const unlockedBadgeCount = allBadges.filter((badge) => badge.unlocked).length;

  return (
    <View style={styles.badgeSection}>
      <View style={styles.badgeCard}>
        <View style={styles.badgeHeader}>
          <View>
            <Text style={styles.sectionTitle}>Rozet koleksiyonun</Text>
            <Text style={styles.chartSub}>Kazandığın rozetler burada birikir.</Text>
          </View>
          <Text style={styles.badgeTotal}>{unlockedBadgeCount}/{allBadges.length}</Text>
        </View>
        {badges.length ? (
          <View style={styles.badgeGrid}>
            {badges.map((badge) => (
              <View key={badge.id} style={styles.badgeItem}>
                <Ionicons name={badge.icon as keyof typeof Ionicons.glyphMap} size={24} color={colors.primary} />
                <Text numberOfLines={1} style={styles.badgeName}>{badge.title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.badgeEmpty}>İlk rozetin, günlükteki ilk kayıtlarınla açılacak.</Text>
        )}
        <Pressable onPress={() => setAllOpen(true)} style={({ pressed }) => [styles.allBadgesButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Tüm rozetleri göster">
          <Text style={styles.allBadgesText}>Tüm rozetleri göster</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      </View>
      <Modal visible={allOpen} transparent animationType="fade" onRequestClose={() => setAllOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.sectionTitle}>Tüm rozetler</Text>
              <Pressable onPress={() => setAllOpen(false)} style={styles.modalClose} accessibilityRole="button" accessibilityLabel="Rozet penceresini kapat">
                <Ionicons name="close" size={21} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView style={styles.badgeScroll} contentContainerStyle={styles.badgeScrollContent}>
              {allBadges.map((badge) => (
                <View key={badge.id} style={[styles.badgeRow, !badge.unlocked && styles.badgeLocked]}>
                  <Ionicons name={badge.icon as keyof typeof Ionicons.glyphMap} size={22} color={badge.unlocked ? colors.primary : colors.muted} />
                  <View style={styles.badgeRowCopy}>
                    <Text style={styles.badgeRowTitle}>{badge.title}</Text>
                    <Text style={styles.badgeRowDescription}>{badge.description}</Text>
                  </View>
                  <Ionicons name={badge.unlocked ? "checkmark-circle" : "lock-closed-outline"} size={18} color={badge.unlocked ? colors.primary : colors.muted} />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function ProfileScreen() {
  const { palette } = useThemeContext();
  const colors = useMemo<Record<string, string>>(() => ({
    ...palette,
    ink: palette.foreground,
    orange: palette.warning,
    orangeSoft: palette.soft,
  }), [palette]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<GratitudeEntry[]>([]);
  const [range, setRange] = useState<ChartRange>("day");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<ProfilePreferences>({ displayName: "", bio: "", avatarUri: null });
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const confetti = useRef(new Animated.Value(0)).current;
  const rhythmScale = useRef(new Animated.Value(1)).current;
  const rhythmProgress = useRef(new Animated.Value(0)).current;
  const rankSymbolMotion = useRef(new Animated.Value(0)).current;
  const badgeCardScale = useRef(new Animated.Value(0.86)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [newBadge, setNewBadge] = useState<Badge | null>(null);

  const showBadgeCelebration = useCallback((badge: Badge) => {
    setNewBadge(badge);
    badgeCardScale.setValue(0.86);
    Animated.spring(badgeCardScale, { toValue: 1, useNativeDriver: true, damping: 13, stiffness: 170 }).start();
  }, [badgeCardScale]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [loadedEntries, loadedProfile] = await Promise.all([loadGratitudeEntries(), loadProfilePreferences()]);
      setEntries(loadedEntries);
      setProfile(loadedProfile);
      try {
        const unlocked = getBadges(loadedEntries).filter((badge) => badge.unlocked);
        const seenValue = await AsyncStorage.getItem("gratitude_seen_badges_v1");
        const seenIds: string[] = seenValue ? JSON.parse(seenValue) : [];
        const seen = new Set(seenIds);
        const newlyUnlocked = unlocked.filter((badge) => !seen.has(badge.id));
        if (newlyUnlocked.length) showBadgeCelebration(newlyUnlocked[newlyUnlocked.length - 1]);
        await AsyncStorage.setItem("gratitude_seen_badges_v1", JSON.stringify([...new Set([...seenIds, ...unlocked.map((badge) => badge.id)])]));
      } catch {
        // Badge state is a best-effort local enhancement; it must not block profile loading.
      }
    } catch {
      Alert.alert("Yüklenemedi", "Profil bilgileri şu an yenilenemedi. Biraz sonra yeniden deneyebilirsin.");
    } finally {
      setRefreshing(false);
    }
  }, [showBadgeCelebration]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);

  const last21 = useMemo(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 20);
    return entries.filter((entry) => new Date(entry.createdAt) >= since);
  }, [entries]);
  const rank = getRankForCount(last21.length);
  const previousRank = getRankForCount(Math.max(0, last21.length - 1));

  useEffect(() => {
    if (rank.name !== previousRank.name && last21.length > 0) {
      Animated.sequence([
        Animated.timing(confetti, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(confetti, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]).start();
    }
  }, [confetti, last21.length, previousRank.name, rank.name]);

  useEffect(() => {
    const scaleAnimation = Animated.sequence([
      Animated.timing(rhythmScale, { toValue: 1.1, duration: 170, useNativeDriver: true }),
      Animated.spring(rhythmScale, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 180 }),
    ]);
    const fillAnimation = Animated.timing(rhythmProgress, {
      toValue: Math.min(1, last21.length / 1260),
      duration: 650,
      useNativeDriver: false,
    });
    scaleAnimation.start();
    fillAnimation.start();
    return () => { scaleAnimation.stop(); fillAnimation.stop(); };
  }, [last21.length, rhythmProgress, rhythmScale]);

  useEffect(() => {
    rankSymbolMotion.stopAnimation();
    if (reduceMotion) {
      rankSymbolMotion.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(rankSymbolMotion, { toValue: 1, duration: 2100, useNativeDriver: true }),
      Animated.timing(rankSymbolMotion, { toValue: 0, duration: 2100, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [rankSymbolMotion, reduceMotion]);

  const today = entries.filter((entry) => isToday(new Date(entry.createdAt))).length;
  const week = entries.filter((entry) => isWithinCurrentWeek(new Date(entry.createdAt))).length;
  const month = entries.filter((entry) => isWithinCurrentMonth(new Date(entry.createdAt))).length;
  const earliest = entries.reduce<Date | null>((min, entry) => {
    const date = new Date(entry.createdAt);
    return !min || date < min ? date : min;
  }, null);
  const startWeek = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
    return copy;
  };
  const now = new Date();
  const earliestDays = earliest
    ? Math.max(0, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(earliest.getFullYear(), earliest.getMonth(), earliest.getDate())) / 86400000))
    : 0;
  const earliestWeeks = earliest ? Math.max(0, Math.round((startWeek(now).getTime() - startWeek(earliest).getTime()) / 604800000)) : 0;
  const earliestYears = earliest ? Math.max(0, now.getFullYear() - earliest.getFullYear()) : 0;
  const periodLimit = range === "day"
    ? -earliestDays
    : range === "week"
      ? -earliestWeeks
      : range === "month"
        ? -earliestYears
        : -Math.floor(earliestYears / 6);
  const shiftPeriod = useCallback((delta: number) => {
    setPeriodOffset((current) => Math.max(periodLimit, Math.min(0, current + delta)));
  }, [periodLimit]);
  useEffect(() => {
    setPeriodOffset((current) => Math.max(periodLimit, Math.min(0, current)));
  }, [periodLimit]);
  const reference = new Date();
  const safeOffset = Math.max(periodLimit, Math.min(0, periodOffset));
  if (range === "day") reference.setDate(reference.getDate() + safeOffset);
  if (range === "month") reference.setFullYear(reference.getFullYear() + safeOffset);
  if (range === "year") reference.setFullYear(reference.getFullYear() + safeOffset * 6);
  if (range === "week") reference.setDate(reference.getDate() + safeOffset * 7);
  const data = range === "day"
    ? getDayChart(entries, reference)
    : range === "month"
      ? getMonthsOfYearChart(entries, reference)
      : range === "year"
      ? getYearsChart(entries, reference)
      : getWeeksChart(entries, reference);
  const formatPeriodDate = (date: Date) => date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
  const periodLabel = (() => {
    if (range === "month") return String(reference.getFullYear());
    if (range === "year") return `${reference.getFullYear() - 5}–${reference.getFullYear()}`;
    if (range === "day") {
      const start = new Date(reference);
      start.setDate(start.getDate() - 6);
      return `${formatPeriodDate(start)} – ${formatPeriodDate(reference)}`;
    }
    const currentWeek = startWeek(reference);
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - 42);
    const end = new Date(currentWeek);
    end.setDate(end.getDate() + 6);
    return `${formatPeriodDate(start)} – ${formatPeriodDate(end)}`;
  })();
  const max = Math.max(...data.map((item) => item.value), 1);
  // Profil ayarları cihazda tutulur; Google hesabı/yedekleme entegrasyonu daha sonra ayrıca eklenecek.
  const displayName = profile.displayName.trim() || "Şükür yolcusu";
  const avatar = profile.avatarUri;
  const nextRank = RANKS.find((item) => item.min > last21.length);

  const chartGesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -30) shiftPeriod(-1);
      if (gesture.dx > 30) shiftPeriod(1);
    },
  }), [shiftPeriod]);

  const openEditor = () => {
    setNameDraft(profile.displayName);
    setEditOpen(true);
  };

  const saveProfile = async () => {
    const next = { ...profile, displayName: nameDraft.trim() };
    try {
      await saveProfilePreferences(next);
      setProfile(next);
      setEditOpen(false);
    } catch {
      Alert.alert("Kaydedilemedi", "Profil değişikliğin saklanamadı. Lütfen yeniden dene.");
    }
  };

  const choosePhoto = async () => {
    try {
      const result = await withPrivacyLockExemption(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 }));
      if (!result.canceled) {
        const asset = result.assets[0];
        const avatarUri = await persistPickedFile(asset.uri, asset.fileName ?? undefined, "profile-avatar");
        setProfile((current) => ({ ...current, avatarUri }));
      }
    } catch {
      Alert.alert("Fotoğraf açılamadı", "Fotoğraf seçimini şu an tamamlayamadık.");
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader eyebrow="KENDİNE AYIRDIĞIN ALAN" title="Profilin" intro="Küçük alışkanlıklarını, ritmini ve iyi gelen anlarını burada gör." />

        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.avatarFrame}>
              {avatar
                ? <Image source={{ uri: avatar }} style={styles.avatarImage} />
                : <View style={styles.avatar}><Text style={styles.avatarText}>{displayName.charAt(0).toLocaleUpperCase("tr-TR")}</Text></View>}
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.greeting}>{displayName}</Text>
              <Text style={styles.profileHint}>Kendine ayırdığın kişisel alan</Text>
            </View>
            <Pressable onPress={openEditor} style={({ pressed }) => [styles.profileEdit, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Profilini düzenle">
              <Ionicons name="pencil-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.rankCard}>
          <View style={styles.rankRow}>
            <Animated.View style={[styles.rankBadge, { transform: [{ scale: rhythmScale }] }]}>
              <Animated.Text style={[styles.rankSymbol, { transform: [
                { translateY: rankSymbolMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -2, 0] }) },
                { rotate: rankSymbolMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "-4deg", "0deg"] }) },
                { scale: rankSymbolMotion.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.05, 1] }) },
              ] }]}>{rankIcons[rank.name as keyof typeof rankIcons]}</Animated.Text>
            </Animated.View>
            <View style={styles.rankCopy}>
              <Text style={styles.rankEyebrow}>SON 21 GÜNDEKİ RİTMİN</Text>
              <Text style={styles.rankName}>{rank.name} <Text style={styles.rankLevel}>· Seviye {getLevelForCount(last21.length)}</Text></Text>
            </View>
            <Text style={styles.rankCount}>{last21.length} kayıt</Text>
          </View>
          <View style={styles.rankTrack}><Animated.View style={[styles.rankFill, { width: rhythmProgress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} /></View>
          <Text style={styles.rankHint}>
            {rank.name === "Şah" ? "Şah rütbesine ulaştın; muhteşem bir istikrar!" : `Bir sonraki rütbe için ${Math.max(0, (nextRank?.min || 1260) - last21.length)} şükran daha.`}
          </Text>
        </View>

        <Animated.View pointerEvents="none" style={[styles.confetti, { opacity: confetti }]}>
          <Text style={styles.confettiText}>✦  ✧  ✦  ✧  ✦</Text>
        </Animated.View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Özet</Text>
          <Text style={styles.summaryTotal}>{entries.length} toplam kayıt</Text>
        </View>
        <View style={styles.statsGrid}>
          <View style={[styles.stat, { backgroundColor: colors.soft }]}><Text style={styles.statValue}>{today}</Text><Text style={styles.statLabel}>Bugün</Text></View>
          <View style={[styles.stat, { backgroundColor: colors.orangeSoft }]}><Text style={styles.statValue}>{week}</Text><Text style={styles.statLabel}>Bu hafta</Text></View>
          <View style={[styles.stat, { backgroundColor: colors.border }]}><Text style={styles.statValue}>{month}</Text><Text style={styles.statLabel}>Bu ay</Text></View>
        </View>

        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.sectionTitle}>Şükür ritmin</Text>
            <Text style={styles.chartSub}>{periodLabel}</Text>
            <Text style={styles.chartGestureHint}>Oklarla ya da grafiği kaydırarak dönemi değiştir.</Text>
          </View>
          <View style={styles.chartNav}>
            <Pressable onPress={() => shiftPeriod(-1)} disabled={safeOffset <= periodLimit} style={[styles.navButton, safeOffset <= periodLimit && styles.navDisabled]} accessibilityRole="button" accessibilityLabel="Önceki dönem" accessibilityState={{ disabled: safeOffset <= periodLimit }}>
              <Ionicons name="chevron-back" size={17} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => shiftPeriod(1)} disabled={safeOffset >= 0} style={[styles.navButton, safeOffset >= 0 && styles.navDisabled]} accessibilityRole="button" accessibilityLabel="Sonraki dönem" accessibilityState={{ disabled: safeOffset >= 0 }}>
              <Ionicons name="chevron-forward" size={17} color={colors.primary} />
            </Pressable>
          </View>
        </View>
        <View style={styles.chartCard} {...chartGesture.panHandlers}>
          <View style={styles.chartCardTop}>
            <Text style={styles.chartTotal}>{entries.length} kayıt</Text>
            <View style={styles.switcher}>
              {(["day", "week", "month", "year"] as ChartRange[]).map((item) => (
                <Pressable key={item} onPress={() => { setRange(item); setPeriodOffset(0); }} style={[styles.switchButton, range === item && styles.switchActive]} accessibilityRole="radio" accessibilityState={{ selected: range === item }}>
                  <Text style={[styles.switchText, range === item && styles.switchTextActive]}>{rangeLabels[item]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.chart}>
            {data.map((item, index) => (
              <View key={`${item.label}-${index}`} style={styles.barCol}>
                <View style={styles.barTrack}><View style={[styles.bar, { height: item.value ? Math.max(14, (item.value / max) * 104) : 7 }]} /></View>
                <Text style={styles.barValue}>{item.value}</Text>
                <Text numberOfLines={1} style={styles.barLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          {data.every((item) => item.value === 0) ? <Text style={styles.chartEmpty}>Bu dönemde kayıt bulunmuyor.</Text> : null}
        </View>

        <GamificationPanel entries={entries} />
      </ScrollView>

      <Modal visible={Boolean(newBadge)} transparent animationType="fade" onRequestClose={() => setNewBadge(null)}>
        <View style={styles.backdrop}>
          <Animated.View style={[styles.badgeCelebrationCard, { transform: [{ scale: badgeCardScale }] }]}>
            <View style={styles.badgeCelebrationIcon}>
              <Ionicons name={(newBadge?.icon ?? "sparkles-outline") as keyof typeof Ionicons.glyphMap} size={38} color={colors.primary} />
            </View>
            <Text style={styles.badgeCelebrationEyebrow}>YENİ BİR ROZET</Text>
            <Text style={styles.badgeCelebrationTitle}>Tebrikler!</Text>
            <Text style={styles.badgeCelebrationCopy}>{newBadge?.title} rozetini kazandın. {newBadge?.description} — güzel anlarını kaydetmeye devam edebilirsin.</Text>
            <Pressable onPress={() => setNewBadge(null)} style={styles.badgeCelebrationButton} accessibilityRole="button" accessibilityLabel="Rozet kutlamasını kapat">
              <Text style={styles.badgeCelebrationButtonText}>Teşekkürler</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalEyebrow}>PROFİLİNİ DÜZENLE</Text>
            <Text style={styles.modalTitle}>Sana nasıl hitap edelim?</Text>
            <Pressable onPress={choosePhoto} style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]} accessibilityRole="button">
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.photoButtonText}>Profil fotoğrafını değiştir</Text>
            </Pressable>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Ad soyad"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              returnKeyType="done"
              maxLength={48}
              accessibilityLabel="Profilde görünecek isim"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditOpen(false)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>Vazgeç</Text></Pressable>
              <Pressable onPress={saveProfile} style={({ pressed }) => [styles.save, pressed && styles.pressed]}><Text style={styles.saveText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const createStyles = (colors: Record<string, string>) => StyleSheet.create({
  content: { flexGrow: 1, padding: 22, paddingBottom: 40 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: colors.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 30, marginTop: 4 },
  profileCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, elevation: 2, padding: 18, shadowColor: colors.foreground, shadowOpacity: 0.04, shadowRadius: 12 },
  profileTop: { alignItems: "center", flexDirection: "row" },
  avatarFrame: { backgroundColor: colors.soft, borderColor: colors.primary, borderRadius: 34, borderWidth: 2, height: 66, justifyContent: "center", overflow: "hidden", width: 66 },
  avatar: { alignItems: "center", backgroundColor: colors.soft, flex: 1, justifyContent: "center" },
  avatarImage: { height: 62, width: 62 },
  avatarText: { color: colors.primary, fontFamily: "PlayfairDisplaySemiBold", fontSize: 24 },
  profileCopy: { flex: 1, marginLeft: 12 },
  greeting: { color: colors.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19 },
  profileHint: { color: colors.muted, fontSize: 12, marginTop: 4 },
  profileEdit: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 21, height: 42, justifyContent: "center", width: 42 },
  rankCard: { backgroundColor: colors.soft, borderColor: colors.border, borderRadius: 23, borderWidth: 1, marginTop: 13, padding: 17 },
  rankRow: { alignItems: "center", flexDirection: "row" },
  rankBadge: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 35, borderWidth: 1, height: 70, justifyContent: "center", width: 70 },
  rankSymbol: { color: colors.warning, fontSize: 36 },
  rankCopy: { flex: 1, marginLeft: 10 },
  rankEyebrow: { color: colors.primary, fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  rankName: { color: colors.foreground, fontSize: 17, fontWeight: "800", marginTop: 2 },
  rankLevel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  rankCount: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  rankTrack: { backgroundColor: colors.border, borderRadius: 4, height: 7, marginTop: 16, overflow: "hidden" },
  rankFill: { backgroundColor: colors.warning, borderRadius: 4, height: 7 },
  rankHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  confetti: { alignItems: "center", position: "absolute", right: 31, top: 88 },
  confettiText: { color: colors.warning, fontSize: 19 },
  sectionHeading: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginTop: 26 },
  sectionTitle: { color: colors.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19 },
  summaryTotal: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  statsGrid: { flexDirection: "row", gap: 9, marginTop: 12 },
  stat: { borderRadius: 17, flex: 1, minHeight: 78, padding: 13 },
  statValue: { color: colors.foreground, fontSize: 25, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
  chartHeader: { alignItems: "flex-end", flexDirection: "row", justifyContent: "space-between", marginBottom: 11, marginTop: 27 },
  chartSub: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  chartGestureHint: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  chartNav: { alignItems: "center", flexDirection: "row", gap: 6 },
  navButton: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 15, height: 34, justifyContent: "center", width: 34 },
  navDisabled: { opacity: 0.38 },
  chartCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 21, borderWidth: 1, padding: 14 },
  chartCardTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  chartTotal: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  switcher: { backgroundColor: colors.soft, borderRadius: 11, flexDirection: "row", padding: 3 },
  switchButton: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 },
  switchActive: { backgroundColor: colors.surface },
  switchText: { color: colors.muted, fontSize: 10, fontWeight: "700", textAlign: "center" },
  switchTextActive: { color: colors.foreground },
  chart: { alignItems: "flex-end", flexDirection: "row", height: 178, justifyContent: "space-between", paddingTop: 17 },
  chartEmpty: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 8, textAlign: "center" },
  barCol: { alignItems: "center", flex: 1, height: 155, justifyContent: "flex-end", minWidth: 0 },
  barTrack: { alignItems: "center", height: 108, justifyContent: "flex-end", width: "100%" },
  bar: { backgroundColor: colors.primary, borderRadius: 6, minHeight: 7, width: 15 },
  barValue: { color: colors.muted, fontSize: 9, marginTop: 4 },
  barLabel: { color: colors.muted, fontSize: 9, marginTop: 3, maxWidth: "100%" },
  badgeSection: { marginTop: 23, marginBottom: 8 },
  badgeCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 21, borderWidth: 1, padding: 16 },
  badgeHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  badgeTotal: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  badgeItem: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 14, minHeight: 76, justifyContent: "center", padding: 9, width: "30%" },
  badgeName: { color: colors.foreground, fontSize: 10, fontWeight: "800", marginTop: 5, textAlign: "center", width: "100%" },
  badgeEmpty: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 13 },
  badgeCelebrationCard: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 26, borderWidth: 1, elevation: 16, paddingHorizontal: 24, paddingVertical: 26, shadowColor: colors.foreground, shadowOpacity: 0.18, shadowRadius: 20, width: "100%" },
  badgeCelebrationIcon: { alignItems: "center", backgroundColor: colors.soft, borderColor: colors.border, borderRadius: 38, borderWidth: 1, height: 76, justifyContent: "center", width: 76 },
  badgeCelebrationEyebrow: { color: colors.primary, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginTop: 18 },
  badgeCelebrationTitle: { color: colors.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 29, marginTop: 4 },
  badgeCelebrationCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9, textAlign: "center" },
  badgeCelebrationButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 13, justifyContent: "center", marginTop: 20, minHeight: 48, paddingHorizontal: 24, width: "100%" },
  badgeCelebrationButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },
  allBadgesButton: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 11, flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 13, minHeight: 42 },
  allBadgesText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  backdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", flex: 1, justifyContent: "center", padding: 22 },
  modal: { backgroundColor: colors.background, borderRadius: 22, maxHeight: "80%", padding: 18, width: "100%" },
  modalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  modalClose: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  badgeScroll: { maxHeight: 500 },
  badgeScrollContent: { gap: 8, paddingTop: 12, paddingBottom: 4 },
  badgeRow: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 12, flexDirection: "row", padding: 11 },
  badgeLocked: { backgroundColor: colors.surface, opacity: 0.5 },
  badgeRowCopy: { flex: 1, marginLeft: 10 },
  badgeRowTitle: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  badgeRowDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  backdropProfile: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.38)", flex: 1, justifyContent: "center", padding: 22 },
  modalEyebrow: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  modalTitle: { color: colors.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19, marginTop: 6 },
  photoButton: { alignItems: "center", backgroundColor: colors.soft, borderRadius: 12, flexDirection: "row", gap: 8, marginTop: 17, minHeight: 46, paddingHorizontal: 13 },
  photoButtonText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  modalInput: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 13, borderWidth: 1, color: colors.foreground, fontSize: 15, height: 50, marginTop: 12, paddingHorizontal: 13 },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 18 },
  cancel: { alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, justifyContent: "center", minHeight: 45, paddingHorizontal: 16 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  save: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, justifyContent: "center", minHeight: 45, paddingHorizontal: 18 },
  saveText: { color: colors.onPrimary, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});
