import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { HapticTab } from "@/components/haptic-tab";
import { useThemeContext } from "@/lib/theme-provider";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { palette } = useThemeContext();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + bottomPadding;

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 1 },
        tabBarItemStyle: { borderRadius: 16, marginHorizontal: 3, marginVertical: 3 },
        tabBarStyle: {
          paddingHorizontal: 6,
          paddingTop: 5,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          borderTopWidth: 0.5,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen
        name="history"
        options={{
          title: "Geçmiş",
          tabBarIcon: ({ color, focused }) => <Ionicons size={22} name={focused ? "book" : "book-outline"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Yaz",
          tabBarIcon: ({ color, focused }) => <Ionicons size={22} name={focused ? "create" : "create-outline"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Listeler",
          tabBarIcon: ({ color, focused }) => <Ionicons size={22} name={focused ? "bookmark" : "bookmark-outline"} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => <Ionicons size={22} name={focused ? "person" : "person-outline"} color={color} />,
        }}
      />
    </Tabs>
  );
}
