import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

import { ScreenContainer } from "@/components/screen-container";
import { DEFAULT_REMINDER, loadReminderSettings, setDailyReminder, type ReminderSettings } from "@/lib/reminders";
import { DEFAULT_LISTENING_SETTINGS, loadListeningSettings, saveListeningSettings, type ListeningSettings } from "@/lib/listening-settings";
import { usePlayer } from "@/lib/player-context";
import { AppTopActions } from "@/components/app-top-actions";
import { loadDailyGoal, saveDailyGoal } from "@/lib/daily-goal";
import { exportJournal, importJournal, loadPreferences, loadProfilePreferences, savePreferences, saveProfilePreferences, type AppPreferences } from "@/lib/app-preferences";
import { loadGratitudeEntries, saveGratitudeEntries } from "@/lib/gratitude";
import { loadPlaylists, savePlaylists } from "@/lib/playlists";
import { useThemeContext } from "@/lib/theme-provider";

const colors = { background: "#F8F6F0", surface: "#FFFFFF", ink: "#163B2B", muted: "#7B8A82", border: "#E6E8E2", primary: "#2F7D5A", primarySoft: "#E1F0E8", orange: "#E9905E", orangeSoft: "#FFF0E6", danger: "#C75C51" };

function Field({ label, value, onChangeText, suffix, keyboardType = "decimal-pad" }: { label: string; value: string; onChangeText: (value: string) => void; suffix: string; keyboardType?: "decimal-pad" | "number-pad" | "default" }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.fieldInputWrap}><TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.fieldInput} /><Text style={styles.suffix}>{suffix}</Text></View></View>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { setSettings: setPlayerSettings } = usePlayer();
  const { setThemeName } = useThemeContext();
  const [reminder, setReminder] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [listening, setListening] = useState<ListeningSettings>(DEFAULT_LISTENING_SETTINGS);
  const [hourText, setHourText] = useState("20");
  const [minuteText, setMinuteText] = useState("00");
  const [saving, setSaving] = useState(false);
  const [goalText, setGoalText] = useState("5");
  const [preferences, setPreferences] = useState<AppPreferences>({ privacyLock: false, theme: "Zümrüt Bahçe", entrySort: "newest" });

  useEffect(() => {
    Promise.all([loadReminderSettings(), loadListeningSettings(), loadDailyGoal(), loadPreferences()]).then(([loadedReminder, loadedListening, loadedGoal, loadedPreferences]) => {
      setReminder(loadedReminder); setHourText(String(loadedReminder.hour).padStart(2, "0")); setMinuteText(String(loadedReminder.minute).padStart(2, "0")); setListening(loadedListening); setGoalText(String(loadedGoal));
      setPreferences(loadedPreferences);
    });
  }, []);

  const savePreference = async (next: AppPreferences) => { setPreferences(next); await savePreferences(next); setThemeName(next.theme); };
  const exportData = async () => { const [entries, backupPreferences, profile, goal, playlists, listeningSettings, reminderSettings] = await Promise.all([loadGratitudeEntries(), loadPreferences(), loadProfilePreferences(), loadDailyGoal(), loadPlaylists(), loadListeningSettings(), loadReminderSettings()]); await exportJournal({ version: 2, exportedAt: new Date().toISOString(), entries, preferences: backupPreferences, profile, dailyGoal: goal, playlists, listening: listeningSettings, reminder: reminderSettings }); };
  const importData = async () => { try { const imported = await importJournal(); if (imported) { await Promise.all([saveGratitudeEntries(imported.entries), savePreferences(imported.preferences), saveProfilePreferences(imported.profile), savePlaylists(imported.playlists), saveListeningSettings(imported.listening), setDailyReminder(imported.reminder), saveDailyGoal(imported.dailyGoal)]); setPreferences(imported.preferences); setGoalText(String(imported.dailyGoal)); Alert.alert("İçe aktarıldı", `${imported.entries.length} şükran, ayarlar ve playlistler geri yüklendi.`); } } catch { Alert.alert("Dosya okunamadı", "Bu dosya geçerli bir Şükür Günlüğü tam yedeği değil."); } };

  const saveAll = async () => {
    const hour = Math.min(23, Math.max(0, Number.parseInt(hourText, 10) || 0));
    const minute = Math.min(59, Math.max(0, Number.parseInt(minuteText, 10) || 0));
    const nextReminder = { ...reminder, hour, minute };
    const nextListening = { ...listening, rate: Math.min(2, Math.max(0.5, Number.parseFloat(String(listening.rate)) || 1.2)), gapSeconds: Math.min(30, Math.max(0, Number.parseInt(String(listening.gapSeconds), 10) || 0)), ambienceVolume: Math.min(100, Math.max(0, Number.parseInt(String(listening.ambienceVolume), 10) || 0)) };
    setSaving(true);
    const result = await setDailyReminder(nextReminder);
    await saveListeningSettings(nextListening);
    await saveDailyGoal(Math.min(999, Math.max(1, Number.parseInt(goalText, 10) || 5)));
    setPlayerSettings(nextListening);
    setReminder(nextReminder); setListening(nextListening); setSaving(false);
    if (nextReminder.enabled && !result.granted) Alert.alert("Bildirim izni gerekli", "Hatırlatıcıyı çalıştırmak için Android bildirim izni vermelisin.");
    else Alert.alert("Ayarlar kaydedildi", "Dinleme ve hatırlatıcı ayarların güncellendi.");
  };

  const pickAmbience = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (!result.canceled) setListening((current) => ({ ...current, ambienceUri: result.assets[0].uri, ambienceName: result.assets[0].name }));
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Ionicons name="chevron-back" size={22} color={colors.ink} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>UYGULAMAN</Text><Text style={styles.title}>Ayarlar</Text></View><AppTopActions /></View>

          <Text style={styles.sectionTitle}>Bildirim hatırlatıcı</Text>
          <View style={styles.card}>
            <View style={styles.cardHeading}><View style={styles.cardIcon}><Ionicons name="notifications-outline" size={19} color={colors.orange} /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>Günlük hatırlatıcı</Text><Text style={styles.cardSubtitle}>Her gün belirlediğin saatte sakin bir mola</Text></View><Pressable onPress={() => setReminder((current) => ({ ...current, enabled: !current.enabled }))} style={({ pressed }) => [styles.switch, reminder.enabled && styles.switchOn, pressed && styles.pressed]} accessibilityRole="switch" accessibilityState={{ checked: reminder.enabled }}><View style={[styles.switchKnob, reminder.enabled && styles.switchKnobOn]} /></Pressable></View>
            <View style={styles.timeRow}><Text style={styles.rowLabel}>Bildirim saati</Text><View style={styles.timeInputs}><TextInput value={hourText} onChangeText={setHourText} keyboardType="number-pad" maxLength={2} style={styles.timeInput} /><Text style={styles.colon}>:</Text><TextInput value={minuteText} onChangeText={setMinuteText} keyboardType="number-pad" maxLength={2} style={styles.timeInput} /></View></View>
            <Text style={styles.helper}>Saati 00–23, dakikayı 00–59 arasında elle yazabilirsin.</Text>
          </View>

          <Text style={styles.sectionTitle}>Günlük hedef</Text>
          <View style={styles.card}><View style={styles.goalRow}><View style={styles.goalIcon}><Ionicons name="locate-outline" size={19} color={colors.primary} /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>Bugün kaç şükran?</Text><Text style={styles.cardSubtitle}>Ana sayfadaki ilerleme çubuğu bu hedefi kullanır.</Text></View><View style={styles.goalInputWrap}><TextInput value={goalText} onChangeText={setGoalText} keyboardType="number-pad" maxLength={3} style={styles.goalInput} /><Text style={styles.suffix}>madde</Text></View></View></View>

          <Text style={styles.sectionTitle}>Dosya aktarımı</Text>
          <View style={styles.card}><View style={styles.cardHeading}><View style={styles.cardIcon}><Ionicons name="swap-horizontal-outline" size={19} color={colors.primary} /></View><View style={styles.cardCopy}><Text style={styles.cardTitle}>Günlüğünü taşı</Text><Text style={styles.cardSubtitle}>Şükranlarını JSON dosyası olarak sakla veya geri yükle.</Text></View></View><View style={styles.transferRow}><Pressable onPress={exportData} style={styles.transferButton}><Ionicons name="share-outline" size={16} color={colors.primary} /><Text style={styles.transferText}>Dışarı aktar</Text></Pressable><Pressable onPress={importData} style={styles.transferButton}><Ionicons name="download-outline" size={16} color={colors.primary} /><Text style={styles.transferText}>İçeri aktar</Text></Pressable></View></View>

          <Text style={styles.sectionTitle}>Günlük görünümü</Text>
          <View style={styles.card}><Pressable onPress={() => savePreference({ ...preferences, entrySort: preferences.entrySort === "newest" ? "oldest" : "newest" })} style={styles.preferenceRow}><View style={styles.cardCopy}><Text style={styles.cardTitle}>Şükran sıralaması</Text><Text style={styles.cardSubtitle}>{preferences.entrySort === "newest" ? "Yeni yazdıkların üstte" : "İlk yazdıkların üstte"}</Text></View><Ionicons name="swap-vertical-outline" size={20} color={colors.primary} /></Pressable><Pressable onPress={() => savePreference({ ...preferences, privacyLock: !preferences.privacyLock })} style={styles.preferenceRow}><View style={styles.cardCopy}><Text style={styles.cardTitle}>Mahremiyet kilidi</Text><Text style={styles.cardSubtitle}>{preferences.privacyLock ? "Uygulama açılışında kilitli" : "Kapalı"}</Text></View><Ionicons name={preferences.privacyLock ? "lock-closed" : "lock-open-outline"} size={19} color={colors.primary} /></Pressable><Text style={styles.cardTitle}>Tema seçimi</Text><View style={styles.themeGrid}>{["Zümrüt Bahçe", "Altın Güneş", "Yakut Akşamı", "Kraliyet Moru", "Mercan Rüyası", "Gece Safiri", "Çöl Bakırı", "Turkuaz Lagün", "Safran İncisi", "Buzul Mavisi"].map((theme) => <Pressable key={theme} onPress={() => savePreference({ ...preferences, theme })} style={[styles.themeChip, preferences.theme === theme && styles.themeChipActive]}><Text style={[styles.themeChipText, preferences.theme === theme && styles.themeChipTextActive]}>{theme}</Text></Pressable>)}</View></View>

          <Text style={styles.sectionTitle}>Dinleme ayarları</Text>
          <View style={styles.card}>
            <Field label="Çalma hızı" value={String(listening.rate)} onChangeText={(value) => setListening((current) => ({ ...current, rate: Number.parseFloat(value) || 0.5 }))} suffix="x" />
            <Field label="Şükranlar arası bekleme" value={String(listening.gapSeconds)} onChangeText={(value) => setListening((current) => ({ ...current, gapSeconds: Number.parseInt(value, 10) || 0 }))} suffix="sn" keyboardType="number-pad" />
            <Field label="Şükran okunurken atmosfer sesi" value={String(listening.ambienceVolume)} onChangeText={(value) => setListening((current) => ({ ...current, ambienceVolume: Number.parseInt(value, 10) || 0 }))} suffix="%" keyboardType="number-pad" />
            <Pressable onPress={() => setListening((current) => ({ ...current, backgroundPlayback: !current.backgroundPlayback }))} style={styles.preferenceRow} accessibilityRole="switch" accessibilityState={{ checked: listening.backgroundPlayback }}><View style={styles.cardCopy}><Text style={styles.cardTitle}>Arka planda oynatma</Text><Text style={styles.cardSubtitle}>{listening.backgroundPlayback ? "Ekran kapalıyken devam eder" : "Uygulama arka plana geçince durur"}</Text></View><View style={[styles.switch, listening.backgroundPlayback && styles.switchOn]}><View style={[styles.switchKnob, listening.backgroundPlayback && styles.switchKnobOn]} /></View></Pressable>
            <Text style={styles.helper}>Şükranlar arası beklemede atmosfer sesi %100’e çıkar; geçiş 200 ms içinde yumuşakça yapılır.</Text>
            <View style={styles.musicRow}><View style={styles.musicIcon}><Ionicons name="musical-notes-outline" size={18} color={colors.primary} /></View><View style={styles.musicCopy}><Text style={styles.musicTitle}>Atmosfer müziği</Text><Text numberOfLines={1} style={styles.musicText}>{listening.ambienceName || "Bir preset seç veya telefondan ses seç"}</Text></View>{listening.ambienceUri && <Pressable onPress={() => setListening((current) => ({ ...current, ambienceUri: null, ambienceName: null }))} style={styles.removeButton}><Ionicons name="trash-outline" size={16} color={colors.danger} /></Pressable>}<Pressable onPress={pickAmbience} style={({ pressed }) => [styles.chooseButton, pressed && styles.pressed]}><Ionicons name="folder-open-outline" size={15} color={colors.primary} /><Text style={styles.chooseText}>Dosya</Text></Pressable></View>
          </View>

          <Pressable onPress={saveAll} disabled={saving} style={({ pressed }) => [styles.saveButton, saving && styles.disabled, pressed && styles.pressed]}><Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" /><Text style={styles.saveText}>{saving ? "Kaydediliyor" : "Ayarları kaydet"}</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { paddingHorizontal: 22, paddingBottom: 40, paddingTop: 18 }, header: { alignItems: "center", flexDirection: "row", marginBottom: 27 }, backButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, height: 40, justifyContent: "center", marginRight: 11, width: 40 }, headerCopy: { flex: 1 }, eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.6, marginBottom: 4 }, title: { color: colors.ink, fontSize: 30, fontWeight: "800" }, settingsIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 20, height: 40, justifyContent: "center", width: 40 }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", marginBottom: 11, marginTop: 4 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 21, borderWidth: 1, marginBottom: 24, padding: 15 }, cardHeading: { alignItems: "center", flexDirection: "row" }, cardIcon: { alignItems: "center", backgroundColor: colors.orangeSoft, borderRadius: 15, height: 34, justifyContent: "center", marginRight: 10, width: 34 }, cardCopy: { flex: 1 }, cardTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" }, cardSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 }, goalRow: { alignItems: "center", flexDirection: "row" }, goalIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 15, height: 34, justifyContent: "center", marginRight: 10, width: 34 }, goalInputWrap: { alignItems: "center", backgroundColor: "#F3F5F1", borderRadius: 9, flexDirection: "row", paddingHorizontal: 4 }, goalInput: { color: colors.ink, fontSize: 15, fontWeight: "800", height: 47, paddingHorizontal: 7, textAlign: "right", width: 55 }, cloudButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14, paddingVertical: 11 }, cloudButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" }, switch: { backgroundColor: "#CFD5D0", borderRadius: 12, height: 24, justifyContent: "center", padding: 2, width: 42 }, switchOn: { backgroundColor: colors.primary }, switchKnob: { backgroundColor: colors.surface, borderRadius: 10, height: 20, width: 20 }, switchKnobOn: { alignSelf: "flex-end" }, timeRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 15, paddingTop: 14 }, rowLabel: { color: colors.ink, fontSize: 12, fontWeight: "700" }, timeInputs: { alignItems: "center", flexDirection: "row" }, timeInput: { backgroundColor: "#F3F5F1", borderRadius: 9, color: colors.ink, fontSize: 15, fontWeight: "800", height: 47, textAlign: "center", width: 48 }, colon: { color: colors.ink, fontSize: 16, fontWeight: "800", marginHorizontal: 4 }, helper: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 10 }, field: { alignItems: "center", borderBottomColor: "#F0F1ED", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 51 }, fieldLabel: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: "700" }, fieldInputWrap: { alignItems: "center", backgroundColor: "#F3F5F1", borderRadius: 9, flexDirection: "row", paddingHorizontal: 4 }, fieldInput: { color: colors.ink, fontSize: 13, fontWeight: "800", height: 47, paddingHorizontal: 7, textAlign: "right", width: 62 }, suffix: { color: colors.muted, fontSize: 11, fontWeight: "700", paddingRight: 6 }, musicRow: { alignItems: "center", backgroundColor: "#F3F5F1", borderRadius: 14, flexDirection: "row", marginTop: 14, padding: 10 }, musicIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 13, height: 30, justifyContent: "center", width: 30 }, musicCopy: { flex: 1, marginHorizontal: 9 }, musicTitle: { color: colors.ink, fontSize: 11, fontWeight: "800" }, musicText: { color: colors.muted, fontSize: 9, marginTop: 3 }, chooseButton: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 9, flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 7 }, chooseText: { color: colors.primary, fontSize: 10, fontWeight: "800" }, removeButton: { marginRight: 3, padding: 5 }, saveButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 15, flexDirection: "row", gap: 8, justifyContent: "center", paddingVertical: 14 }, saveText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" }, transferRow: { flexDirection: "row", gap: 9, marginTop: 14 }, transferButton: { alignItems: "center", backgroundColor: "#F3F5F1", borderRadius: 12, flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 48 }, transferText: { color: colors.primary, fontSize: 11, fontWeight: "800" }, preferenceRow: { alignItems: "center", borderBottomColor: "#F0F1ED", borderBottomWidth: 1, flexDirection: "row", minHeight: 66 }, themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }, themeChip: { backgroundColor: "#F3F5F1", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 }, themeChipActive: { backgroundColor: colors.primary }, themeChipText: { color: colors.muted, fontSize: 10, fontWeight: "700" }, themeChipTextActive: { color: "#FFFFFF" }, presetGrid: { gap: 9, marginTop: 14 }, presetCard: { backgroundColor: "#F3F5F1", borderRadius: 14, padding: 11 }, presetCopy: { alignItems: "center", flexDirection: "row" }, presetActions: { flexDirection: "row", gap: 8, marginTop: 9 }, previewButton: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 9, flex: 1, flexDirection: "row", gap: 5, justifyContent: "center", minHeight: 34 }, selectPreset: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 9, justifyContent: "center", minWidth: 60, paddingHorizontal: 10 }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] } });
