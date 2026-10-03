import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import type { GratitudeEntry } from "@/lib/gratitude";
import type { Playlist } from "@/lib/playlists";
import { DEFAULT_LISTENING_SETTINGS, normalizeListeningSettings, type ListeningSettings } from "@/lib/listening-settings";
import { DEFAULT_REMINDER, type ReminderSettings } from "@/lib/reminders";

export type EntrySort = "newest" | "oldest";
export type AppPreferences = { privacyLock: boolean; theme: string; entrySort: EntrySort };
export type ProfilePreferences = { displayName: string; bio: string; avatarUri: string | null };
export type FullJournalBackup = { version: 2; exportedAt: string; entries: GratitudeEntry[]; preferences: AppPreferences; profile: ProfilePreferences; dailyGoal: number; playlists: Playlist[]; listening: ListeningSettings; reminder: ReminderSettings };
export const APP_PREFERENCES_KEY = "sukur-gunlugu.preferences.v1";
export const PROFILE_PREFERENCES_KEY = "sukur-gunlugu.profile.v1";
export const defaultPreferences: AppPreferences = { privacyLock: false, theme: "Zümrüt Bahçe", entrySort: "newest" };
export const defaultProfile: ProfilePreferences = { displayName: "", bio: "", avatarUri: null };
export const themes = ["Zümrüt Bahçe", "Altın Güneş", "Yakut Akşamı", "Kraliyet Moru", "Mercan Rüyası", "Gece Safiri", "Çöl Bakırı", "Turkuaz Lagün", "Safran İncisi", "Buzul Mavisi"];

export async function loadPreferences(): Promise<AppPreferences> { try { const value = JSON.parse((await AsyncStorage.getItem(APP_PREFERENCES_KEY)) || "null"); return { ...defaultPreferences, ...(value || {}) }; } catch { return defaultPreferences; } }
export async function savePreferences(value: AppPreferences) { await AsyncStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(value)); }
export async function loadProfilePreferences(): Promise<ProfilePreferences> { try { const value = JSON.parse((await AsyncStorage.getItem(PROFILE_PREFERENCES_KEY)) || "null"); return { ...defaultProfile, ...(value || {}) }; } catch { return defaultProfile; } }
export async function saveProfilePreferences(value: ProfilePreferences) { await AsyncStorage.setItem(PROFILE_PREFERENCES_KEY, JSON.stringify(value)); }

export async function exportJournal(backup: FullJournalBackup) { const uri = `${FileSystem.cacheDirectory}sukur-gunlugu-${new Date().toISOString().slice(0, 10)}.json`; await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup, null, 2)); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Şükür Günlüğü tam yedeğini dışarı aktar" }); }
export async function importJournal(): Promise<FullJournalBackup | null> { const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true }); if (result.canceled) return null; const raw = await FileSystem.readAsStringAsync(result.assets[0].uri); const parsed = JSON.parse(raw) as Partial<FullJournalBackup>; if (!Array.isArray(parsed.entries)) throw new Error("Geçersiz günlük dosyası"); const playlists = Array.isArray(parsed.playlists) ? parsed.playlists.filter((item): item is Playlist => Boolean(item) && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.entryIds)).map((item) => ({ ...item, entryIds: item.entryIds.filter((id): id is string => typeof id === "string") })) : []; const reminder = parsed.reminder && typeof parsed.reminder === "object" ? { ...DEFAULT_REMINDER, ...parsed.reminder } : DEFAULT_REMINDER; return { version: 2, exportedAt: parsed.exportedAt || new Date().toISOString(), entries: parsed.entries.filter((item) => item && typeof item.id === "string" && typeof item.text === "string" && typeof item.createdAt === "string"), preferences: { ...defaultPreferences, ...(parsed.preferences || {}) }, profile: { ...defaultProfile, ...(parsed.profile || {}) }, dailyGoal: typeof parsed.dailyGoal === "number" ? Math.min(999, Math.max(1, Math.floor(parsed.dailyGoal))) : 5, playlists, listening: normalizeListeningSettings(parsed.listening || DEFAULT_LISTENING_SETTINGS), reminder: { enabled: Boolean(reminder.enabled), hour: Math.min(23, Math.max(0, Number(reminder.hour) || 0)), minute: Math.min(59, Math.max(0, Number(reminder.minute) || 0)) } }; }
