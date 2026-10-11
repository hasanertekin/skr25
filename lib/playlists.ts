import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GratitudeEntry } from "@/lib/gratitude";

export const FOLDER_COVER_IDS = ["morning-lake", "olive-garden", "garden-path"] as const;
export type FolderCoverId = (typeof FOLDER_COVER_IDS)[number];

export type Playlist = {
  id: string;
  name: string;
  entryIds: string[];
  createdAt: string;
  atmosphereUri?: string | null;
  atmosphereName?: string | null;
  voiceIdentifier?: string | null;
  speechRate?: number;
  /** Marks a user-selected name or a completed one-time legacy-name migration. */
  nameCustomized?: boolean;
  /** A playlist belongs to at most one folder; null/undefined means library root. */
  folderId?: string | null;
  /** Shared ordering index among playlists and folders at the same level. */
  sortOrder?: number;
  /** Optional user-selected visual marker shown instead of the default list icon. */
  emoji?: string | null;
};

export type PlaylistFolder = {
  id: string;
  name: string;
  createdAt: string;
  /** Built-in cover selected from the small, bundled folder-cover set. */
  coverId?: FolderCoverId | null;
  coverUri?: string | null;
  atmosphereUri?: string | null;
  atmosphereName?: string | null;
  voiceIdentifier?: string | null;
  speechRate?: number;
  /** Parent folder ID; null/undefined means library root. */
  parentId?: string | null;
  /** Shared ordering index among playlists and folders at the same level. */
  sortOrder?: number;
};

export type LibraryItem =
  | { kind: "playlist"; id: string; createdAt: string; sortOrder?: number; playlist: Playlist }
  | { kind: "folder"; id: string; createdAt: string; sortOrder?: number; folder: PlaylistFolder };

export const PLAYLISTS_KEY = "sukur-gunlugu.playlists.v1";
export const PLAYLIST_FOLDERS_KEY = "sukur-gunlugu.playlist-folders.v1";
export const DEFAULT_PLAYLIST_ID = "playlist-general";

export function createLibraryId(prefix: "playlist" | "folder") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadPlaylists(): Promise<Playlist[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAYLISTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.entryIds))
        .map((item) => ({
          ...item,
          entryIds: item.entryIds.filter((id: unknown): id is string => typeof id === "string"),
          folderId: typeof item.folderId === "string" ? item.folderId : null,
          sortOrder: Number.isInteger(item.sortOrder) && item.sortOrder >= 0 ? item.sortOrder : undefined,
          emoji: typeof item.emoji === "string" && item.emoji.length <= 8 ? item.emoji : null,
        }))
      : [];
  } catch { return []; }
}

export async function savePlaylists(playlists: Playlist[]) {
  await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
}

export function normalizePlaylistFolders(value: unknown): PlaylistFolder[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, PlaylistFolder>();
  for (const item of value) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.createdAt !== "string" || unique.has(item.id)) continue;
    unique.set(item.id, {
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      coverId: FOLDER_COVER_IDS.includes(item.coverId) ? item.coverId : null,
      coverUri: typeof item.coverUri === "string" ? item.coverUri : null,
      atmosphereUri: typeof item.atmosphereUri === "string" ? item.atmosphereUri : null,
      atmosphereName: typeof item.atmosphereName === "string" ? item.atmosphereName : null,
      voiceIdentifier: typeof item.voiceIdentifier === "string" ? item.voiceIdentifier : null,
      speechRate: typeof item.speechRate === "number" ? Math.min(2, Math.max(0.5, item.speechRate)) : undefined,
      parentId: typeof item.parentId === "string" && item.parentId !== item.id ? item.parentId : null,
      sortOrder: Number.isInteger(item.sortOrder) && item.sortOrder >= 0 ? item.sortOrder : undefined,
    });
  }
  const ids = new Set(unique.keys());
  const normalized = [...unique.values()].map((folder) => ({
    ...folder,
    parentId: folder.parentId && ids.has(folder.parentId) ? folder.parentId : null,
  }));
  const parentById = new Map(normalized.map((folder) => [folder.id, folder.parentId ?? null]));
  return normalized.map((folder) => {
    const seen = new Set([folder.id]);
    let parentId = folder.parentId ?? null;
    while (parentId) {
      if (seen.has(parentId)) return { ...folder, parentId: null };
      seen.add(parentId);
      parentId = parentById.get(parentId) ?? null;
    }
    return folder;
  });
}

export async function loadPlaylistFolders(): Promise<PlaylistFolder[]> {
  try {
    return normalizePlaylistFolders(JSON.parse((await AsyncStorage.getItem(PLAYLIST_FOLDERS_KEY)) || "[]"));
  } catch { return []; }
}

export async function savePlaylistFolders(folders: PlaylistFolder[]) {
  await AsyncStorage.setItem(PLAYLIST_FOLDERS_KEY, JSON.stringify(normalizePlaylistFolders(folders)));
}

export function playlistsInFolder(playlists: Playlist[], folderId: string | null) {
  return playlists.filter((playlist) => (playlist.folderId ?? null) === folderId);
}

/** Return every playlist below a folder, preserving each level's shared folder/list order. */
export function playlistsInFolderTree(playlists: Playlist[], folders: PlaylistFolder[], parentId: string): Playlist[] {
  const result: Playlist[] = [];
  const visited = new Set<string>();
  const visit = (folderId: string) => {
    if (visited.has(folderId)) return;
    visited.add(folderId);
    for (const item of libraryItemsInFolder(playlists, folders, folderId)) {
      if (item.kind === "playlist") result.push(item.playlist);
      else visit(item.folder.id);
    }
  };
  visit(parentId);
  return result;
}

