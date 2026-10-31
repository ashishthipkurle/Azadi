// MediaPlayer: renders a Mux-hosted or direct attachment inline.
//   - Image: <expo-image /> using Mux's thumbnail CDN or direct URL.
//   - Video: <expo-video VideoView /> playing Mux HLS stream or direct URL.
//   - Skeleton & Thumbnail: Renders animated skeleton placeholder and instant
//     thumbnail preview while the video buffers so the user never sees a black frame.
import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/hooks/use-theme";
import { Icon, ReelSkeleton } from "@/src/ui";

export type MediaAttachment = {
  kind: string;
  playback_id?: string;
  url?: string;
  asset_id?: string;
  thumbnail_url?: string;
};

export const muxImage = (id: string) => `https://image.mux.com/${id}/thumbnail.jpg?width=800&fit_mode=preserve`;
export const muxStream = (id: string) => `https://stream.mux.com/${id}.m3u8`;

export function MediaPlayer({
  media,
  radius = 8,
  fill = false,
  paused = false,
  muted = false,
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

  if (!item?.playback_id && !item?.url) {
    return (
      <View style={[fill ? styles.placeholderFill : styles.placeholder, { borderRadius: radius }]}>
        <ReelSkeleton style={StyleSheet.absoluteFillObject} />
      </View>
    );
  }

  const isVideo = item.kind === "video" || !!item.playback_id || (item.url && item.url.match(/\.(mp4|m3u8|mov|webm)$/i));

  if (isVideo) {
    return (
      <VideoTile
        playbackId={item.playback_id}
        url={item.url}
        posterUrl={item.thumbnail_url || (item.playback_id ? muxImage(item.playback_id) : undefined)}
        radius={radius}
        fill={fill}
        paused={paused}
        muted={muted}
        resetOnPause={resetOnPause}
        onReady={onReady}
      />
    );
  }

  const imageUri = item.thumbnail_url || (item.playback_id ? muxImage(item.playback_id) : item.url);
  return (
    <Image
      source={{ uri: imageUri }}
      style={[fill ? styles.imageFill : styles.image, { borderRadius: radius }]}
      contentFit="cover"
      transition={200}
    />
  );
}

function VideoTile({
  playbackId,
  url,
  posterUrl,
  radius,
  fill,
  paused = false,
  muted = false,
  resetOnPause = false,
  onReady,
}: {
  playbackId?: string;
  url?: string;
  posterUrl?: string;
  radius: number;
  fill?: boolean;
  paused?: boolean;
  muted?: boolean;
  resetOnPause?: boolean;
  onReady?: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const streamUri = playbackId ? muxStream(playbackId) : (url || "");
  const thumbnailUri = posterUrl || (playbackId ? muxImage(playbackId) : url);

  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);

  const player = useVideoPlayer(streamUri, (p) => {
    p.loop = true;
    p.muted = muted;
    p.playbackRate = 1;
    if (!paused) {
      p.play();
    }
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  // Track player readiness and fire onReady callback
  useEffect(() => {
    const handleReady = () => {
      setIsVideoReady(true);
      onReady?.();
    };

    if (player.status === "readyToPlay" || player.playing) {
      handleReady();
    }

    const subStatus = player.addListener?.("statusChange", ({ status }: any) => {
      if (status === "readyToPlay") {
        handleReady();
      }
    });

    const subPlaying = player.addListener?.("playingChange", ({ isPlaying }: any) => {
      if (isPlaying) {
        handleReady();
        setHasStartedPlaying(true);
      }
    });

    // Fallback: after 2.5s release queue even if network is slow
    const fallbackTimer = setTimeout(() => {
      onReady?.();
    }, 2500);

    return () => {
      clearTimeout(fallbackTimer);
      subStatus?.remove?.();
      subPlaying?.remove?.();
    };
  }, [player, onReady]);

  useEffect(() => {
    if (paused) {
      player.pause();
      if (resetOnPause && hasStartedPlaying) {
        try {
          player.currentTime = 0;
        } catch {}
      }
    } else {
      player.play();
    }
  }, [paused, player, resetOnPause, hasStartedPlaying]);

  return (
    <View style={[fill ? styles.videoFrameFill : styles.videoFrame, { borderRadius: radius }]}>
      {/* 1. Skeleton Loader: visible until thumbnail or video is ready */}
      {!thumbnailLoaded && !isVideoReady && (
        <ReelSkeleton style={StyleSheet.absoluteFillObject} />
      )}

      {/* 2. Video Thumbnail: immediately visible, prevents black frame */}
      {thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={150}
          onLoad={() => setThumbnailLoaded(true)}
        />
      ) : null}

      {/* 3. VideoView: transparent until readyToPlay, smooth transition */}
      <VideoView
        style={[
          StyleSheet.absoluteFillObject,
          !isVideoReady && { opacity: 0 },
        ]}
        player={player}
        contentFit="cover"
        allowsFullscreen
        allowsPictureInPicture
        nativeControls={!fill}
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  image: { width: "100%", height: 220, backgroundColor: colors.dark },
  imageFill: { flex: 1, width: "100%", backgroundColor: colors.dark },
  videoFrame: { width: "100%", height: 220, backgroundColor: colors.dark, overflow: "hidden" },
  videoFrameFill: { flex: 1, width: "100%", height: "100%", alignSelf: "stretch", backgroundColor: colors.dark, overflow: "hidden" },
  placeholder: {
    width: "100%",
    height: 180,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  placeholderFill: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  placeholderText: { color: colors.surface, fontSize: 12, fontWeight: "700" },
});
