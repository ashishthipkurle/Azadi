import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

export default function ReporterTabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          minHeight: Platform.OS === "ios" ? 85 : 65,
        },
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
          marginTop: 4,
          marginBottom: Platform.OS === "ios" ? 0 : 4,
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
