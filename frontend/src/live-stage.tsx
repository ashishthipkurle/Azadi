// LiveStage: renders a LiveKit RemoteVideoTrack (subscriber) or LocalVideoTrack
// (publisher preview).
//
// On WEB it uses `track.attach(HTMLVideoElement)`.
// On NATIVE it uses `RTCView` from `@livekit/react-native-webrtc` when the
// mediaStream is available, with an informative placeholder while connecting.

import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client";
import { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

type AnyVideoTrack = LocalVideoTrack | RemoteVideoTrack | undefined | null;

let RTCViewComponent: any = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webrtc = require("@livekit/react-native-webrtc");
    RTCViewComponent = webrtc.RTCView || webrtc.default;
  } catch (e) {
    console.warn("RTCView not available:", e);
  }
}

export function LiveStage({
  track,
  label = "LIVE",
  fill = false,
  showBadge = true,
  style,
}: {
  track: AnyVideoTrack;
  label?: string;
  fill?: boolean;
  showBadge?: boolean;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el as unknown as HTMLMediaElement);
    return () => {
      try {
        track.detach(el as unknown as HTMLMediaElement);
      } catch {
        /* ignore */
      }
    };
  }, [track]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.frame, fill && styles.frameFill, style]}>
        <video
          ref={ref as any}
          autoPlay
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", background: "#111418" }}
        />
        {showBadge && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>{label}</Text>
          </View>
        )}
      </View>
    );
  }

  // Native (Android / iOS):
  const streamURL =
    track && (track as any).mediaStream && typeof (track as any).mediaStream.toURL === "function"
      ? (track as any).mediaStream.toURL()
      : null;

  if (RTCViewComponent && streamURL) {
    return (
      <View style={[styles.frame, fill && styles.frameFill, style]}>
        <RTCViewComponent
          streamURL={streamURL}
          objectFit="cover"
          style={StyleSheet.absoluteFill}
          mirror={(track as any)?.isLocal || false}
        />
        {showBadge && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>{label}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.frame, fill && styles.frameFill, styles.nativeFallback, style]}>
      <View style={styles.radarPulse}>
        <Icon name="radio" color={colors.red} size={44} />
      </View>
      <Text style={styles.fallbackTitle}>Live Field Stream</Text>
      <Text style={styles.fallbackBody}>
        Connecting to the reporter's real-time broadcast feed.
      </Text>
      {showBadge && (
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>{label}</Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    frame: {
      height: 260,
      backgroundColor: colors.dark,
      borderRadius: 8,
      overflow: "hidden",
      position: "relative",
    },
    frameFill: {
      height: "100%",
      width: "100%",
      borderRadius: 0,
      flex: 1,
    },
    nativeFallback: {
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 12,
      backgroundColor: "#0d0f12",
    },
    radarPulse: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: "rgba(229, 9, 20, 0.15)",
      borderWidth: 1.5,
      borderColor: "rgba(229, 9, 20, 0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    fallbackTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 18, letterSpacing: -0.3 },
    fallbackBody: { color: "#9E9E9E", fontSize: 13, textAlign: "center", lineHeight: 19, maxWidth: 280 },
    livePill: {
      position: "absolute",
      top: 12,
      left: 12,
      flexDirection: "row",
      gap: 6,
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.55)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    liveDot: { backgroundColor: colors.red, width: 7, height: 7, borderRadius: 8 },
    livePillText: { color: colors.surface, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  });
