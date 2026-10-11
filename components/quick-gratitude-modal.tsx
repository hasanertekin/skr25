import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeContext } from "@/lib/theme-provider";

type Props = { visible: boolean; onClose: () => void; onSave: (text: string) => Promise<void> };

export function QuickGratitudeModal({ visible, onClose, onSave }: Props) {
  const { palette } = useThemeContext();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const closingRef = useRef(false);
  const savingRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusInput = useCallback(() => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (Platform.OS === "android") {
          focusTimerRef.current = setTimeout(() => {
            focusTimerRef.current = null;
            inputRef.current?.focus();
          }, 180);
        }
      });
    }, Platform.OS === "android" ? 420 : 100);
  }, []);

  useEffect(() => {
    if (!visible) {
      closingRef.current = true;
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
      return;
    }
    closingRef.current = false;
    focusInput();
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      if (!closingRef.current) focusInput();
    });
    return () => {
      subscription.remove();
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    };
  }, [focusInput, visible]);

  const close = () => {
    closingRef.current = true;
    onClose();
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(value);
      setText("");
    } catch {
      // Keep the draft intact if persistence fails; the parent shows the error.
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    requestAnimationFrame(focusInput);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onShow={focusInput} onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.eyebrow}>HIZLI ŞÜKRAN</Text>
              <Text style={styles.title}>Şu an ne için şükrediyorsun?</Text>
            </View>
            <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Hızlı şükran penceresini kapat">
              <Ionicons name="close" size={20} color={palette.muted} />
            </Pressable>
          </View>
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              autoFocus={false}
              value={text}
              onChangeText={setText}
              multiline
              placeholder="Bugün şükrettiğim şey..."
              placeholderTextColor={palette.muted}
              style={styles.input}
              accessibilityLabel="Hızlı şükran notu"
              blurOnSubmit={false}
              returnKeyType="default"
            />
            <Pressable onPress={() => void submit()} disabled={!text.trim() || saving} style={({ pressed }) => [styles.send, (!text.trim() || saving) && styles.disabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Şükranı kaydet" accessibilityState={{ disabled: !text.trim() || saving }}>
              {saving ? <ActivityIndicator size="small" color={palette.surface} /> : <Ionicons name="arrow-up" size={18} color={palette.surface} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (palette: Record<string, string>) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" },
  sheet: { backgroundColor: palette.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: Platform.OS === "android" ? 18 : 28 },
  handle: { alignSelf: "center", backgroundColor: palette.border, borderRadius: 3, height: 5, marginBottom: 19, width: 42 },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  eyebrow: { color: palette.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  title: { color: palette.foreground, fontSize: 17, fontWeight: "800" },
  close: { alignItems: "center", height: 40, justifyContent: "center", width: 40 },
  composer: { alignItems: "flex-end", backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 18, borderWidth: 1, flexDirection: "row", padding: 8 },
  input: { color: palette.foreground, flex: 1, fontFamily: "PlayfairDisplay", fontSize: 14, lineHeight: 20, maxHeight: 110, minHeight: 42, paddingHorizontal: 9, paddingTop: 10 },
  send: { alignItems: "center", backgroundColor: palette.primary, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  disabled: { backgroundColor: palette.border },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
