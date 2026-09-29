import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Animated, LogBox, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { registerForPushNotificationsAsync } from "@/src/notifications";
import { Button, Icon } from "@/src/ui";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

function PushManager() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) {
      registerForPushNotificationsAsync();
    }
  }, [user]);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushManager />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F0E8" } }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F4F0E8" }}>
      <View style={{ flex: 1, padding: 24, alignItems: "center", justifyContent: "center" }}>
        <Icon name="alert-circle" color="#E74C3C" size={48} />
        <Text style={{ fontSize: 24, fontWeight: "800", color: "#18202A", marginTop: 16, marginBottom: 8 }}>
          Something went wrong
        </Text>
        <Text style={{ fontSize: 14, color: "#6A7885", textAlign: "center", marginBottom: 24 }}>
          {error.message}
        </Text>
        <Button onPress={retry}>Try again</Button>
      </View>
    </SafeAreaView>
  );
}
