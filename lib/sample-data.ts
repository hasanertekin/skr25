import AsyncStorage from "@react-native-async-storage/async-storage";
import { GRATITUDE_STORAGE_KEY, type GratitudeEntry } from "@/lib/gratitude";
import { DEFAULT_PLAYLIST_ID, PLAYLISTS_KEY, PLAYLIST_FOLDERS_KEY, type Playlist, type PlaylistFolder } from "@/lib/playlists";

const SAMPLE_SEED_KEY = "sukur-gunlugu.sample-seed.v3";
const now = () => new Date().toISOString();

const sampleEntries: GratitudeEntry[] = [
  { id: "sample-yoga-entry", text: "Yoga yaptığım için şükrediyorum", createdAt: now(), favorite: true },
  { id: "sample-yoga-entry-2", text: "Nefesime odaklanabildiğim için şükrediyorum", createdAt: now(), favorite: true },
  { id: "sample-yoga-entry-3", text: "Bedenimi dinlediğim için şükrediyorum", createdAt: now(), favorite: true },
  { id: "sample-sport-entry-1", text: "Hareket etmek için enerjim olduğu için şükrediyorum", createdAt: now(), favorite: true },
  { id: "sample-sport-entry-2", text: "Spor sonrası hafiflediğim için şükrediyorum", createdAt: now(), favorite: true },
  { id: "sample-sport-entry-3", text: "Kendime zaman ayırdığım için şükrediyorum", createdAt: now(), favorite: true },
  { id: "sample-focus-entry", text: "Odaklanabildiğim için şükrediyorum", createdAt: now(), favorite: true },
  { id: "sample-evening-entry", text: "Günü huzurla tamamladığım için şükrediyorum", createdAt: now(), favorite: true },
];
const sampleFolders: PlaylistFolder[] = [
  { id: "sample-folder-habits", name: "Alışkanlıklar", createdAt: now(), coverId: "morning-lake", parentId: null, sortOrder: 0 },
  { id: "sample-folder-focus", name: "Odak ve Denge", createdAt: now(), coverId: "olive-garden", parentId: null, sortOrder: 1 },
  { id: "sample-folder-evening", name: "Akşam Ritüeli", createdAt: now(), coverId: "garden-path", parentId: null, sortOrder: 2 },
];
const samplePlaylists: Playlist[] = [
  { id: "sample-playlist-yoga", name: "Yoga", entryIds: ["sample-yoga-entry", "sample-yoga-entry-2", "sample-yoga-entry-3"], createdAt: now(), folderId: "sample-folder-habits", sortOrder: 0 },
  { id: "sample-playlist-sport", name: "Spor", entryIds: ["sample-sport-entry-1", "sample-sport-entry-2", "sample-sport-entry-3"], createdAt: now(), folderId: "sample-folder-habits", sortOrder: 1 },
  { id: "sample-playlist-focus", name: "Odaklanma", entryIds: ["sample-focus-entry"], createdAt: now(), folderId: "sample-folder-focus", sortOrder: 0 },
  { id: "sample-playlist-evening", name: "Akşam Şükranları", entryIds: ["sample-evening-entry"], createdAt: now(), folderId: "sample-folder-evening", sortOrder: 0 },
];

/** Adds persistent, predictable local data for testing folder, playlist and reorder flows. */
export async function ensureSampleLibraryData() {
  try {
    if (await AsyncStorage.getItem(SAMPLE_SEED_KEY)) return;
    const [rawEntries, rawPlaylists, rawFolders] = await Promise.all([AsyncStorage.getItem(GRATITUDE_STORAGE_KEY), AsyncStorage.getItem(PLAYLISTS_KEY), AsyncStorage.getItem(PLAYLIST_FOLDERS_KEY)]);
    const entries = Array.isArray(rawEntries ? JSON.parse(rawEntries) : []) ? JSON.parse(rawEntries || "[]") : [];
    const playlists = Array.isArray(rawPlaylists ? JSON.parse(rawPlaylists) : []) ? JSON.parse(rawPlaylists || "[]") : [];
    const folders = Array.isArray(rawFolders ? JSON.parse(rawFolders) : []) ? JSON.parse(rawFolders || "[]") : [];
    const entryIds = new Set(entries.map((item: GratitudeEntry) => item.id));
    const folderIds = new Set(folders.map((item: PlaylistFolder) => item.id));
    const playlistIds = new Set(playlists.map((item: Playlist) => item.id));
    const defaultPlaylist = playlists.find((item: Playlist) => item.id === DEFAULT_PLAYLIST_ID);
    const nextEntries = [...entries, ...sampleEntries.filter((item) => !entryIds.has(item.id))];
    const nextFolders = [...folders, ...sampleFolders.filter((item) => !folderIds.has(item.id))];
    const seededPlaylists = playlists.map((playlist: Playlist) => {
      const sample = samplePlaylists.find((item) => item.id === playlist.id);
      return sample ? { ...playlist, entryIds: [...new Set([...playlist.entryIds, ...sample.entryIds])] } : playlist;
    });
    const nextPlaylists = [
      ...(defaultPlaylist ? seededPlaylists : [{ id: DEFAULT_PLAYLIST_ID, name: "Şükürlerim", entryIds: [], createdAt: now() } as Playlist, ...seededPlaylists]),
      ...samplePlaylists.filter((item) => !playlistIds.has(item.id)),
    ];
    await Promise.all([AsyncStorage.setItem(GRATITUDE_STORAGE_KEY, JSON.stringify(nextEntries)), AsyncStorage.setItem(PLAYLIST_FOLDERS_KEY, JSON.stringify(nextFolders)), AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(nextPlaylists)), AsyncStorage.setItem(SAMPLE_SEED_KEY, "1")]);
  } catch {
    // Normal storage readers remain authoritative if an old local record is malformed.
  }
}
