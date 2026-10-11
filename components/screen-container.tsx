import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";
import { useThemeContext } from "@/lib/theme-provider";

export interface ScreenContainerProps extends ViewProps {
  edges?: Edge[];
  className?: string;
  containerClassName?: string;
  safeAreaClassName?: string;
}

export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  const { palette } = useThemeContext();

  return (
    <View
      className={cn("flex-1", "bg-background", containerClassName)}
      style={[{ backgroundColor: palette.background, flex: 1 }, style]}
      {...props}
    >
      <SafeAreaView
        edges={edges}
        className={cn("flex-1", safeAreaClassName)}
        style={{ backgroundColor: palette.background, flex: 1 }}
      >
        <View className={cn("flex-1", className)} style={{ flex: 1 }}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
