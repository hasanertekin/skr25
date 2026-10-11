import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Speech from "expo-speech";
import DateTimePicker from "@react-native-community/datetimepicker";

import { ScreenContainer } from "@/components/screen-container";
import { DEFAULT_REMINDER, loadReminderSettings, setDailyReminder, type ReminderSettings } from "@/lib/reminders";
import { DEFAULT_LISTENING_SETTINGS, loadListeningSettings, saveListeningSettings, type ListeningSettings } from "@/lib/listening-settings";
import { usePlayer } from "@/lib/player-context";
import { defaultPreferences, exportJournal, importJournal, loadPreferences, loadProfilePreferences, savePreferences, saveProfilePreferences, themes, type AppPreferences, type FullJournalBackup } from "@/lib/app-preferences";
import { loadDailyGoal, saveDailyGoal } from "@/lib/daily-goal";
import { loadGratitudeEntries, saveGratitudeEntries } from "@/lib/gratitude";
import { loadPlaylistFolders, loadPlaylists, savePlaylistFolders, savePlaylists } from "@/lib/playlists";
import { getThemeSwatchColor, useThemeContext } from "@/lib/theme-provider";
import { persistPickedFile, resolveAvailableMediaUri } from "@/lib/local-files";

function Field({ label, value, onChangeText, suffix, keyboardType = "decimal-pad" }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  suffix: string;
  keyboardType?: "decimal-pad" | "number-pad" | "default";
}) {
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInputWrap}>
        <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.fieldInput} />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
    </View>
  );
}