/** Return direct child folders and playlists in the persisted, mixed order. */
export function libraryItemsInFolder(playlists: Playlist[], folders: PlaylistFolder[], parentId: string | null): LibraryItem[] {
  const items: LibraryItem[] = [
    ...playlistsInFolder(playlists, parentId).map((playlist) => ({ kind: "playlist" as const, id: playlist.id, createdAt: playlist.createdAt, sortOrder: playlist.sortOrder, playlist })),
    ...folders.filter((folder) => (folder.parentId ?? null) === parentId).map((folder) => ({ kind: "folder" as const, id: folder.id, createdAt: folder.createdAt, sortOrder: folder.sortOrder, folder })),
  ];
  const completeManualOrder = items.length > 0 && items.every((item) => Number.isInteger(item.sortOrder) && (item.sortOrder ?? -1) >= 0);
  return items.sort((a, b) => {
    if (completeManualOrder) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id);
    const byDate = a.createdAt.localeCompare(b.createdAt);
    if (byDate) return byDate;
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** Persist one shared ordering sequence without moving items between folders. */
export function applyLibraryOrder(items: LibraryItem[], playlists: Playlist[], folders: PlaylistFolder[], parentId: string | null) {
  const order = new Map(items.map((item, index) => [`${item.kind}:${item.id}`, index]));
  return {
    playlists: playlists.map((playlist) => {
      if ((playlist.folderId ?? null) !== parentId) return playlist;
      const sortOrder = order.get(`playlist:${playlist.id}`);
      return sortOrder === undefined ? playlist : { ...playlist, sortOrder };
    }),
    folders: folders.map((folder) => {
      if ((folder.parentId ?? null) !== parentId) return folder;
      const sortOrder = order.get(`folder:${folder.id}`);
      return sortOrder === undefined ? folder : { ...folder, sortOrder };
    }),
  };
}

/** Delete only this folder and safely move its direct contents to its parent. */
export function deleteFolderAndReparent(folderId: string, playlists: Playlist[], folders: PlaylistFolder[]) {
  const parentId = folders.find((folder) => folder.id === folderId)?.parentId ?? null;
  const existingItems = libraryItemsInFolder(playlists, folders, parentId).filter((item) => item.kind !== "folder" || item.id !== folderId);
  const movingItems = libraryItemsInFolder(playlists, folders, folderId);
  const updated = {
    playlists: playlists.map((playlist) => playlist.folderId === folderId ? { ...playlist, folderId: parentId } : playlist),
    folders: folders.filter((folder) => folder.id !== folderId).map((folder) => folder.parentId === folderId ? { ...folder, parentId } : folder),
  };
  return applyLibraryOrder([...existingItems, ...movingItems], updated.playlists, updated.folders, parentId);
}

export function folderBreadcrumb(folders: PlaylistFolder[], folderId: string) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null | undefined = folderId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = byId.get(cursor);
    if (!folder) break;
    names.unshift(folder.name);
    cursor = folder.parentId;
  }
  return names.join(" / ");
}

export function isDefaultPlaylist(playlist: Playlist) {
  return playlist.id === DEFAULT_PLAYLIST_ID;
}

/** Converts the historical fixed "Genel" / "Favorilerim" list into an editable named list. */
export function normalizeDefaultPlaylist(playlists: Playlist[]): Playlist[] {
  const existing = playlists.find((item) => item.id === DEFAULT_PLAYLIST_ID)
    ?? playlists.find((item) => item.name === "Favorilerim" || item.name === "Genel");
  if (!existing) {
    return [{ id: DEFAULT_PLAYLIST_ID, name: "Şükürlerim", entryIds: [], createdAt: new Date().toISOString() }, ...playlists];
  }
  const needsLegacyNameMigration = (existing.name === "Genel" || existing.name === "Favorilerim") && existing.nameCustomized !== true;
  return playlists.map((item) => item.id === existing.id
    ? { ...item, id: DEFAULT_PLAYLIST_ID, name: needsLegacyNameMigration ? "Şükürlerim" : item.name, nameCustomized: needsLegacyNameMigration ? true : item.nameCustomized }
    : item);
}

export async function ensureDefaultPlaylist(): Promise<Playlist[]> {
  const playlists = await loadPlaylists();
  const normalized = normalizeDefaultPlaylist(playlists);
  if (JSON.stringify(normalized) !== JSON.stringify(playlists)) await savePlaylists(normalized);
  return normalized;
}

export function entriesForPlaylist(entries: GratitudeEntry[], playlist: Playlist) {
  return playlist.entryIds.map((id) => entries.find((entry) => entry.id === id)).filter(Boolean) as GratitudeEntry[];
}

export function inheritedFolderSettings(playlist: Playlist, folders: PlaylistFolder[]) {
  let folderId = playlist.folderId ?? null;
  const seen = new Set<string>();
  const result: { atmosphereUri?: string; voiceIdentifier?: string; speechRate?: number } = {};
  while (folderId && !seen.has(folderId)) {
    seen.add(folderId);
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) break;
    if (!result.atmosphereUri && folder.atmosphereUri) result.atmosphereUri = folder.atmosphereUri;
    if (!result.voiceIdentifier && folder.voiceIdentifier) result.voiceIdentifier = folder.voiceIdentifier;
    if (result.speechRate === undefined && typeof folder.speechRate === "number") result.speechRate = folder.speechRate;
    folderId = folder.parentId ?? null;
  }
  return result;
}
