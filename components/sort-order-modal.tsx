import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type SortOrderItem = { id: string; title: string; subtitle?: string; icon?: "folder-outline" | "bookmark-outline" };

type Props = {
  visible: boolean;
  title: string;
  description: string;
  items: SortOrderItem[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
  palette: Record<string, string>;
};

export function SortOrderModal({ visible, title, description, items, onClose, onSave, palette }: Props) {
  const [draft, setDraft] = useState(items.map((item) => item.id));
  useEffect(() => { if (visible) setDraft(items.map((item) => item.id)); }, [items, visible]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    setDraft((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  };
  const styles = createStyles(palette);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleWrap}><Text style={styles.eyebrow}>DÜZENİ YÖNET</Text><Text style={styles.title}>{title}</Text></View>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Sıralama penceresini kapat"><Ionicons name="close" size={20} color={palette.foreground} /></Pressable>
          </View>
          <Text style={styles.description}>{description}</Text>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {draft.map((id, index) => {
              const item = byId.get(id);
              if (!item) return null;
              return <View key={id} style={styles.row}>
                <View style={styles.position}><Text style={styles.positionText}>{index + 1}</Text></View>
                <Ionicons name={item.icon ?? "bookmark-outline"} size={19} color={palette.primary} />
                <View style={styles.copy}><Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>{item.subtitle ? <Text numberOfLines={1} style={styles.itemSubtitle}>{item.subtitle}</Text> : null}</View>
                <View style={styles.controls}>
                  <Pressable onPress={() => move(index, -1)} disabled={index === 0} style={[styles.control, index === 0 && styles.disabled]} accessibilityRole="button" accessibilityLabel={`${item.title} için yukarı taşı`}><Ionicons name="chevron-up" size={18} color={index === 0 ? palette.muted : palette.primary} /></Pressable>
                  <Pressable onPress={() => move(index, 1)} disabled={index === draft.length - 1} style={[styles.control, index === draft.length - 1 && styles.disabled]} accessibilityRole="button" accessibilityLabel={`${item.title} için aşağı taşı`}><Ionicons name="chevron-down" size={18} color={index === draft.length - 1 ? palette.muted : palette.primary} /></Pressable>
                </View>
              </View>;
            })}
          </ScrollView>
          <View style={styles.actions}><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Vazgeç</Text></Pressable><Pressable onPress={() => onSave(draft)} style={styles.save}><Ionicons name="checkmark" size={17} color={palette.onPrimary} /><Text style={styles.saveText}>Düzeni kaydet</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.42)", flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: palette.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "86%", padding: 18 },
  header: { alignItems: "center", flexDirection: "row", gap: 12 },
  titleWrap: { flex: 1 },
  eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: palette.foreground, fontFamily: "PlayfairDisplaySemiBold", fontSize: 23, marginTop: 3 },
  close: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 21, height: 42, justifyContent: "center", width: 42 },
  description: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 10 },
  list: { gap: 8, paddingVertical: 16 },
  row: { alignItems: "center", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, minHeight: 58, paddingHorizontal: 10 },
  position: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 12, height: 28, justifyContent: "center", width: 28 },
  positionText: { color: palette.primary, fontSize: 12, fontWeight: "800" },
  copy: { flex: 1, minWidth: 0 },
  itemTitle: { color: palette.foreground, fontSize: 14, fontWeight: "800" },
  itemSubtitle: { color: palette.muted, fontSize: 11, marginTop: 3 },
  controls: { flexDirection: "row", gap: 4 },
  control: { alignItems: "center", backgroundColor: palette.soft, borderRadius: 10, height: 34, justifyContent: "center", width: 34 },
  disabled: { opacity: 0.42 },
  actions: { flexDirection: "row", gap: 8 },
  cancel: { alignItems: "center", borderColor: palette.border, borderRadius: 12, borderWidth: 1, flex: 1, justifyContent: "center", minHeight: 46 },
  cancelText: { color: palette.foreground, fontSize: 13, fontWeight: "800" },
  save: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 12, flex: 1.5, flexDirection: "row", gap: 6, justifyContent: "center", minHeight: 46 },
  saveText: { color: palette.onPrimary, fontSize: 13, fontWeight: "800" },
});
