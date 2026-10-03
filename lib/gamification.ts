import type { GratitudeEntry } from "@/lib/gratitude";

export type Badge = { id: string; icon: string; title: string; description: string; unlocked: boolean };

function dayKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
export function getDistinctDayCount(entries: GratitudeEntry[]) { return new Set(entries.map((entry) => dayKey(new Date(entry.createdAt)))).size; }
export function getCurrentStreak(entries: GratitudeEntry[]) { const days = new Set(entries.map((entry) => dayKey(new Date(entry.createdAt)))); const cursor = new Date(); cursor.setHours(0, 0, 0, 0); let streak = 0; while (days.has(dayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); } return streak; }

const badgeDefinitions: [string, string, string, string][] = [
  ["first", "sparkles-outline", "İlk kıvılcım", "İlk kaydını yaz"], ["three", "leaf-outline", "Filiz", "3 kayıt oluştur"], ["five", "heart-outline", "Kalp sesi", "5 kayıt oluştur"], ["ten", "star-outline", "Kıvılcım", "10 kayıt oluştur"], ["fifteen", "sunny-outline", "Güneşli gün", "15 kayıt oluştur"], ["twenty", "flower-outline", "Çiçeklenme", "20 kayıt oluştur"], ["thirty", "ribbon-outline", "İlk kurdele", "30 kayıt oluştur"], ["fifty", "diamond-outline", "Parlayan taş", "50 kayıt oluştur"], ["hundred", "trophy-outline", "Yüz ışık", "100 kayıt oluştur"], ["twohundred", "medal-outline", "Sabır madalyası", "200 kayıt oluştur"],
  ["day1", "today-outline", "Bugünün sesi", "Bugün yaz"], ["days3", "calendar-outline", "Üç gün", "3 farklı günde yaz"], ["days7", "calendar-number-outline", "Hafta ritmi", "7 farklı günde yaz"], ["days14", "time-outline", "İki haftalık iz", "14 farklı günde yaz"], ["days30", "map-outline", "Takvim gezgini", "30 farklı günde yaz"], ["days60", "navigate-outline", "Rota ustası", "60 farklı günde yaz"], ["days100", "flag-outline", "Yüz durak", "100 farklı günde yaz"], ["streak3", "flame-outline", "Üçlü seri", "3 gün seri yap"], ["streak7", "flame", "Alev alan ritim", "7 gün seri yap"], ["streak21", "rocket-outline", "Ritim roketi", "21 gün seri yap"],
  ["streak30", "planet-outline", "Ayın ritmi", "30 gün seri yap"], ["early", "sunrise-outline", "Güne erken", "Sabah kaydı ekle"], ["night", "moon-outline", "Gece düşüncesi", "Gece kaydı ekle"], ["weekend", "cafe-outline", "Hafta sonu", "Hafta sonu yaz"], ["monday", "refresh-outline", "Yeni hafta", "Pazartesi yaz"], ["listener", "volume-high-outline", "Dinleyen kalp", "Bir kaydı dinle"], ["listener10", "headset-outline", "Kulak veren", "10 kayıt dinle"], ["playlist", "musical-notes-outline", "Küratör", "Playlist oluştur"], ["playlists3", "albums-outline", "Arşivci", "3 playlist oluştur"], ["favorite", "star", "Seçici kalp", "Bir kaydı favorile"],
  ["goal", "locate-outline", "Hedefe varış", "Günlük hedefi tamamla"], ["goal3", "checkmark-done-outline", "Üç hedef", "3 günlük hedef tamamla"], ["goal7", "checkmark-circle-outline", "Hedef ustası", "7 günlük hedef tamamla"], ["overflow", "trending-up-outline", "Sınırı aşan", "Hedefini aş"], ["export", "share-outline", "Anı taşıyıcı", "Yedek dışa aktar"], ["theme", "color-palette-outline", "Renk koleksiyoncusu", "Tema değiştir"], ["profile", "person-circle-outline", "Kendini tanı", "Profilini düzenle"], ["search", "search-outline", "Arşiv kâşifi", "Geçmişte ara"], ["random", "shuffle-outline", "Sürpriz seçici", "Rastgele dinle"], ["edit", "create-outline", "İnce dokunuş", "Bir kaydı düzenle"],
  ["morning", "partly-sunny-outline", "Sabah ışığı", "Sabah 5 kayıt ekle"], ["evening", "cloudy-night-outline", "Akşam huzuru", "Akşam 5 kayıt ekle"], ["long", "hourglass-outline", "Uzun soluk", "30 günde yaz"], ["variety", "grid-outline", "Çeşitlilik", "5 farklı günde yaz"], ["kindness", "people-outline", "İnsan sıcaklığı", "Bir kişiye şükret"], ["nature", "water-outline", "Doğa farkındalığı", "Doğayla ilgili yaz"], ["self", "happy-outline", "Kendine şefkat", "Kendinle ilgili yaz"], ["memory", "images-outline", "Anı kutusu", "Bir anı yaz"], ["king", "shield-checkmark-outline", "Şükür ustası", "1260 kayda ulaş"], ["master", "infinite-outline", "Sonsuz minnet", "5000 kayda ulaş"],
];

export function getBadges(entries: GratitudeEntry[]): Badge[] {
  const count = entries.length;
  const days = getDistinctDayCount(entries);
  const streak = getCurrentStreak(entries);
  const hasHour = (min: number, max: number) => entries.some((entry) => { const hour = new Date(entry.createdAt).getHours(); return hour >= min && hour < max; });
  const hasWeekend = entries.some((entry) => [0, 6].includes(new Date(entry.createdAt).getDay()));
  const hasMonday = entries.some((entry) => new Date(entry.createdAt).getDay() === 1);
  const hasKeyword = (keywords: string[]) => entries.some((entry) => keywords.some((keyword) => entry.text.toLocaleLowerCase("tr-TR").includes(keyword)));
  const conditions: Record<string, boolean> = {
    first: count >= 1, three: count >= 3, five: count >= 5, ten: count >= 10, fifteen: count >= 15, twenty: count >= 20, thirty: count >= 30, fifty: count >= 50, hundred: count >= 100, twohundred: count >= 200,
    day1: days >= 1, days3: days >= 3, days7: days >= 7, days14: days >= 14, days30: days >= 30, days60: days >= 60, days100: days >= 100, streak3: streak >= 3, streak7: streak >= 7, streak21: streak >= 21, streak30: streak >= 30,
    early: hasHour(5, 10), night: hasHour(22, 24), weekend: hasWeekend, monday: hasMonday, morning: entries.filter((entry) => { const h = new Date(entry.createdAt).getHours(); return h >= 5 && h < 10; }).length >= 5, evening: entries.filter((entry) => { const h = new Date(entry.createdAt).getHours(); return h >= 18 && h < 24; }).length >= 5,
    listener: false, listener10: false, playlist: false, playlists3: false, favorite: entries.some((entry) => entry.favorite), goal: false, goal3: false, goal7: false, overflow: false, export: false, theme: false, profile: false, search: false, random: false, edit: false,
    long: days >= 30, variety: days >= 5, kindness: hasKeyword(["insan", "aile", "dost", "arkadaş"]), nature: hasKeyword(["doğa", "deniz", "ağaç", "güneş", "çiçek"]), self: hasKeyword(["kendim", "sağlığım", "huzur"]), memory: hasKeyword(["anı", "hatıra", "geçmiş"]), king: count >= 1260, master: count >= 5000,
  };
  return badgeDefinitions.map(([id, icon, title, description]) => ({ id, icon, title, description, unlocked: Boolean(conditions[id]) }));
}
