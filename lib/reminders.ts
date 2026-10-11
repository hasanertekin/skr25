import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const REMINDER_SETTINGS_KEY = "sukur-gunlugu.reminder.v1";
export const DAILY_REMINDER_ID_KEY = "sukur-gunlugu.reminder.notification-id";
export const MEDIA_NOTIFICATION_CATEGORY = "gratitude-media";
export const MEDIA_NOTIFICATION_CHANNEL = "gratitude-media-silent-v2";
export const MEDIA_ACTION_PREVIOUS = "media-previous";
export const MEDIA_ACTION_TOGGLE = "media-toggle";
export const MEDIA_ACTION_NEXT = "media-next";
export const MEDIA_ACTION_STOP = "media-stop";

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
};

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 20,
  minute: 0,
};

export async function loadReminderSettings(): Promise<ReminderSettings> {
  try {
    const stored = await AsyncStorage.getItem(REMINDER_SETTINGS_KEY);
    if (!stored) return DEFAULT_REMINDER;
    const parsed = JSON.parse(stored) as Partial<ReminderSettings>;
    return {
      enabled: Boolean(parsed.enabled),
      hour: typeof parsed.hour === "number" ? parsed.hour : DEFAULT_REMINDER.hour,
      minute: typeof parsed.minute === "number" ? parsed.minute : DEFAULT_REMINDER.minute,
    };
  } catch {
    return DEFAULT_REMINDER;
  }
}

async function saveReminderSettings(settings: ReminderSettings) {
  await AsyncStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings));
}

export async function configureNotifications() {
  if (Platform.OS === "web") return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isMediaNotification = notification.request.content.data?.kind === "gratitude-media";
      return {
      shouldShowAlert: true,
      shouldPlaySound: !isMediaNotification,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
      };
    },
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("gratitude-reminder", {
      name: "Şükür hatırlatıcıları",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#2F7D5A",
    });
    await Notifications.setNotificationChannelAsync(MEDIA_NOTIFICATION_CHANNEL, {
      name: "Şükran oynatıcı kontrolleri",
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0],
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  await Notifications.setNotificationCategoryAsync(MEDIA_NOTIFICATION_CATEGORY, [
    { identifier: MEDIA_ACTION_PREVIOUS, buttonTitle: "Önceki", options: { opensAppToForeground: false } },
    { identifier: MEDIA_ACTION_TOGGLE, buttonTitle: "Oynat / Duraklat", options: { opensAppToForeground: false } },
    { identifier: MEDIA_ACTION_NEXT, buttonTitle: "Sonraki", options: { opensAppToForeground: false } },
    { identifier: MEDIA_ACTION_STOP, buttonTitle: "Durdur", options: { isDestructive: true, opensAppToForeground: false } },
  ]).catch(() => undefined);
}

export async function setDailyReminder(settings: ReminderSettings) {
  if (Platform.OS === "web") {
    await saveReminderSettings(settings);
    return { granted: false, reason: "web" as const };
  }

  await configureNotifications();
  const existingId = await AsyncStorage.getItem(DAILY_REMINDER_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(() => undefined);
    await AsyncStorage.removeItem(DAILY_REMINDER_ID_KEY);
  }

  if (!settings.enabled) {
    await saveReminderSettings(settings);
    return { granted: true };
  }

  const permission = await Notifications.getPermissionsAsync();
  const finalPermission = permission.status === "granted" ? permission : await Notifications.requestPermissionsAsync();
  if (finalPermission.status !== "granted") {
    const disabled = { ...settings, enabled: false };
    await saveReminderSettings(disabled);
    return { granted: false, reason: "permission" as const };
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Şükür için küçük bir mola",
      body: "Bugün kalbinden geçen güzel bir şeyi günlüğüne bırak.",
      sound: "default",
      data: { screen: "today" },
      ...(Platform.OS === "android" ? { channelId: "gratitude-reminder" } : {}),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: settings.hour, minute: settings.minute },
  });
  await AsyncStorage.setItem(DAILY_REMINDER_ID_KEY, notificationId);
  await saveReminderSettings(settings);
  return { granted: true };
}
