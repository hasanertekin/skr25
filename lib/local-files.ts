import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

/** Copy a picker-owned temporary URI into app-managed persistent storage. */
export async function persistPickedFile(uri: string, name: string | undefined, prefix: string) {
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error("Uygulama belge klasörü kullanılamıyor.");

  const sourceName = name || decodeURIComponent(uri.split("?")[0].split("/").pop() || "");
  const extension = sourceName.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? "";
  const suffix = Math.random().toString(36).slice(2, 8);
  const destination = `${directory}${prefix}-${Date.now()}-${suffix}${extension}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  const copied = await FileSystem.getInfoAsync(destination);
  if (!copied.exists || (copied.size ?? 0) === 0) {
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new Error("Dosya uygulama alanına kopyalanamadı.");
  }
  return destination;
}

/**
 * Persist a photo-library asset without cropping. Android scoped-storage providers can expose a
 * readable preview URI that is not directly copyable; in that case decode/re-encode the full image
 * (preserving its aspect ratio) to a temporary app file, then persist that file.
 */
export async function persistImageAsset(uri: string, name: string | undefined, prefix: string) {
  try {
    return await persistPickedFile(uri, name, prefix);
  } catch (copyError) {
    let normalizedUri: string | undefined;
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 2048 } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );
      normalizedUri = result.uri;
      const baseName = (name || "sukran-anisi").replace(/\.[a-zA-Z0-9]{1,8}$/, "");
      return await persistPickedFile(normalizedUri, `${baseName}.jpg`, prefix);
    } catch (normalizeError) {
      throw new Error(`Fotoğraf uygulama alanına aktarılamadı. Kaynak URI: ${uri.slice(0, 80)}. Kopyalama: ${String(copyError)}. Görüntü çözümleme: ${String(normalizeError)}`);
    } finally {
      if (normalizedUri) await FileSystem.deleteAsync(normalizedUri, { idempotent: true }).catch(() => undefined);
    }
  }
}

/** Keep remote/bundled sources, but discard dead device-local paths from imported backups. */
export async function resolveAvailableMediaUri(uri: string | null | undefined) {
  if (!uri) return null;
  if (uri.startsWith("bundled:") || /^https?:\/\//i.test(uri)) return uri;
  if (!uri.startsWith("file://")) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? uri : null;
  } catch {
    return null;
  }
}

/** Remove only app-managed files, never a user's original picker file or remote asset. */
export async function deleteManagedFile(uri: string | null | undefined) {
  const directory = FileSystem.documentDirectory;
  if (!uri || !directory || !uri.startsWith(directory)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
