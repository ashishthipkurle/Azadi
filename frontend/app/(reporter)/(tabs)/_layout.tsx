import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

export default function ReporterTabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "ios" ? 18 : 6);
  const tabHeight = 52 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          paddingTop: 5,
          paddingBottom: bottomPadding,
          height: tabHeight,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          justifyContent: "center",
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          marginTop: 2,
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "home" : "home-outline"} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="video"
        options={{
          title: "Play",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "play-circle" : "play-circle-outline"} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages-tab"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "chatbubbles" : "chatbubbles-outline"} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="articles"
        options={{
          title: "Read",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "document-text" : "document-text-outline"} color={color} size={22} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "person" : "person-outline"} color={color} size={22} />
          ),
        }}
      />
    </Tabs>
  );
}
