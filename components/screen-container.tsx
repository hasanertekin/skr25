import { useMemo } from "react";
import { PanResponder, View, type ViewProps } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";
import { useThemeContext } from "@/lib/theme-provider";

export interface ScreenContainerProps extends ViewProps { edges?: Edge[]; className?: string; containerClassName?: string; safeAreaClassName?: string; }
const tabRoutes = ["history", "index", "favorites", "profile"];

export function ScreenContainer({ children, edges = ["top", "left", "right"], className, containerClassName, safeAreaClassName, style, ...props }: ScreenContainerProps) {
  const router = useRouter(); const segments = useSegments();
  const { palette } = useThemeContext();
  const activeTab = String(segments[0]) === "(tabs)" ? String((segments as string[])[1] || "index") : "";
  const panResponder = useMemo(() => PanResponder.create({ onMoveShouldSetPanResponder: (_, gesture) => Boolean(activeTab) && Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35, onPanResponderRelease: (_, gesture) => { if (!activeTab || Math.abs(gesture.dx) < 60) return; const current = tabRoutes.indexOf(activeTab); if (current < 0) return; const next = gesture.dx < 0 ? Math.min(tabRoutes.length - 1, current + 1) : Math.max(0, current - 1); if (next !== current) router.replace(next === 1 ? "/(tabs)" : `/(tabs)/${tabRoutes[next]}` as any); } }), [activeTab, router]);
  return <View className={cn("flex-1", "bg-background", containerClassName)} style={[{ backgroundColor: palette.background }, style]} {...props} {...panResponder.panHandlers}><SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={[{ backgroundColor: palette.background }, style]}><View className={cn("flex-1", className)}>{children}</View></SafeAreaView></View>;
}