function getVoiceGender(voice: import("expo-speech").Voice): "female" | "male" | "unknown" {
  const identity = `${voice.name} ${voice.identifier}`.toLocaleLowerCase("en-US");
  if (/(female|woman|girl|feminine|kadın|kadin)/.test(identity)) return "female";
  if (/(^|[^a-z])(male|man|boy|masculine|erkek)([^a-z]|$)/.test(identity)) return "male";
  return "unknown";
}

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const routeParams = useLocalSearchParams<{ section?: string }>();
  const { setSettings: setPlayerSettings } = usePlayer();
  const { palette, setThemeName, setColorScheme } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const scrollRef = useRef<ScrollView>(null);
  const savedPreferencesRef = useRef<AppPreferences>(defaultPreferences);
  const allowRemovalRef = useRef(false);
  const [goalSectionY, setGoalSectionY] = useState<number | null>(null);
  const [reminder, setReminder] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [listening, setListening] = useState<ListeningSettings>(DEFAULT_LISTENING_SETTINGS);
  const [turkishVoices, setTurkishVoices] = useState<import("expo-speech").Voice[]>([]);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [hourText, setHourText] = useState("20");
  const [minuteText, setMinuteText] = useState("00");
  const [goalText, setGoalText] = useState("5");
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void Promise.all([loadReminderSettings(), loadListeningSettings(), loadPreferences(), loadDailyGoal()]).then(([loadedReminder, loadedListening, loadedPreferences, loadedGoal]) => {
      setReminder(loadedReminder);
      setHourText(String(loadedReminder.hour).padStart(2, "0"));
      setMinuteText(String(loadedReminder.minute).padStart(2, "0"));
      setListening(loadedListening);
      setPreferences(loadedPreferences);
      setGoalText(String(loadedGoal));
      savedPreferencesRef.current = loadedPreferences;
      setThemeName(loadedPreferences.theme);
      setColorScheme(loadedPreferences.colorScheme);
    }).catch(() => Alert.alert("Ayarlar açılamadı", "Kayıtlı tercihlerin okunamadı. Daha sonra yeniden deneyebilirsin."));
  }, [setColorScheme, setThemeName]);

  useEffect(() => {
    void Speech.getAvailableVoicesAsync().then((available) => {
      setTurkishVoices(available
        .filter((voice) => voice.language.toLowerCase().replace("_", "-").startsWith("tr"))
        .sort((a, b) => a.name.localeCompare(b.name, "tr")));
    }).catch(() => setTurkishVoices([]));
  }, []);

  const savePreference = (next: AppPreferences) => {
    setPreferences(next);
    setDirty(true);
    setThemeName(next.theme);
    setColorScheme(next.colorScheme);
  };

  const updateListening = (update: (current: ListeningSettings) => ListeningSettings) => {
    setListening(update);
    setDirty(true);
  };

  const previewVoice = (voiceIdentifier: string | null) => {
    const previewKey = voiceIdentifier ?? "__default__";
    if (previewingVoice === previewKey) {
      void Speech.stop();
      setPreviewingVoice(null);
      return;
    }
    void Speech.stop();
    setPreviewingVoice(previewKey);
    Speech.speak("Bugün şükrettiğim şey, içime huzur veren küçük bir an.", {
      language: "tr-TR",
      rate: listening.rate,
      voice: voiceIdentifier ?? undefined,
      onDone: () => setPreviewingVoice(null),
      onStopped: () => setPreviewingVoice(null),
      onError: () => {
        setPreviewingVoice(null);
        Alert.alert("Ses örneği çalınamadı", "Bu ses cihazında şu an kullanılamıyor. Başka bir ses deneyebilirsin.");
      },
    });
  };

  const exportData = async () => {
    if (dirty) {
      Alert.alert("Önce ayarları kaydet", "Dışa aktarılan yedeğin güncel olması için önce değişikliklerini kaydet.");
      return;
    }
    try {
      const [entries, backupPreferences, profile, goal, playlists, folders, listeningSettings, reminderSettings] = await Promise.all([
        loadGratitudeEntries(), loadPreferences(), loadProfilePreferences(), loadDailyGoal(), loadPlaylists(), loadPlaylistFolders(), loadListeningSettings(), loadReminderSettings(),
      ]);
      await exportJournal({ version: 2, exportedAt: new Date().toISOString(), entries, preferences: backupPreferences, profile, dailyGoal: goal, playlists, folders, listening: listeningSettings, reminder: reminderSettings });
    } catch {
      Alert.alert("Yedek oluşturulamadı", "Günlük verileri dışa aktarılırken bir sorun oluştu.");
    }
  };

  const applyImportedBackup = async (imported: FullJournalBackup) => {
    let previous: [Awaited<ReturnType<typeof loadGratitudeEntries>>, AppPreferences, Awaited<ReturnType<typeof loadProfilePreferences>>, Awaited<ReturnType<typeof loadPlaylists>>, Awaited<ReturnType<typeof loadPlaylistFolders>>, ListeningSettings, number, ReminderSettings] | null = null;
    try {
      const [avatarUri, ambienceUri, availablePlaylists, availableEntries, voices] = await Promise.all([
        resolveAvailableMediaUri(imported.profile.avatarUri),
        resolveAvailableMediaUri(imported.listening.ambienceUri),
        Promise.all(imported.playlists.map(async (playlist) => ({
          ...playlist,
          atmosphereUri: await resolveAvailableMediaUri(playlist.atmosphereUri),
        }))),
        Promise.all(imported.entries.map(async (entry) => {
          const [audioUri, imageUri] = await Promise.all([
            resolveAvailableMediaUri(entry.audioUri),
            resolveAvailableMediaUri(entry.imageUri),
          ]);
          return { ...entry, audioUri: audioUri ?? undefined, imageUri: imageUri ?? undefined };
        })),
        Speech.getAvailableVoicesAsync().catch(() => []),
      ]);
      const restoredProfile = { ...imported.profile, avatarUri };
      const restoredListening = {
        ...imported.listening,
        ambienceUri,
        ambienceName: ambienceUri ? imported.listening.ambienceName : null,
        voiceIdentifier: imported.listening.voiceIdentifier && voices.some((voice) => voice.identifier === imported.listening.voiceIdentifier)
          ? imported.listening.voiceIdentifier
          : null,
      };
      const restoredPlaylists = availablePlaylists.map((playlist, index) => ({
        ...playlist,
        atmosphereName: playlist.atmosphereUri ? imported.playlists[index]?.atmosphereName ?? playlist.atmosphereName : null,
      }));
      const missingMedia = Number(Boolean(imported.profile.avatarUri && !avatarUri))
        + Number(Boolean(imported.listening.ambienceUri && !ambienceUri))
        + imported.playlists.filter((playlist, index) => Boolean(playlist.atmosphereUri && !restoredPlaylists[index]?.atmosphereUri)).length
        + imported.entries.reduce((count, entry, index) => count
          + Number(Boolean(entry.audioUri && !availableEntries[index]?.audioUri))
          + Number(Boolean(entry.imageUri && !availableEntries[index]?.imageUri)), 0);
      const [previousEntries, previousPreferences, previousProfile, previousPlaylists, previousFolders, previousListening, previousGoal, previousReminder] = await Promise.all([
        loadGratitudeEntries(), loadPreferences(), loadProfilePreferences(), loadPlaylists(), loadPlaylistFolders(), loadListeningSettings(), loadDailyGoal(), loadReminderSettings(),
      ]);
      previous = [previousEntries, previousPreferences, previousProfile, previousPlaylists, previousFolders, previousListening, previousGoal, previousReminder];
      const reminderResult = await setDailyReminder(imported.reminder);
      const restoredReminder = imported.reminder.enabled && !reminderResult.granted
        ? { ...imported.reminder, enabled: false }
        : imported.reminder;
      await Promise.all([
        saveGratitudeEntries(availableEntries),
        savePreferences(imported.preferences),
        saveProfilePreferences(restoredProfile),
        savePlaylists(restoredPlaylists),
        savePlaylistFolders(imported.folders ?? []),
        saveListeningSettings(restoredListening),
        saveDailyGoal(imported.dailyGoal),
      ]);
      setPreferences(imported.preferences);
      setThemeName(imported.preferences.theme);
      setColorScheme(imported.preferences.colorScheme);
      savedPreferencesRef.current = imported.preferences;
      setReminder(restoredReminder);
      setHourText(String(restoredReminder.hour).padStart(2, "0"));
      setMinuteText(String(restoredReminder.minute).padStart(2, "0"));
      setListening(restoredListening);
      setPlayerSettings(restoredListening);
      setGoalText(String(imported.dailyGoal));
      setDirty(false);
      Alert.alert("Yedek geri yüklendi", `${availableEntries.length} not, ${imported.playlists.length} liste ve ${(imported.folders ?? []).length} klasör geri yüklendi.${missingMedia ? ` ${missingMedia} cihaz dosyası bu yedekte bulunmadığı için yeniden seçilmesi gerekebilir.` : ""}${imported.reminder.enabled && !reminderResult.granted ? " Hatırlatıcı için bildirim izni verilmedi." : ""}`);
    } catch {
      if (previous) {
        const [previousEntries, previousPreferences, previousProfile, previousPlaylists, previousFolders, previousListening, previousGoal, previousReminder] = previous;
        const rollback = await Promise.allSettled([
          saveGratitudeEntries(previousEntries), savePreferences(previousPreferences), saveProfilePreferences(previousProfile),
          savePlaylists(previousPlaylists), savePlaylistFolders(previousFolders), saveListeningSettings(previousListening), saveDailyGoal(previousGoal), setDailyReminder(previousReminder),
        ]);
        Alert.alert("Geri yükleme tamamlanamadı", rollback.every((result) => result.status === "fulfilled")
          ? "Önceki günlük verilerin korundu. Daha sonra yeniden deneyebilirsin."
          : "Yedeğin bir bölümü uygulanmış olabilir; bazı eski kayıtlar geri yüklenemedi.");
      } else {
        Alert.alert("Geri yükleme tamamlanamadı", "Önceki veriler okunamadı; yedek bu nedenle uygulanmadı.");
      }
    }
  };

  const importData = async () => {
    let imported: FullJournalBackup | null;
    try {
      imported = await importJournal();
    } catch {
      Alert.alert("Dosya okunamadı", "Bu dosya geçerli bir Şükür Günlüğü yedeği değil.");
      return;
    }
    if (!imported) return;
    Alert.alert(
      "Mevcut günlüğün yerine yüklensin mi?",
      `Bu işlem mevcut notların, listelerin ve ayarların yerine yedekteki ${imported.entries.length} notu ve ${imported.playlists.length} listeyi koyar. Kaydedilmemiş ayarlar da değişir. Devam etmeden önce güncel verilerini dışarı aktarabilirsin.`,
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Yedeği geri yükle", style: "destructive", onPress: () => { void applyImportedBackup(imported); } },
      ],
    );
  };

  const saveAll = async (showFeedback = true) => {
    if (saving) return false;
    const hour = Math.min(23, Math.max(0, Number.parseInt(hourText, 10) || 0));
    const minute = Math.min(59, Math.max(0, Number.parseInt(minuteText, 10) || 0));
    const nextGoal = Math.min(999, Math.max(1, Number.parseInt(goalText, 10) || 5));
    const nextReminder = { ...reminder, hour, minute };
    const nextListening = {
      ...listening,
      rate: Math.min(2, Math.max(0.5, Number.parseFloat(String(listening.rate)) || 1.2)),
      gapSeconds: Math.min(30, Math.max(0, Number.parseInt(String(listening.gapSeconds), 10) || 0)),
      ambienceVolume: Math.min(100, Math.max(0, Number.parseInt(String(listening.ambienceVolume), 10) || 0)),
    };

    setSaving(true);
    try {
      const result = await setDailyReminder(nextReminder);
      const savedReminder = nextReminder.enabled && !result.granted ? { ...nextReminder, enabled: false } : nextReminder;
      await Promise.all([savePreferences(preferences), saveListeningSettings(nextListening), saveDailyGoal(nextGoal)]);
      setPlayerSettings(nextListening);
      setReminder(savedReminder);
      setListening(nextListening);
      setGoalText(String(nextGoal));
      savedPreferencesRef.current = preferences;
      setDirty(false);
      if (showFeedback && nextReminder.enabled && !result.granted) Alert.alert("Bildirim izni gerekli", "Diğer ayarların kaydedildi; hatırlatıcı kapalı kaldı çünkü bildirim izni verilmedi.");
      else if (showFeedback) Alert.alert("Ayarlar kaydedildi", "Seçimlerin güncellendi.");
      return true;
    } catch {
      Alert.alert("Kaydedilemedi", "Ayarların kaydedilirken bir sorun oluştu. Yeniden deneyebilirsin.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (routeParams.section !== "goal" || goalSectionY === null) return;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, goalSectionY - 18), animated: true }));
  }, [goalSectionY, routeParams.section]);

  usePreventRemove(dirty, ({ data }) => {
    if (allowRemovalRef.current) {
      allowRemovalRef.current = false;
      return;
    }
    Alert.alert("Kaydedilmemiş ayarlar", "Değişikliklerini kaydetmek ister misin?", [
      { text: "Kal", style: "cancel" },
      {
        text: "At",
        style: "destructive",
        onPress: () => {
          setThemeName(savedPreferencesRef.current.theme);
          setColorScheme(savedPreferencesRef.current.colorScheme);
          setPreferences(savedPreferencesRef.current);
          setDirty(false);
          allowRemovalRef.current = true;
          navigation.dispatch(data.action);
        },
      },
      {
        text: "Kaydet",
        onPress: () => {
          void saveAll(false).then((saved) => {
            if (!saved) return;
            allowRemovalRef.current = true;
            navigation.dispatch(data.action);
          });
        },
      },
    ]);
  });

  const pickAmbience = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      if (!result.canceled) {
        const asset = result.assets[0];
        const ambienceUri = await persistPickedFile(asset.uri, asset.name, "ambient-audio");
        updateListening((current) => ({ ...current, ambienceUri, ambienceName: asset.name }));
      }
    } catch {
      Alert.alert("Ses dosyası eklenemedi", "Dosya okunamadı veya uygulamaya kopyalanamadı. Başka bir dosya deneyebilirsin.");
    }
  };

  const reminderDate = new Date();
  reminderDate.setHours(Number.parseInt(hourText, 10) || 0, Number.parseInt(minuteText, 10) || 0, 0, 0);

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Geri dön">
              <Ionicons name="chevron-back" size={22} color={palette.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>SANA GÖRE</Text>
              <Text style={styles.title}>Ayarlar</Text>
            </View>
          </View>
          {dirty ? <View style={styles.unsavedNotice}><Ionicons name="ellipse" size={8} color={palette.warning} /><Text style={styles.unsavedText}>Kaydedilmemiş değişikliklerin var</Text></View> : null}

          <Text style={styles.sectionTitle}>Günlük görünümü</Text>
          <View style={styles.card}>
            <Pressable onPress={() => savePreference({ ...preferences, entrySort: preferences.entrySort === "newest" ? "oldest" : "newest" })} style={styles.preferenceRow} accessibilityRole="button">
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Notların sıralaması</Text>
                <Text style={styles.cardSubtitle}>{preferences.entrySort === "newest" ? "En yeni notlar üstte" : "İlk yazdığın notlar üstte"}</Text>
              </View>
              <Ionicons name="swap-vertical-outline" size={20} color={palette.primary} />
            </Pressable>
            <Pressable
              onPress={() => void savePreference({ ...preferences, colorScheme: preferences.colorScheme === "dark" ? "light" : "dark" })}
              style={styles.preferenceRow}
              accessibilityRole="switch"
              accessibilityState={{ checked: preferences.colorScheme === "dark" }}
              accessibilityLabel="Açık ve koyu görünüm arasında geçiş yap"
            >
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Açık / koyu görünüm</Text>
                <Text style={styles.cardSubtitle}>{preferences.colorScheme === "dark" ? "Koyu görünüm açık" : "Açık görünüm açık"}</Text>
              </View>
              <View style={[styles.switch, preferences.colorScheme === "dark" && styles.switchOn]}>
                <View style={[styles.switchKnob, preferences.colorScheme === "dark" && styles.switchKnobOn]} />
              </View>
            </Pressable>
            <Pressable onPress={() => void savePreference({ ...preferences, hapticsOnSave: !preferences.hapticsOnSave })} style={styles.preferenceRow} accessibilityRole="switch" accessibilityState={{ checked: preferences.hapticsOnSave }} accessibilityLabel="Şükran kaydederken titreşimi aç veya kapat">
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Şükran eklerken titreşim</Text>
                <Text style={styles.cardSubtitle}>{preferences.hapticsOnSave ? "Kayıt başarıyla eklendiğinde kısa titreşim" : "Kapalı"}</Text>
              </View>
              <View style={[styles.switch, preferences.hapticsOnSave && styles.switchOn]}><View style={[styles.switchKnob, preferences.hapticsOnSave && styles.switchKnobOn]} /></View>
            </Pressable>
            <Text style={[styles.cardTitle, styles.themeLabel]}>Renk teması</Text>
            <Text style={styles.cardSubtitle}>Renk paletini seç; açık/koyu görünümü ayrı değiştirebilirsin.</Text>
            <View style={styles.themeGrid} accessibilityRole="radiogroup" accessibilityLabel="Renk temaları">
              {themes.map((theme) => {
                const selected = preferences.theme === theme;
                const swatch = getThemeSwatchColor(theme);
                return (
                  <Pressable
                    key={theme}
                    onPress={() => savePreference({ ...preferences, theme })}
                    style={[styles.themeSwatch, selected && styles.themeSwatchSelected]}
                    accessibilityRole="radio"
                    accessibilityLabel={`${theme} renk teması`}
                    accessibilityState={{ selected }}
                    hitSlop={3}
                  >
                    <View style={[styles.swatchColor, { backgroundColor: swatch }]}>
                      {selected ? <Ionicons name="checkmark" size={21} color="#FFFFFF" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View onLayout={(event) => setGoalSectionY(event.nativeEvent.layout.y)}>
            <Text style={styles.sectionTitle}>Günlük hedef</Text>
            <View style={styles.card}>
              <View style={styles.goalRow}>
                <View style={styles.goalIcon}><Ionicons name="locate-outline" size={19} color={palette.primary} /></View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>Bugün kaç şükran?</Text>
                  <Text style={styles.cardSubtitle}>Ana sayfadaki ilerleme göstergesi bu hedefi kullanır.</Text>
                </View>
                <View style={styles.goalInputWrap}>
                  <TextInput
                    value={goalText}
                    onChangeText={(value) => { setDirty(true); setGoalText(value.replace(/[^0-9]/g, "")); }}
                    keyboardType="number-pad"
                    maxLength={3}
                    style={styles.goalInput}
                    accessibilityLabel="Günlük şükran hedefi"
                    selectTextOnFocus
                  />
                  <Text style={styles.suffix}>madde</Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Gizlilik ve güvenlik</Text>
          <View style={styles.card}>
            <Pressable onPress={() => savePreference({ ...preferences, privacyLock: !preferences.privacyLock })} style={styles.preferenceRow} accessibilityRole="switch" accessibilityState={{ checked: preferences.privacyLock }} accessibilityLabel="Uygulama açılış kilidi">
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Uygulama kilidi</Text>
                <Text style={styles.cardSubtitle}>{preferences.privacyLock ? "Açılışta ve geri döndüğünde doğrulama istenir" : "Kapalı"}</Text>
              </View>
              <View style={[styles.switch, preferences.privacyLock && styles.switchOn]}><View style={[styles.switchKnob, preferences.privacyLock && styles.switchKnobOn]} /></View>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Hatırlatıcı</Text>
          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.cardIcon}><Ionicons name="notifications-outline" size={19} color={palette.primary} /></View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Bir mola hatırlat</Text>
                <Text style={styles.cardSubtitle}>Yalnızca seçtiğin saatte; istediğinde kapatabilirsin.</Text>
              </View>
              <Pressable onPress={() => { setDirty(true); setReminder((current) => ({ ...current, enabled: !current.enabled })); }} style={styles.switchTouch} accessibilityRole="switch" accessibilityState={{ checked: reminder.enabled }} accessibilityLabel="Hatırlatıcıyı aç veya kapat">
                <View style={[styles.switch, reminder.enabled && styles.switchOn]}><View style={[styles.switchKnob, reminder.enabled && styles.switchKnobOn]} /></View>
              </Pressable>
            </View>
            {reminder.enabled ? (
              <>
                <View style={styles.timeRow}>
                  <Text style={styles.rowLabel}>Saat</Text>
                  <Pressable onPress={() => setShowTimePicker(true)} style={({ pressed }) => [styles.timePickerButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Hatırlatıcı saati ${hourText.padStart(2, "0")}:${minuteText.padStart(2, "0")}`}>
                    <Ionicons name="time-outline" size={18} color={palette.primary} />
                    <Text style={styles.timePickerValue}>{hourText.padStart(2, "0")}:{minuteText.padStart(2, "0")}</Text>
                    <Ionicons name="chevron-down" size={15} color={palette.muted} />
                  </Pressable>
                </View>
                {showTimePicker ? (
                  <View style={styles.timePickerPanel}>
                    <DateTimePicker
                      value={reminderDate}
                      mode="time"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      is24Hour
                      onChange={(_event, selectedDate) => {
                        if (Platform.OS !== "ios") setShowTimePicker(false);
                        if (!selectedDate) return;
                        setDirty(true);
                        setHourText(String(selectedDate.getHours()).padStart(2, "0"));
                        setMinuteText(String(selectedDate.getMinutes()).padStart(2, "0"));
                      }}
                    />
                    {Platform.OS === "ios" ? <Pressable onPress={() => setShowTimePicker(false)} style={styles.timePickerDone} accessibilityRole="button"><Text style={styles.timePickerDoneText}>Tamam</Text></Pressable> : null}
                  </View>
                ) : null}
                <Text style={styles.helper}>Hatırlatıcıyı istemediğin zaman kapatabilir, saati daha sonra değiştirebilirsin.</Text>
              </>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Dinleme</Text>
          <View style={styles.card}>
            <Field label="Okuma hızı" value={String(listening.rate)} onChangeText={(value) => updateListening((current) => ({ ...current, rate: Number.parseFloat(value) || 0.5 }))} suffix="x" />
            <View style={styles.voiceChoice}>
              <Text style={styles.voiceTitle}>Türkçe ses</Text>
              <Text style={styles.voiceHint}>Cihazının sunduğu Türkçe sesler burada listelenir. Seçmeden önce örnekleyebilirsin; ses adı cinsiyeti açıkça belirtmiyorsa ayrı grupta gösterilir.</Text>
              <View style={styles.voiceOptionRow}>
                <Pressable onPress={() => updateListening((current) => ({ ...current, voiceIdentifier: null }))} style={[styles.voiceOption, styles.voiceOptionGrow, listening.voiceIdentifier === null && styles.voiceOptionActive]} accessibilityRole="radio" accessibilityState={{ selected: listening.voiceIdentifier === null }}>
                  <Text style={[styles.voiceOptionText, listening.voiceIdentifier === null && styles.voiceOptionTextActive]}>Varsayılan ses</Text>
                </Pressable>
                <Pressable onPress={() => previewVoice(null)} style={styles.previewButton} accessibilityRole="button" accessibilityLabel={previewingVoice === "__default__" ? "Varsayılan ses örneğini durdur" : "Varsayılan sesi örnekle"}>
                  <Ionicons name={previewingVoice === "__default__" ? "stop" : "play"} size={16} color={palette.primary} />
                </Pressable>
              </View>
              {(["female", "male", "unknown"] as const).map((gender) => {
                const group = turkishVoices.filter((voice) => getVoiceGender(voice) === gender);
                if (!group.length) return null;
                const groupTitle = gender === "female" ? "Kadın sesleri" : gender === "male" ? "Erkek sesleri" : "Diğer Türkçe sesler";
                return (
                  <View key={gender} style={styles.voiceGroup}>
                    <Text style={styles.voiceGroupTitle}>{groupTitle}</Text>
                    <View style={styles.voiceOptions}>
                      {group.map((voice) => {
                        const selected = listening.voiceIdentifier === voice.identifier;
                        return (
                          <View key={voice.identifier} style={styles.voiceOptionRow}>
                            <Pressable onPress={() => updateListening((current) => ({ ...current, voiceIdentifier: voice.identifier }))} style={[styles.voiceOption, styles.voiceOptionGrow, selected && styles.voiceOptionActive]} accessibilityRole="radio" accessibilityLabel={`${voice.name}${voice.quality === "Enhanced" ? ", geliştirilmiş kalite" : ""}`} accessibilityState={{ selected }}>
                              <Text numberOfLines={1} style={[styles.voiceOptionText, selected && styles.voiceOptionTextActive]}>{voice.name}{voice.quality === "Enhanced" ? " · HD" : ""}</Text>
                            </Pressable>
                            <Pressable onPress={() => previewVoice(voice.identifier)} style={styles.previewButton} accessibilityRole="button" accessibilityLabel={`${previewingVoice === voice.identifier ? "Durdur" : "Örnekle"}: ${voice.name}`}>
                              <Ionicons name={previewingVoice === voice.identifier ? "stop" : "play"} size={16} color={palette.primary} />
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              {!turkishVoices.length ? <Text style={styles.voiceHint}>Türkçe ses listesi alınamadı; cihazın varsayılan Türkçe sesi kullanılacak.</Text> : null}
            </View>
            <Field label="Notlar arasındaki sessizlik" value={String(listening.gapSeconds)} onChangeText={(value) => updateListening((current) => ({ ...current, gapSeconds: Number.parseInt(value, 10) || 0 }))} suffix="sn" keyboardType="number-pad" />
            <Field label="Atmosfer sesi" value={String(listening.ambienceVolume)} onChangeText={(value) => updateListening((current) => ({ ...current, ambienceVolume: Number.parseInt(value, 10) || 0 }))} suffix="%" keyboardType="number-pad" />
            <Pressable onPress={() => updateListening((current) => ({ ...current, backgroundPlayback: !current.backgroundPlayback }))} style={styles.preferenceRow} accessibilityRole="switch" accessibilityState={{ checked: listening.backgroundPlayback }}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Arka planda oynat</Text>
                <Text style={styles.cardSubtitle}>{listening.backgroundPlayback ? "Ekran kapalıyken devam eder" : "Uygulamadan çıkınca durur"}</Text>
              </View>
              <View style={[styles.switch, listening.backgroundPlayback && styles.switchOn]}><View style={[styles.switchKnob, listening.backgroundPlayback && styles.switchKnobOn]} /></View>
            </Pressable>
            <View style={styles.musicRow}>
              <View style={styles.musicIcon}><Ionicons name="musical-notes-outline" size={18} color={palette.primary} /></View>
              <View style={styles.musicCopy}>
                <Text style={styles.musicTitle}>Atmosfer sesi</Text>
                <Text numberOfLines={1} style={styles.musicText}>{listening.ambienceName || "İstersen kendi ses dosyanı seç"}</Text>
              </View>
              {listening.ambienceUri ? <Pressable onPress={() => updateListening((current) => ({ ...current, ambienceUri: null, ambienceName: null }))} style={styles.removeButton} accessibilityRole="button" accessibilityLabel="Atmosfer sesini kaldır" hitSlop={4}><Ionicons name="trash-outline" size={17} color={palette.error} /></Pressable> : null}
              <Pressable onPress={pickAmbience} style={({ pressed }) => [styles.chooseButton, pressed && styles.pressed]} accessibilityRole="button">
                <Ionicons name="folder-open-outline" size={16} color={palette.primary} />
                <Text style={styles.chooseText}>Dosya seç</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Yedekleme</Text>
          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.cardIcon}><Ionicons name="swap-horizontal-outline" size={19} color={palette.primary} /></View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>Günlüğünü taşı</Text>
                <Text style={styles.cardSubtitle}>Notlarını ve ayarlarını JSON yedeği olarak dışarı aktar veya geri yükle. Fotoğraf ve seçtiğin ses dosyaları ayrı aktarılmaz; başka bir cihazda yeniden seçmen gerekebilir.</Text>
              </View>
            </View>
            <View style={styles.transferRow}>
              <Pressable onPress={exportData} style={styles.transferButton} accessibilityRole="button"><Ionicons name="share-outline" size={17} color={palette.primary} /><Text style={styles.transferText}>Dışarı aktar</Text></Pressable>
              <Pressable onPress={importData} style={styles.transferButton} accessibilityRole="button"><Ionicons name="download-outline" size={17} color={palette.primary} /><Text style={styles.transferText}>Geri yükle</Text></Pressable>
            </View>
          </View>

          <Pressable onPress={() => void saveAll()} disabled={saving || !dirty} style={({ pressed }) => [styles.saveButton, (saving || !dirty) && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ disabled: saving || !dirty }}>
            <Ionicons name="checkmark-circle-outline" size={19} color={palette.onPrimary} />
            <Text style={styles.saveText}>{saving ? "Kaydediliyor" : dirty ? "Değişiklikleri kaydet" : "Kaydedildi"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 22, paddingBottom: 40, paddingTop: 18 },
  header: { alignItems: "center", flexDirection: "row", marginBottom: 24 },
  backButton: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", marginRight: 12, width: 44 },
  headerCopy: { flex: 1 },
  unsavedNotice: { alignItems: "center", backgroundColor: palette.orangeSoft, borderRadius: 11, flexDirection: "row", gap: 7, marginBottom: 14, paddingHorizontal: 11, paddingVertical: 9 },
  unsavedText: { color: palette.foreground, fontSize: 12, fontWeight: "700" },
  eyebrow: { color: palette.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 29, marginTop: 3 },
  sectionTitle: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 19, marginBottom: 10, marginTop: 4 },
  card: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 20, borderWidth: 1, marginBottom: 22, padding: 15 },
  cardHeading: { alignItems: "center", flexDirection: "row" },
  cardIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 16, height: 38, justifyContent: "center", marginRight: 10, width: 38 },
  cardCopy: { flex: 1 },
  cardTitle: { color: palette.foreground, fontSize: 14, fontWeight: "800" },
  cardSubtitle: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  preferenceRow: { alignItems: "center", borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", minHeight: 64 },
  switchTouch: { alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 48 },
  switch: { backgroundColor: palette.border, borderRadius: 13, height: 26, justifyContent: "center", padding: 3, width: 46 },
  switchOn: { backgroundColor: palette.primary },
  switchKnob: { backgroundColor: palette.surface, borderRadius: 10, height: 20, width: 20 },
  switchKnobOn: { alignSelf: "flex-end" },
  themeLabel: { marginTop: 15 },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 12, rowGap: 10 },
  themeSwatch: { alignItems: "center", borderColor: "transparent", borderRadius: 12, borderWidth: 2, height: 54, justifyContent: "center", marginBottom: 2, width: "23%" },
  themeSwatchSelected: { borderColor: palette.primary },
  swatchColor: { alignItems: "center", borderColor: palette.border, borderRadius: 8, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  timeRow: { alignItems: "center", borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", marginTop: 13, paddingTop: 13 },
  rowLabel: { color: palette.foreground, fontSize: 13, fontWeight: "700" },
  timePickerButton: { alignItems: "center", backgroundColor: palette.soft, borderColor: palette.border, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 46, minWidth: 112, paddingHorizontal: 12 },
  timePickerValue: { color: palette.foreground, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  timePickerPanel: { alignItems: "center", backgroundColor: palette.soft, borderColor: palette.border, borderRadius: 14, borderWidth: 1, marginTop: 10, padding: 8 },
  timePickerDone: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 10, justifyContent: "center", marginTop: 8, minHeight: 44, paddingHorizontal: 20 },
  timePickerDoneText: { color: palette.onPrimary, fontSize: 13, fontWeight: "800" },
  helper: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 9 },
  goalRow: { alignItems: "center", flexDirection: "row", minHeight: 60 },
  goalIcon: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 17, height: 38, justifyContent: "center", marginRight: 10, width: 38 },
  goalInputWrap: { alignItems: "center", backgroundColor: palette.soft, borderColor: palette.border, borderRadius: 11, borderWidth: 1, flexDirection: "row", paddingHorizontal: 5 },
  goalInput: { color: palette.foreground, fontSize: 15, fontWeight: "800", height: 44, paddingHorizontal: 7, textAlign: "right", width: 50 },
  field: { alignItems: "center", borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 58 },
  fieldLabel: { color: palette.foreground, flex: 1, fontSize: 13, fontWeight: "700" },
  fieldInputWrap: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 10, flexDirection: "row", paddingHorizontal: 5 },
  fieldInput: { color: palette.foreground, fontSize: 14, fontWeight: "800", height: 44, paddingHorizontal: 7, textAlign: "right", width: 62 },
  voiceChoice: { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 14, paddingTop: 13 },
  voiceTitle: { color: palette.foreground, fontSize: 13, fontWeight: "800" },
  voiceHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  voiceGroup: { marginTop: 12 },
  voiceGroupTitle: { color: palette.muted, fontSize: 11, fontWeight: "800", marginBottom: 7 },
  voiceOptions: { gap: 4 },
  voiceOptionRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  voiceOptionGrow: { flex: 1 },
  voiceOption: { backgroundColor: palette.soft, borderColor: palette.border, borderRadius: 11, borderWidth: 1, justifyContent: "center", marginTop: 7, minHeight: 44, paddingHorizontal: 11 },
  previewButton: { alignItems: "center", backgroundColor: palette.soft, borderColor: palette.border, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: "center", marginTop: 7, width: 44 },
  voiceOptionActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  voiceOptionText: { color: palette.foreground, fontSize: 12, fontWeight: "700" },
  voiceOptionTextActive: { color: palette.onPrimary },
  suffix: { color: palette.muted, fontSize: 12, fontWeight: "700", paddingRight: 7 },
  musicRow: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 14, flexDirection: "row", marginTop: 14, padding: 10 },
  musicIcon: { alignItems: "center", backgroundColor: palette.surface, borderRadius: 14, height: 34, justifyContent: "center", width: 34 },
  musicCopy: { flex: 1, marginHorizontal: 9 },
  musicTitle: { color: palette.foreground, fontSize: 13, fontWeight: "800" },
  musicText: { color: palette.muted, fontSize: 12, marginTop: 3 },
  chooseButton: { alignItems: "center", backgroundColor: palette.surface, borderRadius: 10, flexDirection: "row", gap: 5, minHeight: 44, paddingHorizontal: 9 },
  chooseText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
  removeButton: { alignItems: "center", height: 44, justifyContent: "center", marginRight: 2, width: 44 },
  transferRow: { flexDirection: "row", gap: 9, marginTop: 14 },
  transferButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 12, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 47 },
  transferText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
  saveButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 15, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 50 },
  saveText: { color: palette.onPrimary, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
