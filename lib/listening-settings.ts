import AsyncStorage from "@react-native-async-storage/async-storage";

export const LISTENING_SETTINGS_KEY = "sukur-gunlugu.listening.v1";
export const DEFAULT_AMBIENCE_URI = "bundled:gentle-stream-loop";
export const DEFAULT_AMBIENCE_NAME = "Yumuşak Akış (varsayılan)";

export type ListeningSettings = {
  rate: number;
  gapSeconds: number;
  ambienceUri: string | null;
  ambienceName: string | null;
  ambienceVolume: number;
  backgroundPlayback: boolean;
};

export const DEFAULT_LISTENING_SETTINGS: ListeningSettings = {
  rate: 1.2,
  gapSeconds: 2,
  ambienceUri: DEFAULT_AMBIENCE_URI,
  ambienceName: DEFAULT_AMBIENCE_NAME,
  ambienceVolume: 35,
  backgroundPlayback: true,
};

export function normalizeListeningSettings(parsed: Partial<ListeningSettings>): ListeningSettings {
  return {
    rate: typeof parsed.rate === "number" ? Math.min(2, Math.max(0.5, parsed.rate)) : DEFAULT_LISTENING_SETTINGS.rate,
    gapSeconds: typeof parsed.gapSeconds === "number" ? Math.min(30, Math.max(0, parsed.gapSeconds)) : DEFAULT_LISTENING_SETTINGS.gapSeconds,
    ambienceUri: typeof parsed.ambienceUri === "string" ? parsed.ambienceUri : DEFAULT_AMBIENCE_URI,
    ambienceName: typeof parsed.ambienceName === "string" ? parsed.ambienceName : DEFAULT_AMBIENCE_NAME,
    ambienceVolume: typeof parsed.ambienceVolume === "number" ? Math.min(100, Math.max(0, parsed.ambienceVolume)) : DEFAULT_LISTENING_SETTINGS.ambienceVolume,
    backgroundPlayback: typeof parsed.backgroundPlayback === "boolean" ? parsed.backgroundPlayback : DEFAULT_LISTENING_SETTINGS.backgroundPlayback,
  };
}

export async function loadListeningSettings(): Promise<ListeningSettings> {
  try {
    const stored = await AsyncStorage.getItem(LISTENING_SETTINGS_KEY);
    if (!stored) return DEFAULT_LISTENING_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<ListeningSettings>;
    return normalizeListeningSettings(parsed);
  } catch {
    return DEFAULT_LISTENING_SETTINGS;
  }
}

export async function saveListeningSettings(settings: ListeningSettings) {
  await AsyncStorage.setItem(LISTENING_SETTINGS_KEY, JSON.stringify(settings));
}
