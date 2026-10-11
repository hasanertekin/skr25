import AsyncStorage from "@react-native-async-storage/async-storage";

export type GratitudeEntry = {
  id: string;
  text: string;
  createdAt: string;
  favorite?: boolean;
  audioUri?: string;
  audioName?: string;
  imageUri?: string;
  imageName?: string;
};

export const GRATITUDE_STORAGE_KEY = "sukur-gunlugu.entries.v1";

export async function loadGratitudeEntries(): Promise<GratitudeEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(GRATITUDE_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as GratitudeEntry[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (entry): entry is GratitudeEntry =>
          Boolean(entry) && typeof entry.id === "string" && typeof entry.text === "string" && typeof entry.createdAt === "string",
      )
      .map((entry) => ({
        ...entry,
        audioUri: typeof entry.audioUri === "string" ? entry.audioUri : undefined,
        audioName: typeof entry.audioName === "string" ? entry.audioName : undefined,
        imageUri: typeof entry.imageUri === "string" ? entry.imageUri : undefined,
        imageName: typeof entry.imageName === "string" ? entry.imageName : undefined,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export async function saveGratitudeEntries(entries: GratitudeEntry[]) {
  await AsyncStorage.setItem(GRATITUDE_STORAGE_KEY, JSON.stringify(entries));
}

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isToday(date: Date, reference = new Date()) {
  return localDateKey(date) === localDateKey(reference);
}

export function isWithinCurrentWeek(date: Date, reference = new Date()) {
  const start = new Date(reference);
  const day = start.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - distanceFromMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

export function isWithinCurrentMonth(date: Date, reference = new Date()) {
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

export function getEntriesForDay(entries: GratitudeEntry[], date: Date) {
  const key = localDateKey(date);
  return entries.filter((entry) => localDateKey(new Date(entry.createdAt)) === key).length;
}

export function getWeekChart(entries: GratitudeEntry[], reference = new Date()) {
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      label: date.toLocaleDateString("tr-TR", { weekday: "short" }).replace(".", ""),
      value: getEntriesForDay(entries, date),
      date,
    };
  });
}

export function getMonthChart(entries: GratitudeEntry[], reference = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const bucketCount = Math.ceil(daysInMonth / 7);

  return Array.from({ length: bucketCount }, (_, index) => {
    const startDay = index * 7 + 1;
    const endDay = Math.min(startDay + 6, daysInMonth);
    const value = entries.filter((entry) => {
      const date = new Date(entry.createdAt);
      return date.getFullYear() === year && date.getMonth() === month && date.getDate() >= startDay && date.getDate() <= endDay;
    }).length;

    return {
      label: `${startDay}-${endDay}`,
      value,
    };
  });
}

export function getDayChart(entries: GratitudeEntry[], reference = new Date()) {
  const end = new Date(reference);
  end.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (6 - index));
    return {
      label: date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }).replace(".", ""),
      value: getEntriesForDay(entries, date),
    };
  });
}

export function pickRandomEntries(entries: GratitudeEntry[], count: number, random = Math.random) {
  const safeCount = Math.max(0, Math.min(entries.length, Math.floor(count)));
  return [...entries].sort(() => random() - 0.5).slice(0, safeCount);
}

export function getYearChart(entries: GratitudeEntry[], reference = new Date()) {
  const year = reference.getFullYear();
  return Array.from({ length: 12 }, (_, month) => ({
    label: new Date(year, month, 1).toLocaleDateString("tr-TR", { month: "short" }).replace(".", ""),
    value: entries.filter((entry) => { const date = new Date(entry.createdAt); return date.getFullYear() === year && date.getMonth() === month; }).length,
  }));
}

export function getMonthsOfYearChart(entries: GratitudeEntry[], reference = new Date()) {
  const year = reference.getFullYear();
  return Array.from({ length: 12 }, (_, month) => ({ label: new Date(year, month, 1).toLocaleDateString("tr-TR", { month: "short" }).replace(".", ""), value: entries.filter((entry) => { const date = new Date(entry.createdAt); return date.getFullYear() === year && date.getMonth() === month; }).length }));
}
export function getWeeksChart(entries: GratitudeEntry[], reference = new Date()) {
  const day = new Date(reference); const monday = new Date(day); monday.setHours(0, 0, 0, 0); const mondayOffset = (monday.getDay() + 6) % 7; monday.setDate(monday.getDate() - mondayOffset - 6 * 7);
  return Array.from({ length: 7 }, (_, index) => { const start = new Date(monday); start.setDate(monday.getDate() + index * 7); const end = new Date(start); end.setDate(start.getDate() + 7); return { label: `${start.getDate()}.${start.getMonth() + 1}`, value: entries.filter((entry) => { const date = new Date(entry.createdAt); return date >= start && date < end; }).length }; });
}
export function getYearsChart(entries: GratitudeEntry[], reference = new Date()) {
  const currentYear = reference.getFullYear();
  return Array.from({ length: 6 }, (_, index) => { const year = currentYear - 5 + index; return { label: String(year), value: entries.filter((entry) => new Date(entry.createdAt).getFullYear() === year).length }; });
}
