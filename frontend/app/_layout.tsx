import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, LogBox, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";

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

// Helper for Web video splash to bypass expo-video limitations
function WebVideoSplash({ onFinish }: { onFinish: () => void }) {
  // Expo's Asset module will give us the actual URL to the video file
  const [uri, setUri] = useState<string | null>(null);
  
  useEffect(() => {
    import("expo-asset").then(async ({ Asset }) => {
      const asset = await Asset.loadAsync(require("@/assets/videos/opening_animation.mp4"));
      setUri(asset[0].localUri || asset[0].uri);
    });
    
    // Fallback in case video fails to load or play
    const timeout = setTimeout(onFinish, 6000);
    return () => clearTimeout(timeout);
  }, [onFinish]);

  if (!uri) return <View style={{ flex: 1, backgroundColor: "#F4F0E8" }} />;

  return (
    <View style={{
      width: "100%",
      height: "100%",
      maxWidth: "100%",
      maxHeight: "100%",
      aspectRatio: 9 / 16,
      overflow: "hidden",
    }}>
      {/* @ts-ignore - React Native Web supports rendering standard DOM elements */}
      <video
        src={uri}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "fill",
          backgroundColor: "#F4F0E8",
          border: "none",
          outline: "none",
          transform: "scale(1.015)", // Imperceptible 1.5% scale just to push the 1px artifact past the overflow:hidden wrapper
        }}
        autoPlay
        muted
        playsInline
        onEnded={onFinish}
      />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [isVideoFinished, setIsVideoFinished] = useState(false);

  // --- Native: use the real video splash ---
  const videoReady = useRef(false);
  const player = useVideoPlayer(
    Platform.OS !== "web" ? require("@/assets/videos/opening_animation.mp4") : null,
    player => {
      if (Platform.OS !== "web") {
        player.play();
      }
    },
  );

  // Listen for video playback starting — hide native splash only then
  useEventListener(player, 'statusChange', (ev: any) => {
    if (!videoReady.current && ev?.status === 'readyToPlay') {
      videoReady.current = true;
      SplashScreen.hideAsync();
    }
  });

  useEventListener(player, 'playToEnd', () => {
    setIsVideoFinished(true);
  });

  useEffect(() => {
    // On web or if fonts error out, hide splash immediately
    if (Platform.OS === "web" && (loaded || error)) {
      SplashScreen.hideAsync();
    }
    // Safety timeout: hide native splash after 4s no matter what
    // (prevents the app from getting stuck on the static logo)
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 4000);
    return () => clearTimeout(timeout);
  }, [loaded, error]);

  // If the CDN is unreachable we fall through on error rather than wedging
  // the app — icons will tofu, but the app still boots.
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushManager />
        {!isVideoFinished ? (
          Platform.OS === "web" ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#F4F0E8", justifyContent: "center", alignItems: "center" }]}>
              <WebVideoSplash onFinish={() => setIsVideoFinished(true)} />
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#F4F0E8" }]}>
              <View style={{ position: "absolute", width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", aspectRatio: 9 / 16, overflow: "hidden" }}>
                <VideoView player={player} style={{ width: "100%", height: "100%", transform: [{ scale: 1.015 }] }} contentFit="fill" nativeControls={false} />
              </View>
            </View>
          )
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F0E8" } }} />
        )}
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
