// MediaPlayer: renders a Mux-hosted attachment inline.
//   - Image: <expo-image /> using Mux's thumbnail CDN.
//   - Video: <expo-video VideoView /> playing the Mux HLS URL. Native platforms
//     handle HLS natively; on web `expo-video` uses hls.js under the hood.
//
// If the attachment doesn't have a playback_id yet (Mux still processing),
// we show a labeled placeholder so the feed never has broken thumbnails.
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, Text, View } from "react-native";

import {   } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

export type MediaAttachment = {
  kind: string;
  playback_id?: string;
  url?: string;
};

const muxImage = (id: string) => `https://image.mux.com/${id}/thumbnail.jpg?width=800&fit_mode=preserve`;
const muxStream = (id: string) => `https://stream.mux.com/${id}.m3u8`;

export function MediaPlayer({ media, radius = 8, fill = false }: { media: MediaAttachment; radius?: number; fill?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  if (!media.playback_id) {
    return (
      <View style={[fill ? styles.placeholderFill : styles.placeholder, { borderRadius: radius }]}>
        <Icon name={media.kind === "video" ? "film-outline" : "image-outline"} color={colors.surface} size={24} />
        <Text style={styles.placeholderText}>Processing…</Text>
      </View>
    );
  }
  if (media.kind === "video") {
    return <VideoTile playbackId={media.playback_id} radius={radius} fill={fill} />;
  }
  return (
    <Image
      source={{ uri: muxImage(media.playback_id) }}
      style={[fill ? styles.imageFill : styles.image, { borderRadius: radius }]}
      contentFit="cover"
      transition={200}
    />
  );
}

function VideoTile({ playbackId, radius, fill }: { playbackId: string; radius: number; fill?: boolean }) {
  const player = useVideoPlayer(muxStream(playbackId), (p) => {
    p.loop = false;
    p.muted = true;
    p.playbackRate = 1;
  });
  return (
    <View style={[fill ? styles.videoFrameFill : styles.videoFrame, { borderRadius: radius }]}>
      <VideoView
        style={StyleSheet.absoluteFillObject}
        player={player}
        contentFit="cover"
        allowsFullscreen
        allowsPictureInPicture
        nativeControls
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  image: { width: "100%", height: 220, backgroundColor: colors.dark },
  imageFill: { flex: 1, width: "100%", backgroundColor: colors.dark },
  videoFrame: { width: "100%", height: 220, backgroundColor: colors.dark, overflow: "hidden" },
  videoFrameFill: { flex: 1, width: "100%", backgroundColor: colors.dark, overflow: "hidden" },
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
});
