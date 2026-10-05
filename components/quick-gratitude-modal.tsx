import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeContext } from "@/lib/theme-provider";

type Props = { visible: boolean; onClose: () => void; onSave: (text: string) => Promise<void> };

export function QuickGratitudeModal({ visible, onClose, onSave }: Props) {
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  const submit = async () => { const value = text.trim(); if (!value) return; await onSave(value); setText(""); requestAnimationFrame(() => inputRef.current?.focus()); };
  return (
    <Modal visible={visible} transparent animationType="slide" onShow={() => inputRef.current?.focus()} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>HIZLI ŞÜKRAN</Text><Text style={styles.title}>Şu an ne için şükrediyorsun?</Text></View><Pressable onPress={onClose} style={styles.close}><Ionicons name="close" size={20} color={palette.muted} /></Pressable></View>
          <View style={styles.composer}><TextInput ref={inputRef} autoFocus value={text} onChangeText={setText} multiline placeholder="Mesajını yaz..." placeholderTextColor={palette.muted} style={styles.input} /><Pressable onPress={submit} disabled={!text.trim()} style={({ pressed }) => [styles.send, !text.trim() && styles.disabled, pressed && styles.pressed]} accessibilityLabel="Şükranı kaydet"><Ionicons name="arrow-up" size={18} color={palette.surface} /></Pressable></View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({ overlay: { flex: 1, justifyContent: "flex-end" }, backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" }, sheet: { backgroundColor: palette.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: Platform.OS === "android" ? 18 : 28 }, handle: { alignSelf: "center", backgroundColor: palette.border, borderRadius: 3, height: 5, marginBottom: 19, width: 42 }, sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 15 }, eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 }, title: { color: palette.foreground, fontSize: 17, fontWeight: "800" }, close: { alignItems: "center", height: 32, justifyContent: "center", width: 32 }, composer: { alignItems: "flex-end", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 18, borderWidth: 1, flexDirection: "row", padding: 8 }, input: { color: palette.foreground, flex: 1, fontFamily: "PlayfairDisplay", fontSize: 14, lineHeight: 20, maxHeight: 110, minHeight: 42, paddingHorizontal: 9, paddingTop: 10 }, send: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 16, height: 32, justifyContent: "center", width: 32 }, disabled: { backgroundColor: palette.border }, pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] } });
