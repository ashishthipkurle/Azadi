import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, Platform, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { Provider } from "react-redux";
import { store } from "@/src/store";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { registerForPushNotificationsAsync } from "@/src/notifications";
import { Button, Icon } from "@/src/ui";
import { AzadiAnimatedSplash } from "@/src/shared/azadi-animated-splash";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);
LogBox.ignoreLogs([
  "6000ms timeout exceeded",
  "fontfaceobserver",
  "FontObserver",
]);

if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerGlobals } = require("@livekit/react-native");
    if (typeof registerGlobals === "function") {
      registerGlobals();
    }
  } catch (e) {
    console.warn("LiveKit globals registration:", e);
  }
}

if (Platform.OS === "web" && typeof window !== "undefined") {
  const origOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (String(message).includes("6000ms timeout") || String(message).includes("fontfaceobserver")) {
      return true; // suppresses error alert/box
    }
    return origOnError ? origOnError.call(window, message, source, lineno, colno, error) : false;
  };
}

// Keep the native splash visible from cold start until animated splash takes over.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [isSplashFinished, setIsSplashFinished] = useState(false);

  useEffect(() => {
    // If fonts error out or on web, ensure splash doesn't block indefinitely
    const timeout = setTimeout(() => {
      setIsSplashFinished(true);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [loaded, error]);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <AuthProvider>
          <PushManager />
          {!isSplashFinished ? (
            <AzadiAnimatedSplash onFinish={() => setIsSplashFinished(true)} />
          ) : (
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F0E8" } }} />
          )}
        </AuthProvider>
      </SafeAreaProvider>
    </Provider>
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
