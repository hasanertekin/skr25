import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

export function NowPlayingIndicator({ color, size = 14 }: { color: string; size?: number }) {
  const bars = useRef([new Animated.Value(0.35), new Animated.Value(0.75), new Animated.Value(0.5)]).current;

  useEffect(() => {
    const loops = bars.map((bar, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 90),
      Animated.timing(bar, { toValue: 1, duration: 280 + index * 60, useNativeDriver: false }),
      Animated.timing(bar, { toValue: 0.3, duration: 300 + index * 50, useNativeDriver: false }),
    ])));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [bars]);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: "center", flexDirection: "row", gap: size * 0.13, height: size, justifyContent: "center", width: size }}>
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={{ backgroundColor: color, borderRadius: 2, height: bar.interpolate({ inputRange: [0, 1], outputRange: [size * 0.35, size] }), width: Math.max(2, size * 0.17) }}
        />
      ))}
    </View>
  );
}
