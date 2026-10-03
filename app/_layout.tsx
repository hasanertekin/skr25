import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, PlayfairDisplay_400Regular, PlayfairDisplay_500Medium, PlayfairDisplay_500Medium_Italic, PlayfairDisplay_600SemiBold, PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { OpenSans_400Regular } from "@expo-google-fonts/open-sans";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider, useThemeContext } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { configureNotifications } from "@/lib/reminders";
import { PlayerProvider } from "@/lib/player-context";
import { PersistentGratitudePlayer } from "@/components/persistent-gratitude-player";
import { loadPreferences } from "@/lib/app-preferences";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

function PrivacyGuard({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const { palette } = useThemeContext();
  const authenticate = useCallback(async () => {
    setChecking(true);
    const preferences = await loadPreferences();
    if (Platform.OS === "web" || !preferences.privacyLock) { setLocked(false); setChecking(false); return; }
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Şükür Günlüğü kilidini aç", cancelLabel: "İptal", disableDeviceFallback: false });
    setLocked(!result.success); setChecking(false);
  }, []);
  useEffect(() => { authenticate(); }, [authenticate]);
  return <View style={{ flex: 1 }}>{children}{locked ? <View style={{ alignItems: "center", backgroundColor: palette.background, bottom: 0, justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0 }}><Ionicons name="lock-closed" size={40} color={palette.primary} /><Text style={{ color: palette.foreground, fontSize: 20, fontWeight: "800", marginTop: 14 }}>Günlük kilitli</Text><Text style={{ color: palette.muted, fontSize: 12, marginTop: 5 }}>Devam etmek için cihaz kilidini doğrula.</Text><Pressable disabled={checking} onPress={authenticate} style={{ backgroundColor: palette.primary, borderRadius: 13, marginTop: 20, paddingHorizontal: 18, paddingVertical: 12 }}><Text style={{ color: palette.surface, fontWeight: "800" }}>{checking ? "Kontrol ediliyor" : "Yeniden dene"}</Text></Pressable></View> : null}</View>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PlayfairDisplay: PlayfairDisplay_400Regular, PlayfairDisplayMedium: PlayfairDisplay_500Medium, PlayfairDisplayMediumItalic: PlayfairDisplay_500Medium_Italic, PlayfairDisplaySemiBold: PlayfairDisplay_600SemiBold, PlayfairDisplayBold: PlayfairDisplay_700Bold, OpenSans: OpenSans_400Regular });
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
    configureNotifications();
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  if (!fontsLoaded) return null;
  const TextWithDefaults = Text as typeof Text & { defaultProps?: { style?: unknown } };
  const InputWithDefaults = TextInput as typeof TextInput & { defaultProps?: { style?: unknown } };
  TextWithDefaults.defaultProps = { ...TextWithDefaults.defaultProps, style: [{ fontFamily: "PlayfairDisplay" }, TextWithDefaults.defaultProps?.style] };
  InputWithDefaults.defaultProps = { ...InputWithDefaults.defaultProps, style: [{ fontFamily: "PlayfairDisplay" }, InputWithDefaults.defaultProps?.style] };

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PlayerProvider>
        <PrivacyGuard>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="oauth/callback" />
          </Stack>
            <StatusBar style="auto" />
          </QueryClientProvider>
        </trpc.Provider>
        <PersistentGratitudePlayer />
        </PrivacyGuard>
      </PlayerProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
