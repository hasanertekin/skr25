import { describe, expect, it } from "vitest";

import {
  getDayChart,
  getEntriesForDay,
  getMonthChart,
  getYearChart,
  getWeekChart,
  getMonthsOfYearChart,
  getWeeksChart,
  getYearsChart,
  isToday,
  isWithinCurrentMonth,
  isWithinCurrentWeek,
  pickRandomEntries,
  type GratitudeEntry,
} from "../lib/gratitude";
import { normalizeListeningSettings } from "../lib/listening-settings";
import { getLevelForCount, getRankForCount } from "../lib/profile-ranks";
import { getGoalProgress } from "../lib/daily-goal";
import { getMonthGrid } from "../lib/calendar";
import { PrivacyLockExemption } from "../lib/privacy-lock-exemption";
import { applyLibraryOrder, DEFAULT_PLAYLIST_ID, deleteFolderAndReparent, FOLDER_COVER_IDS, isDefaultPlaylist, libraryItemsInFolder, normalizeDefaultPlaylist, normalizePlaylistFolders, playlistsInFolder, type Playlist, type PlaylistFolder } from "../lib/playlists";

const reference = new Date(2026, 8, 3, 12, 0, 0);

function entry(id: string, createdAt: string): GratitudeEntry {
  return { id, text: id, createdAt };
}

describe("gratitude date helpers", () => {
  it("recognizes today, current week, and current month entries", () => {
    expect(isToday(new Date(2026, 8, 3, 8), reference)).toBe(true);
    expect(isToday(new Date(2026, 8, 2, 23), reference)).toBe(false);
    expect(isWithinCurrentWeek(new Date(2026, 8, 1, 8), reference)).toBe(true);
    expect(isWithinCurrentWeek(new Date(2026, 7, 30, 8), reference)).toBe(false);
    expect(isWithinCurrentMonth(new Date(2026, 8, 29), reference)).toBe(true);
    expect(isWithinCurrentMonth(new Date(2026, 7, 29), reference)).toBe(false);
  });

  it("counts entries by local calendar day", () => {
    const entries = [
      entry("one", "2026-09-03T07:00:00.000Z"),
      entry("two", "2026-09-03T15:00:00.000Z"),
      entry("three", "2026-09-02T15:00:00.000Z"),
    ];

    expect(getEntriesForDay(entries, new Date(2026, 8, 3))).toBe(2);
  });

  it("creates a seven-day chart with the correct peak", () => {
    const entries = [
      entry("monday-1", "2026-08-31T08:00:00.000Z"),
      entry("monday-2", "2026-08-31T12:00:00.000Z"),
      entry("today", "2026-09-03T08:00:00.000Z"),
    ];

    const chart = getWeekChart(entries, reference);
    expect(chart).toHaveLength(7);
    expect(chart.map((item) => item.value)).toEqual([0, 0, 0, 2, 0, 0, 1]);
  });

  it("groups the current month into week buckets", () => {
    const entries = [
      entry("first", "2026-09-01T08:00:00.000Z"),
      entry("seventh", "2026-09-07T08:00:00.000Z"),
      entry("eighth", "2026-09-08T08:00:00.000Z"),
      entry("last-month", "2026-08-31T08:00:00.000Z"),
    ];

    const chart = getMonthChart(entries, reference);
    expect(chart).toHaveLength(5);
    expect(chart[0].value).toBe(2);
    expect(chart[1].value).toBe(1);
    expect(chart[4].label).toBe("29-30");
  });

  it("keeps the profile's month chart within the selected year", () => {
    const chart = getMonthsOfYearChart([
      entry("jan", new Date(2026, 0, 2, 8).toISOString()),
      entry("dec", new Date(2026, 11, 2, 8).toISOString()),
      entry("prior-year", new Date(2025, 11, 2, 8).toISOString()),
    ], reference);
    expect(chart).toHaveLength(12);
    expect(chart[0].value).toBe(1);
    expect(chart[11].value).toBe(1);
    expect(chart.reduce((sum, item) => sum + item.value, 0)).toBe(2);
  });

  it("uses seven Monday-starting week buckets and a six-year chart window", () => {
    const currentWeekEntry = entry("this-week", new Date(2026, 8, 3, 8).toISOString());
    const weeks = getWeeksChart([currentWeekEntry], reference);
    const years = getYearsChart([
      entry("first-year", new Date(2021, 0, 2, 8).toISOString()),
      entry("last-year", new Date(2026, 0, 2, 8).toISOString()),
      entry("outside-window", new Date(2020, 0, 2, 8).toISOString()),
    ], reference);
    expect(weeks).toHaveLength(7);
    expect(weeks.at(-1)?.value).toBe(1);
    expect(years).toHaveLength(6);
    expect(years[0].value).toBe(1);
    expect(years[5].value).toBe(1);
  });

  it("creates a seven-day chart and places yesterday in the penultimate bucket", () => {
    const entries = [entry("yesterday", "2026-09-02T08:00:00.000Z")];
    const chart = getDayChart(entries, reference);
    expect(chart).toHaveLength(7);
    expect(chart.at(-2)?.value).toBe(1);
    expect(chart.at(-1)?.value).toBe(0);
  });

  it("limits random playback to the requested number without mutating the source", () => {
    const entries = [entry("one", "2026-09-03T08:00:00.000Z"), entry("two", "2026-09-03T09:00:00.000Z"), entry("three", "2026-09-03T10:00:00.000Z")];
    const selected = pickRandomEntries(entries, 2, () => 0.8);
    expect(selected).toHaveLength(2);
    expect(entries).toHaveLength(3);
    expect(new Set(selected.map((item) => item.id)).size).toBe(2);
  });

  it("normalizes listening settings to safe device limits", () => {
    expect(normalizeListeningSettings({ rate: 4, gapSeconds: -2, ambienceVolume: 130 })).toMatchObject({ rate: 2, gapSeconds: 0, ambienceVolume: 100 });
  });

  it("starts the annual chart in January and counts each month", () => {
    const chart = getYearChart([entry("jan", "2026-01-02T08:00:00.000Z"), entry("dec", "2026-12-02T08:00:00.000Z")], reference);
    expect(chart).toHaveLength(12);
    expect(chart[0].value).toBe(1);
    expect(chart[11].value).toBe(1);
  });

  it("maps 1260 recent gratitudes to the chess king rank", () => {
    expect(getRankForCount(1259).name).toBe("Vezir");
    expect(getRankForCount(1260).name).toBe("Şah");
    expect(getLevelForCount(1260)).toBe(127);
  });

  it("keeps an unfinished 300-item goal at 60 percent for 180 entries", () => {
    expect(getGoalProgress(180, 300)).toBe(0.6);
  });

  it("builds Monday-first month grids with only whole weeks", () => {
    const september = getMonthGrid(2026, 8);
    expect(september).toHaveLength(35);
    expect(september[0]).toBeNull();
    expect(september[1]?.getDate()).toBe(1);
    expect(september.filter((date): date is Date => date !== null).at(-1)?.getDate()).toBe(30);

    const august = getMonthGrid(2026, 7);
    expect(august).toHaveLength(42);
    expect(august[5]?.getDate()).toBe(1);
    expect(august[41]).toBeNull();
  });
});

