// MediaPlayer for Web: plays Mux HLS streams using hls.js on Chrome, Edge, and Firefox,
// and native HLS on Safari, while supporting expo-image for image attachments.
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { Image } from "expo-image";
import Hls from "hls.js";

import { useTheme } from "@/src/hooks/use-theme";
import { Icon, ReelSkeleton } from "@/src/ui";

export type MediaAttachment = {
  kind: string;
  playback_id?: string;
  url?: string;
  asset_id?: string;
};

const muxImage = (id: string) => `https://image.mux.com/${id}/thumbnail.jpg?width=800&fit_mode=preserve`;
const muxStream = (id: string) => `https://stream.mux.com/${id}.m3u8`;

export function MediaPlayer({
  media,
  radius = 8,
  fill = false,
  paused = false,
  muted = true,
  resetOnPause = false,
  showPlayPauseOverlay = false,
  onReady,
}: {
  media: MediaAttachment;
  radius?: number;
  fill?: boolean;
  paused?: boolean;
  muted?: boolean;
  resetOnPause?: boolean;
  showPlayPauseOverlay?: boolean;
  onReady?: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  // Normalize media if passed as a string or array
  let item = media as any;
  if (typeof item === "string") {
    try { item = JSON.parse(item); } catch {}
    if (Array.isArray(item) && item[0]) item = item[0];
  } else if (Array.isArray(item) && item[0]) {
    item = item[0];
  }

  if (!item?.playback_id) {
    return (
      <View style={[fill ? styles.placeholderFill : styles.placeholder, { borderRadius: radius }]}>
        <Icon name={item?.kind === "video" ? "film-outline" : "image-outline"} color={colors.surface} size={24} />
        <Text style={styles.placeholderText}>Processing…</Text>
      </View>
    );
  }
  if (item.kind === "video") {
    return (
      <WebVideoTile
        playbackId={item.playback_id}
        radius={radius}
        fill={fill}
        paused={paused}
        mutedProp={muted}
        resetOnPause={resetOnPause}
        showPlayPauseOverlay={showPlayPauseOverlay}
        onReady={onReady}
      />
    );
  }
  return (
    <Image
      source={{ uri: muxImage(item.playback_id) }}
      style={[fill ? styles.imageFill : styles.image, { borderRadius: radius }]}
      contentFit="cover"
      transition={200}
    />
  );
}

function WebVideoTile({
  playbackId,
  radius,
  fill,
  paused = false,
  mutedProp = true,
  resetOnPause = false,
  showPlayPauseOverlay = false,
  onReady,
}: {
  playbackId: string;
  radius: number;
  fill?: boolean;
  paused?: boolean;
  mutedProp?: boolean;
  resetOnPause?: boolean;
  showPlayPauseOverlay?: boolean;
  onReady?: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(mutedProp);

  useEffect(() => {
    setMuted(mutedProp);
    if (videoRef.current) {
      videoRef.current.muted = mutedProp;
    }
  }, [mutedProp]);

  const [isPlaying, setIsPlaying] = useState(!paused);
  const [userToggledPause, setUserToggledPause] = useState(false);

  // React to paused prop changes (tab navigation, scrolling, window blur)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (paused) {
      video.pause();
      if (resetOnPause) {
        try {
          video.currentTime = 0;
        } catch {}
        setUserToggledPause(false);
      }
      setIsPlaying(false);
    } else {
      if (resetOnPause) {
        try {
          video.currentTime = 0;
        } catch {}
      }
      // Screen is active again: if the user didn't manually pause, resume playing
      if (!userToggledPause) {
        onReady?.(); video.play().then(() => setIsPlaying(true)).catch(() => {
          setIsPlaying(false);
        });
      }
    }
  }, [paused, userToggledPause, resetOnPause]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const streamUrl = muxStream(playbackId);
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!paused && !userToggledPause) {
          onReady?.(); video.play().then(() => setIsPlaying(true)).catch(() => {
            setIsPlaying(false);
          });
        }
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              hls?.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      if (!paused && !userToggledPause) {
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    }

    return () => {
      if (video) {
        video.pause();
      }
      if (hls) {
        hls.destroy();
      }
    };
  }, [playbackId]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setUserToggledPause(false);
      onReady?.(); video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      setUserToggledPause(true);
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = (e: any) => {
    e?.stopPropagation?.();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  return (
    <View style={[fill ? styles.videoFrameFill : styles.videoFrame, { borderRadius: radius }]}>
      <ReelSkeleton style={StyleSheet.absoluteFillObject} />
      <video
        ref={videoRef}
        playsInline
        autoPlay={!paused}
        loop
        muted={muted}
        poster={muxImage(playbackId)}
        controls={!fill}
        onClick={fill ? togglePlay : undefined}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          backgroundColor: "#000",
          cursor: fill ? "pointer" : "default",
        }}
      />
      {fill && showPlayPauseOverlay && !isPlaying && (
        <Pressable onPress={togglePlay} style={styles.centerPlayOverlay}>
          <View style={styles.playIconCircle}>
            <Icon name="play" color="#fff" size={36} />
          </View>
        </Pressable>
      )}
      {fill && (
        <Pressable
          onPress={toggleMute}
          style={styles.muteBtn}
          hitSlop={12}
        >
          <Icon name={muted ? "volume-mute" : "volume-high"} color="#fff" size={20} />
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  image: { width: "100%", height: 220, backgroundColor: colors.dark },
  imageFill: { flex: 1, width: "100%", backgroundColor: colors.dark },
  videoFrame: { width: "100%", height: 220, backgroundColor: colors.dark, overflow: "hidden", position: "relative" },
  videoFrameFill: { flex: 1, width: "100%", height: "100%", alignSelf: "stretch", backgroundColor: colors.dark, overflow: "hidden", position: "relative" },
  placeholder: {
    width: "100%",
    height: 180,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderFill: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderText: { color: colors.surface, fontSize: 12, fontWeight: "700" },
  centerPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  playIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  muteBtn: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
});

