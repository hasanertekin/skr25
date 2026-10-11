import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { loadGratitudeEntries, type GratitudeEntry } from "@/lib/gratitude";
import { useThemeContext } from "@/lib/theme-provider";

type Props = {
  visible: boolean;
  entries: GratitudeEntry[];
  currentIndex: number;
  onClose: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onAdd: (entry: GratitudeEntry) => void;
};

export function PlayerQueueModal({ visible, entries, currentIndex, onClose, onMove, onRemove, onAdd }: Props) {
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [showAdd, setShowAdd] = useState(false);
  const [available, setAvailable] = useState<GratitudeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) setShowAdd(false);
  }, [visible]);

  const openAdd = async () => {
    setLoading(true);
    setShowAdd(true);
    try {
      const allEntries = await loadGratitudeEntries();
      const queuedIds = new Set(entries.map((entry) => entry.id));
      setAvailable(allEntries.filter((entry) => !queuedIds.has(entry.id)));
    } finally {
      setLoading(false);
    }
  };

  const addEntry = (entry: GratitudeEntry) => {
    onAdd(entry);
    setAvailable((items) => items.filter((item) => item.id !== entry.id));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kuyruğu kapat" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>DİNLEME SIRASI</Text>
              <Text style={styles.title}>{showAdd ? "Şükran ekle" : `${entries.length} not`}</Text>
            </View>
            {showAdd ? (
              <Pressable onPress={() => setShowAdd(false)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Kuyruğa dön">
                <Ionicons name="arrow-back" size={19} color={palette.foreground} />
              </Pressable>
            ) : (
              <Pressable onPress={onClose} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Kuyruğu kapat">
                <Ionicons name="close" size={20} color={palette.foreground} />
              </Pressable>
            )}
          </View>

          {!showAdd ? (
            <>
              <Text style={styles.hint}>Sırayı değiştir veya bu dinleme için istemediğin notları çıkar.</Text>
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                {entries.map((entry, index) => (
                  <View key={`${entry.id}-${index}`} style={[styles.row, index === currentIndex && styles.rowCurrent]}>
                    <View style={[styles.number, index === currentIndex && styles.numberCurrent]}>
                      <Text style={[styles.numberText, index === currentIndex && styles.numberTextCurrent]}>{String(index + 1).padStart(2, "0")}</Text>
                    </View>
                    <View style={styles.entryCopy}>
                      <Text numberOfLines={2} style={styles.entryText}>{entry.text}</Text>
                      {index === currentIndex ? <Text style={styles.currentLabel}>Şimdi çalıyor</Text> : null}
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable onPress={() => onMove(index, index - 1)} disabled={index === 0} style={[styles.smallButton, index === 0 && styles.disabled]} accessibilityRole="button" accessibilityLabel={`Notu sırada yukarı taşı`} accessibilityState={{ disabled: index === 0 }}>
                        <Ionicons name="chevron-up" size={17} color={palette.primary} />
                      </Pressable>
                      <Pressable onPress={() => onMove(index, index + 1)} disabled={index === entries.length - 1} style={[styles.smallButton, index === entries.length - 1 && styles.disabled]} accessibilityRole="button" accessibilityLabel="Notu sırada aşağı taşı" accessibilityState={{ disabled: index === entries.length - 1 }}>
                        <Ionicons name="chevron-down" size={17} color={palette.primary} />
                      </Pressable>
                      <Pressable onPress={() => onRemove(index)} style={styles.removeButton} accessibilityRole="button" accessibilityLabel="Notu bu sıradan çıkar">
                        <Ionicons name="close" size={17} color={palette.error} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <Pressable onPress={() => void openAdd()} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Kuyruğa şükran ekle">
                <Ionicons name="add" size={19} color={palette.onPrimary} />
                <Text style={styles.addButtonText}>Şükran ekle</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.hint}>Günlüğünden bir not seç; sıranın sonuna eklenir.</Text>
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                {loading ? <Text style={styles.emptyText}>Notların yükleniyor…</Text> : available.length ? available.map((entry) => (
                  <Pressable key={entry.id} onPress={() => addEntry(entry)} style={({ pressed }) => [styles.addRow, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Bu notu kuyruğa ekle">
                    <View style={styles.entryCopy}>
                      <Text numberOfLines={2} style={styles.entryText}>{entry.text}</Text>
                      <Text style={styles.dateText}>{new Date(entry.createdAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}</Text>
                    </View>
                    <View style={styles.plusButton}><Ionicons name="add" size={18} color={palette.primary} /></View>
                  </Pressable>
                )) : <Text style={styles.emptyText}>Eklenecek başka şükran notu bulunmuyor.</Text>}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  sheet: { backgroundColor: palette.background, borderColor: palette.border, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, maxHeight: "82%", minHeight: 390, paddingBottom: 20, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: "center", backgroundColor: palette.border, borderRadius: 3, height: 5, marginBottom: 16, width: 42 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  headerCopy: { flex: 1 },
  eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 21, marginTop: 3 },
  iconButton: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 21, borderWidth: 1, height: 42, justifyContent: "center", width: 42 },
  hint: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  list: { flexGrow: 0, marginTop: 13 },
  listContent: { gap: 8, paddingBottom: 8 },
  row: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 15, borderWidth: 1, flexDirection: "row", minHeight: 70, paddingHorizontal: 9, paddingVertical: 8 },
  rowCurrent: { borderColor: palette.primary, backgroundColor: palette.soft },
  number: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 14, height: 32, justifyContent: "center", width: 32 },
  numberCurrent: { backgroundColor: palette.primary },
  numberText: { color: palette.primary, fontSize: 10, fontWeight: "800" },
  numberTextCurrent: { color: palette.onPrimary },
  entryCopy: { flex: 1, minWidth: 0, paddingHorizontal: 9 },
  entryText: { color: palette.foreground, fontFamily: "PlayfairDisplay", fontSize: 13, lineHeight: 18 },
  currentLabel: { color: palette.primary, fontSize: 10, fontWeight: "800", marginTop: 4 },
  rowActions: { alignItems: "center", flexDirection: "row" },
  smallButton: { alignItems: "center", borderRadius: 16, height: 32, justifyContent: "center", width: 29 },
  removeButton: { alignItems: "center", borderRadius: 16, height: 34, justifyContent: "center", width: 30 },
  disabled: { opacity: 0.32 },
  addButton: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 14, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 12, minHeight: 48 },
  addButtonText: { color: palette.onPrimary, fontSize: 13, fontWeight: "800" },
  addRow: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 15, borderWidth: 1, flexDirection: "row", minHeight: 68, paddingHorizontal: 12, paddingVertical: 9 },
  dateText: { color: palette.muted, fontSize: 10, marginTop: 4 },
  plusButton: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 17, height: 34, justifyContent: "center", width: 34 },
  emptyText: { color: palette.muted, fontSize: 13, lineHeight: 19, padding: 18, textAlign: "center" },
  pressed: { opacity: 0.72 },
});