describe("privacy lock external UI exemption", () => {
  it("ignores app-state transitions while a native picker or permission prompt is open", () => {
    const guard = new PrivacyLockExemption();
    const release = guard.begin();

    expect(guard.shouldSkipAppState("background", 100)).toBe(true);
    expect(guard.shouldSkipAppState("active", 200)).toBe(true);
    release(300);
    expect(guard.shouldSkipAppState("background", 400)).toBe(false);
    expect(guard.shouldSkipAppState("active", 400)).toBe(false);
  });

  it("skips one delayed return-to-active event, then restores normal lock behavior", () => {
    const guard = new PrivacyLockExemption();
    const release = guard.begin();
    release(1000);

    expect(guard.shouldSkipAppState("active", 1500)).toBe(true);
    expect(guard.shouldSkipAppState("active", 1600)).toBe(false);
    expect(guard.shouldSkipAppState("background", 1600)).toBe(false);
  });
});

describe("playlist folders and editable default list", () => {
  const playlist = (id: string, name: string, folderId?: string | null): Playlist => ({
    id,
    name,
    entryIds: [`entry-${id}`],
    createdAt: "2026-10-09T00:00:00.000Z",
    folderId,
  });

  it("migrates the legacy fixed General list to a named, still-editable default", () => {
    const migrated = normalizeDefaultPlaylist([playlist("legacy-general", "Genel"), playlist("other", "Akşam")]);
    expect(migrated[0]).toMatchObject({ id: DEFAULT_PLAYLIST_ID, name: "Şükürlerim", entryIds: ["entry-legacy-general"] });
    expect(isDefaultPlaylist(migrated[0])).toBe(true);
    expect(migrated[1].name).toBe("Akşam");
  });

  it("preserves a custom name on the default list, including a user-selected General name", () => {
    const defaultList = playlist(DEFAULT_PLAYLIST_ID, "Akşam anlarım");
    const separatelyNamed = playlist("custom-general", "Genel");
    expect(normalizeDefaultPlaylist([defaultList, separatelyNamed])[0].name).toBe("Akşam anlarım");
    expect(isDefaultPlaylist(defaultList)).toBe(true);
    expect(isDefaultPlaylist(separatelyNamed)).toBe(false);
    const explicitlyRenamed = { ...defaultList, name: "Genel", nameCustomized: true };
    expect(normalizeDefaultPlaylist([explicitlyRenamed])[0].name).toBe("Genel");
  });

  it("returns only playlists in the selected folder or at the library root", () => {
    const lists = [playlist("root", "Kökte"), playlist("one", "İlk", "folder-1"), playlist("two", "İkinci", "folder-2")];
    expect(playlistsInFolder(lists, null).map((item) => item.id)).toEqual(["root"]);
    expect(playlistsInFolder(lists, "folder-1").map((item) => item.id)).toEqual(["one"]);
  });

  it("keeps folders and playlists in one mixed order at every nesting level", () => {
    const lists = [
      { ...playlist("root-list", "Root list"), sortOrder: 1 },
      { ...playlist("nested-list", "Nested list", "child"), sortOrder: 0 },
    ];
    const folders: PlaylistFolder[] = [
      { id: "child", name: "Child", createdAt: "2026-10-09T00:00:00.000Z", parentId: null, sortOrder: 0 },
      { id: "grandchild", name: "Grandchild", createdAt: "2026-10-09T00:00:00.000Z", parentId: "child", sortOrder: 1 },
    ];

    expect(libraryItemsInFolder(lists, folders, null).map((item) => `${item.kind}:${item.id}`)).toEqual(["folder:child", "playlist:root-list"]);
    expect(libraryItemsInFolder(lists, folders, "child").map((item) => `${item.kind}:${item.id}`)).toEqual(["playlist:nested-list", "folder:grandchild"]);

    const reversed = [...libraryItemsInFolder(lists, folders, null)].reverse();
    const updated = applyLibraryOrder(reversed, lists, folders, null);
    expect(libraryItemsInFolder(updated.playlists, updated.folders, null).map((item) => `${item.kind}:${item.id}`)).toEqual(["playlist:root-list", "folder:child"]);
  });

  it("persists built-in folder covers and normalizes old or invalid cover values", () => {
    const folders = normalizePlaylistFolders([
      { id: "covered", name: "Sabah", createdAt: "2026-10-09T00:00:00.000Z", parentId: null, coverId: FOLDER_COVER_IDS[1] },
      { id: "legacy", name: "Eski klasör", createdAt: "2026-10-09T00:00:00.000Z" },
      { id: "invalid", name: "Geçersiz", createdAt: "2026-10-09T00:00:00.000Z", coverId: "not-a-built-in-cover" },
    ]);

    expect(folders.find((folder) => folder.id === "covered")?.coverId).toBe("olive-garden");
    expect(folders.find((folder) => folder.id === "legacy")?.coverId).toBeNull();
    expect(folders.find((folder) => folder.id === "invalid")?.coverId).toBeNull();
  });

  it("breaks missing and cyclic folder parents while retaining every folder", () => {
    const folders = normalizePlaylistFolders([
      { id: "a", name: "A", createdAt: "2026-10-09T00:00:00.000Z", parentId: "b" },
      { id: "b", name: "B", createdAt: "2026-10-09T00:00:00.000Z", parentId: "a" },
      { id: "orphan", name: "Orphan", createdAt: "2026-10-09T00:00:00.000Z", parentId: "missing" },
    ]);

    expect(folders).toHaveLength(3);
    expect(folders.every((folder) => folder.parentId === null)).toBe(true);
  });

  it("moves direct playlists and child folders to the deleted folder's parent", () => {
    const lists = [playlist("one", "One", "parent"), playlist("two", "Two", "child")];
    const folders: PlaylistFolder[] = [
      { id: "parent", name: "Parent", createdAt: "2026-10-09T00:00:00.000Z", parentId: null },
      { id: "child", name: "Child", createdAt: "2026-10-09T00:00:00.000Z", parentId: "parent" },
      { id: "grandchild", name: "Grandchild", createdAt: "2026-10-09T00:00:00.000Z", parentId: "child" },
    ];
    const updated = deleteFolderAndReparent("parent", lists, folders);

    expect(updated.playlists.find((item) => item.id === "one")?.folderId).toBeNull();
    expect(updated.playlists.find((item) => item.id === "two")?.folderId).toBe("child");
    expect(updated.folders.find((item) => item.id === "child")?.parentId).toBeNull();
    expect(updated.folders.find((item) => item.id === "grandchild")?.parentId).toBe("child");
  });
});
