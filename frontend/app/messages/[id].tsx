import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  GestureResponderEvent,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";

import { API, TOKEN_KEY, apiGet, apiPost } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { useE2EE } from "@/src/hooks/use-e2ee";
import { Icon } from "@/src/ui";
import { getLocalMessages, saveLocalMessages, getCachedMedia } from "@/src/utils/local-db";
import { generateMediaKey, encryptMediaData, decryptMediaData } from "@/src/utils/e2e-crypto";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  encrypted: boolean;
  read: boolean;
  created_at: string;
};

type UploadingMedia = {
  id: string;
  uri: string;
  mediaType: "image" | "video";
  progress: number;
  fileName?: string;
  created_at: string;
};

type ChatListItem = Message & {
  isUploading?: boolean;
  uploadProgress?: number;
  localUri?: string;
  mediaType?: "image" | "video";
};

function isVideoMedia(url: string): boolean {
  if (!url) return false;
  const clean = url.toLowerCase().split("?")[0];
  return (
    clean.endsWith(".mp4") ||
    clean.endsWith(".mov") ||
    clean.endsWith(".webm") ||
    clean.endsWith(".m4v") ||
    clean.endsWith(".mkv") ||
    clean.endsWith(".3gp") ||
    clean.endsWith(".avi") ||
    clean.includes("/video/") ||
    clean.includes("video")
  );
}

function formatVideoTime(secs: number): string {
  if (!secs || isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Native Video Thumbnail for mobile
function NativeVideoThumbnail({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.pause();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFillObject}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

// Component to handle offline media caching, thumbnail preview, and encrypted media decryption
function CachedImage({
  url,
  style,
  contentFit,
  mediaKey,
  isVideo,
  onPress,
}: {
  url: string;
  style: any;
  contentFit: string;
  mediaKey?: string;
  isVideo?: boolean;
  onPress?: (resolvedUri: string) => void;
}) {
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (Platform.OS === "web") {
          if (active) setLocalUri(url);
          return;
        }
        if (mediaKey) {
          // Encrypted media: download raw bytes, decrypt, write to temp file
          const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || "";
          const encryptedB64 = await FileSystem.readAsStringAsync(
            await getCachedMedia(url),
            { encoding: "base64" as any }
          ).catch(async () => {
            const tmpPath = `${cacheDir}enc_${Date.now()}`;
            await FileSystem.downloadAsync(url, tmpPath);
            return await FileSystem.readAsStringAsync(tmpPath, { encoding: "base64" as any });
          });

          const decryptedB64 = await decryptMediaData(encryptedB64, mediaKey);
          const ext = isVideo ? "mp4" : "jpg";
          const decPath = `${cacheDir}dec_${Date.now()}.${ext}`;
          await FileSystem.writeAsStringAsync(decPath, decryptedB64, { encoding: "base64" as any });
          if (active) setLocalUri(decPath);
        } else {
          // Unencrypted media
          const cached = await getCachedMedia(url);
          if (active) setLocalUri(cached);
        }
      } catch (e) {
        console.error("Media load/decrypt failed:", e);
        if (active) setLocalUri(url);
      }
    })();
    return () => {
      active = false;
    };
  }, [url, mediaKey, isVideo]);

  return (
    <Pressable
      onPress={() => onPress?.(localUri || url)}
      style={({ pressed }) => [style, { opacity: pressed ? 0.9 : 1, overflow: "hidden" }]}
    >
      {!localUri ? (
        <View style={[style, { backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator size="small" color="#fff" />
        </View>
      ) : isVideo ? (
        Platform.OS === "web" ? (
          <video
            src={localUri || url}
            preload="auto"
            muted
            playsInline
            onLoadedData={(e) => {
              try {
                (e.currentTarget as HTMLVideoElement).currentTime = 0.001;
              } catch {}
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              pointerEvents: "none",
              borderRadius: 16,
              backgroundColor: "#0f172a",
            }}
          />
        ) : (
          <NativeVideoThumbnail uri={localUri || url} />
        )
      ) : (
        <Image source={{ uri: localUri }} style={StyleSheet.absoluteFillObject} contentFit={contentFit as any} />
      )}
      {isVideo && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.22)",
            },
          ]}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "rgba(0,0,0,0.65)",
              borderWidth: 1.5,
              borderColor: "rgba(255,255,255,0.9)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ marginLeft: 3 }}>
              <Icon name="play" color="#fff" size={22} />
            </View>
          </View>
          <View
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "rgba(0,0,0,0.6)",
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Icon name="videocam" color="#fff" size={11} />
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>VIDEO</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// Fullscreen Interactive Video Player Modal with -10s, Play/Pause, +10s and Scrubber
function ChatVideoModal({
  videoUrl,
  onClose,
}: {
  videoUrl: string | null;
  onClose: () => void;
}) {
  if (!videoUrl) return null;

  return (
    <Modal
      visible={!!videoUrl}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <ChatVideoContent videoUrl={videoUrl} onClose={onClose} />
    </Modal>
  );
}

// Web Fullscreen Video Player using standard HTML5 Video API
function WebChatVideoContent({
  videoUrl,
  onClose,
}: {
  videoUrl: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<"-10" | "+10" | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const controlsTimeoutRef = useRef<any>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControlsTimer]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    // Start video playback automatically
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          // If browser policy blocked unmuted autoplay, retry with muted
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        });
    }

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.pause();
    };
  }, [videoUrl]);

  const togglePlayPause = () => {
    resetControlsTimer();
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      if (video.muted && isMuted) {
        video.muted = false;
        setIsMuted(false);
      }
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("Play error:", err));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    resetControlsTimer();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleRewind10 = () => {
    resetControlsTimer();
    setSeekFeedback("-10");
    setTimeout(() => setSeekFeedback(null), 700);
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, video.currentTime - 10);
      setCurrentTime(video.currentTime);
    }
  };

  const handleForward10 = () => {
    resetControlsTimer();
    setSeekFeedback("+10");
    setTimeout(() => setSeekFeedback(null), 700);
    const video = videoRef.current;
    if (video) {
      const dur = video.duration || duration || 0;
      video.currentTime = dur > 0 ? Math.min(dur, video.currentTime + 10) : video.currentTime + 10;
      setCurrentTime(video.currentTime);
    }
  };

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const handleTrackPress = (e: GestureResponderEvent) => {
    if (trackWidth <= 0 || !duration) return;
    resetControlsTimer();
    const clickX = e.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, clickX / trackWidth));
    const target = ratio * duration;
    const video = videoRef.current;
    if (video) {
      video.currentTime = target;
      setCurrentTime(target);
    }
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        src={videoUrl}
        playsInline
        loop
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          backgroundColor: "#000",
        }}
      />

      {/* Touch backdrop to toggle controls */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={() => {
          if (showControls) {
            setShowControls(false);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          } else {
            resetControlsTimer();
          }
        }}
      />

      {/* Floating Seek Feedback */}
      {seekFeedback && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            alignSelf: "center",
            top: "40%",
            backgroundColor: "rgba(0,0,0,0.85)",
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 24,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.25)",
            zIndex: 60,
          }}
        >
          <Icon name={seekFeedback === "-10" ? "play-back" : "play-forward"} color="#fff" size={24} />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{seekFeedback}s</Text>
        </View>
      )}

      {/* Overlaid UI Controls (fade in / out) */}
      {showControls && (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { justifyContent: "space-between", zIndex: 50 }]}>
          {/* Top Bar with Title, Mute, and Close Button */}
          <View
            style={{
              paddingTop: Platform.OS === "ios" ? 54 : 36,
              paddingHorizontal: 20,
              paddingBottom: 16,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="videocam" color="#fff" size={20} />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Video</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                onPress={toggleMute}
                hitSlop={12}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={isMuted ? "volume-mute" : "volume-high"} color="#fff" size={20} />
              </Pressable>
              <Pressable
                onPress={onClose}
                hitSlop={16}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" color="#fff" size={24} />
              </Pressable>
            </View>
          </View>

          {/* Center Playback Controls: [-10s] [Play/Pause] [+10s] */}
          <View
            pointerEvents="box-none"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 36,
            }}
          >
            {/* Rewind 10s */}
            <Pressable
              onPress={handleRewind10}
              hitSlop={15}
              style={({ pressed }) => ({
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: pressed ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.6)",
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.4)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="play-back" color="#fff" size={24} />
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", marginTop: 1 }}>-10s</Text>
            </Pressable>

            {/* Play / Pause Toggle */}
            <Pressable
              onPress={togglePlayPause}
              hitSlop={15}
              style={({ pressed }) => ({
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: pressed ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.65)",
                borderWidth: 2,
                borderColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <View style={!isPlaying ? { marginLeft: 4 } : undefined}>
                <Icon
                  name={isPlaying ? "pause" : "play"}
                  color="#fff"
                  size={34}
                />
              </View>
            </Pressable>

            {/* Fast Forward 10s */}
            <Pressable
              onPress={handleForward10}
              hitSlop={15}
              style={({ pressed }) => ({
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: pressed ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.6)",
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.4)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="play-forward" color="#fff" size={24} />
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", marginTop: 1 }}>+10s</Text>
            </Pressable>
          </View>

          {/* Bottom Bar: [0:12] ====[o]====== [1:30] */}
          <View
            style={{
              paddingBottom: Platform.OS === "ios" ? 44 : 28,
              paddingTop: 16,
              paddingHorizontal: 20,
              backgroundColor: "rgba(0,0,0,0.6)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: "600",
                  minWidth: 42,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatVideoTime(currentTime)}
              </Text>

              {/* Scrubber Progress Track */}
              <Pressable
                onPress={handleTrackPress}
                onLayout={handleTrackLayout}
                hitSlop={{ top: 14, bottom: 14 }}
                style={{ flex: 1, height: 32, justifyContent: "center" }}
              >
                <View
                  style={{
                    height: 5,
                    backgroundColor: "rgba(255,255,255,0.25)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${progressRatio * 100}%`,
                      height: "100%",
                      backgroundColor: "#3B82F6",
                      borderRadius: 3,
                    }}
                  />
                </View>
                {/* Thumb Indicator */}
                <View
                  style={{
                    position: "absolute",
                    left: `${progressRatio * 100}%`,
                    marginLeft: -7,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: "#fff",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.5,
                    shadowRadius: 2,
                    elevation: 3,
                  }}
                />
              </Pressable>

              <Text
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 12,
                  fontWeight: "600",
                  minWidth: 42,
                  textAlign: "right",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatVideoTime(duration)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Native Fullscreen Video Player using expo-video
function NativeChatVideoContent({
  videoUrl,
  onClose,
}: {
  videoUrl: string;
  onClose: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<"-10" | "+10" | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const controlsTimeoutRef = useRef<any>(null);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    player.timeUpdateEventInterval = 0.25;
    const subTime = player.addListener("timeUpdate", (e) => {
      setCurrentTime(e.currentTime);
      if (player.duration > 0 && !duration) {
        setDuration(player.duration);
      }
    });
    const subPlay = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
    });
    const subStatus = player.addListener("statusChange", (e) => {
      if (player.duration > 0) {
        setDuration(player.duration);
      }
    });

    return () => {
      subTime.remove();
      subPlay.remove();
      subStatus.remove();
    };
  }, [player, duration]);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [resetControlsTimer]);

  const togglePlayPause = () => {
    resetControlsTimer();
    if (player.playing) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    resetControlsTimer();
    player.muted = !player.muted;
    setIsMuted(player.muted);
  };

  const handleRewind10 = () => {
    resetControlsTimer();
    setSeekFeedback("-10");
    setTimeout(() => setSeekFeedback(null), 700);
    try {
      player.seekBy(-10);
    } catch {
      player.currentTime = Math.max(0, (player.currentTime || currentTime) - 10);
    }
  };

  const handleForward10 = () => {
    resetControlsTimer();
    setSeekFeedback("+10");
    setTimeout(() => setSeekFeedback(null), 700);
    try {
      player.seekBy(10);
    } catch {
      const target = (player.currentTime || currentTime) + 10;
      player.currentTime = duration > 0 ? Math.min(duration, target) : target;
    }
  };

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const handleTrackPress = (e: GestureResponderEvent) => {
    if (trackWidth <= 0 || !duration) return;
    resetControlsTimer();
    const clickX = e.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, clickX / trackWidth));
    const target = ratio * duration;
    try {
      player.currentTime = target;
      setCurrentTime(target);
    } catch {}
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Video View */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="contain"
        nativeControls={false}
      />

      {/* Touch backdrop to toggle controls */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={() => {
          if (showControls) {
            setShowControls(false);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          } else {
            resetControlsTimer();
          }
        }}
      />

      {/* Floating Seek Feedback */}
      {seekFeedback && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            alignSelf: "center",
            top: "40%",
            backgroundColor: "rgba(0,0,0,0.85)",
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 24,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.25)",
            zIndex: 60,
          }}
        >
          <Icon name={seekFeedback === "-10" ? "play-back" : "play-forward"} color="#fff" size={24} />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{seekFeedback}s</Text>
        </View>
      )}

      {/* Overlaid UI Controls (fade in / out) */}
      {showControls && (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { justifyContent: "space-between", zIndex: 50 }]}>
          {/* Top Bar with Close Button */}
          <View
            style={{
              paddingTop: Platform.OS === "ios" ? 54 : 36,
              paddingHorizontal: 20,
              paddingBottom: 16,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="videocam" color="#fff" size={20} />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Video</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                onPress={toggleMute}
                hitSlop={12}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={isMuted ? "volume-mute" : "volume-high"} color="#fff" size={20} />
              </Pressable>
              <Pressable
                onPress={onClose}
                hitSlop={16}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" color="#fff" size={24} />
              </Pressable>
            </View>
          </View>

          {/* Center Playback Controls: [-10s] [Play/Pause] [+10s] */}
          <View
            pointerEvents="box-none"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 36,
            }}
          >
            {/* Rewind 10s */}
            <Pressable
              onPress={handleRewind10}
              hitSlop={15}
              style={({ pressed }) => ({
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: pressed ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.6)",
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.4)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="play-back" color="#fff" size={24} />
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", marginTop: 1 }}>-10s</Text>
            </Pressable>

            {/* Play / Pause Toggle */}
            <Pressable
              onPress={togglePlayPause}
              hitSlop={15}
              style={({ pressed }) => ({
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: pressed ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.65)",
                borderWidth: 2,
                borderColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <View style={!isPlaying ? { marginLeft: 4 } : undefined}>
                <Icon
                  name={isPlaying ? "pause" : "play"}
                  color="#fff"
                  size={34}
                />
              </View>
            </Pressable>

            {/* Fast Forward 10s */}
            <Pressable
              onPress={handleForward10}
              hitSlop={15}
              style={({ pressed }) => ({
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: pressed ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.6)",
                borderWidth: 1.5,
                borderColor: "rgba(255,255,255,0.4)",
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Icon name="play-forward" color="#fff" size={24} />
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", marginTop: 1 }}>+10s</Text>
            </Pressable>
          </View>

          {/* Bottom Bar: [0:12] ====[o]====== [1:30] */}
          <View
            style={{
              paddingBottom: Platform.OS === "ios" ? 44 : 28,
              paddingTop: 16,
              paddingHorizontal: 20,
              backgroundColor: "rgba(0,0,0,0.6)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: "600",
                  minWidth: 42,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatVideoTime(currentTime)}
              </Text>

              {/* Scrubber Progress Track */}
              <Pressable
                onPress={handleTrackPress}
                onLayout={handleTrackLayout}
                hitSlop={{ top: 14, bottom: 14 }}
                style={{ flex: 1, height: 32, justifyContent: "center" }}
              >
                <View
                  style={{
                    height: 5,
                    backgroundColor: "rgba(255,255,255,0.25)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${progressRatio * 100}%`,
                      height: "100%",
                      backgroundColor: "#3B82F6",
                      borderRadius: 3,
                    }}
                  />
                </View>
                {/* Thumb Indicator */}
                <View
                  style={{
                    position: "absolute",
                    left: `${progressRatio * 100}%`,
                    marginLeft: -7,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: "#fff",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.5,
                    shadowRadius: 2,
                    elevation: 3,
                  }}
                />
              </Pressable>

              <Text
                style={{
                  color: "rgba(255,255,255,0.75)",
                  fontSize: 12,
                  fontWeight: "600",
                  minWidth: 42,
                  textAlign: "right",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatVideoTime(duration)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ChatVideoContent({
  videoUrl,
  onClose,
}: {
  videoUrl: string;
  onClose: () => void;
}) {
  if (Platform.OS === "web") {
    return <WebChatVideoContent videoUrl={videoUrl} onClose={onClose} />;
  }
  return <NativeChatVideoContent videoUrl={videoUrl} onClose={onClose} />;
}

export default function ChatScreen() {
  const { id: otherId, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user, ready } = useAuth();
  const { encrypt, decrypt, isReady, hasE2EE } = useE2EE();

  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [uploadingList, setUploadingList] = useState<UploadingMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<{ name: string; avatar_url?: string } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // Monitor keyboard display to ensure input is never obscured on Android
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
    });

    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (ready && !user) {
    return <Redirect href="/" />;
  }

  const load = useCallback(async () => {
    try {
      if (!user) return;
      const [data, uData] = await Promise.all([
        apiGet<Message[]>(`/messages/${otherId}`),
        apiGet<{ name: string; avatar_url?: string }>(`/users/${otherId}/basic`).catch(() => null),
      ]);

      // Save pulled messages to SQLite local DB
      saveLocalMessages(
        data.map((m) => ({ ...m, encrypted: Boolean(m.encrypted) })),
        user.id
      ).catch(console.error);

      setMessages((prev) => {
        const dataIds = new Set(data.map((m) => m.id));
        const missingLocals = prev.filter((m) => !dataIds.has(m.id));
        const merged = [...data, ...missingLocals];
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return merged;
      });
      if (uData) setOtherUser(uData);
    } catch {
      // Offline mode fallback handled by SQLite
    } finally {
      setLoading(false);
    }
  }, [otherId, user]);

  useEffect(() => {
    // 1. Instantly load messages from SQLite cache on mount
    if (user) {
      getLocalMessages(otherId)
        .then((local) => {
          if (local.length > 0) {
            setMessages(local.reverse());
          }
        })
        .catch(console.error);
    }

    // 2. Poll server for updates
    load();
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, [load, otherId, user]);

  // Handle decryption
  useEffect(() => {
    if (!user?.id) return;
    messages.forEach(async (msg) => {
      if (msg.encrypted && !decryptedMessages[msg.id]) {
        try {
          let pt = "";
          try {
            const parsed = JSON.parse(msg.body);
            if (parsed.r && parsed.s) {
              const cipher = msg.sender_id === user.id ? parsed.s : parsed.r;
              pt = await decrypt(cipher);
            } else {
              pt = await decrypt(msg.body);
            }
          } catch {
            if (msg.sender_id === user.id) {
              setDecryptedMessages((prev) => ({ ...prev, [msg.id]: "🔒 Sent Securely" }));
              return;
            } else {
              pt = await decrypt(msg.body);
            }
          }
          setDecryptedMessages((prev) => ({ ...prev, [msg.id]: pt }));
        } catch {
          // If local decrypt fails (e.g. key mismatch), show message as is or generic label
          setDecryptedMessages((prev) => ({ ...prev, [msg.id]: msg.body || "🔒 Message" }));
        }
      }
    });
  }, [messages, decrypt, decryptedMessages, user?.id]);

  const sendMessage = async (textMessage: string) => {
    const text = textMessage.trim();
    if (text.length === 0 || !user?.id) return;
    setSending(true);

    // 1. Optimistic update (instantaneous UI response)
    const tempId = "temp-" + Date.now();
    const tempMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: otherId,
      body: text,
      encrypted: hasE2EE,
      read: false,
      created_at: new Date().toISOString(),
    };

    setDecryptedMessages((prev) => ({ ...prev, [tempId]: text }));
    setMessages((prev) => [...prev, tempMsg]);

    // 2. Encrypt if E2EE is available, otherwise send directly (backend encrypts at rest)
    let ciphertext = text;
    let encrypted = false;
    if (hasE2EE) {
      try {
        const cipherForRecipient = await encrypt(text, otherId);
        const cipherForSender = await encrypt(text, user.id);
        ciphertext = JSON.stringify({ r: cipherForRecipient, s: cipherForSender });
        encrypted = true;
      } catch {
        ciphertext = text;
        encrypted = false;
      }
    }

    // 3. Send to backend
    try {
      const msg = await apiPost<Message>(`/messages/${otherId}`, { body: ciphertext, encrypted });
      setDecryptedMessages((prev) => ({ ...prev, [msg.id]: text }));
      setMessages((prev) => {
        const hasTemp = prev.some((m) => m.id === tempId);
        if (hasTemp) return prev.map((m) => (m.id === tempId ? msg : m));
        const hasMsg = prev.some((m) => m.id === msg.id);
        if (hasMsg) return prev;
        return [...prev, msg];
      });
    } catch (e) {
      console.error("Message send failed:", e);
      // Rollback on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (sending || body.trim().length === 0) return;
    const text = body;
    setBody("");
    await sendMessage(text);
  };

  const attachMedia = async () => {
    if (sending || uploadingList.length > 0) return;

    // 1. Request media permissions
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        alert("Please allow photo & video access in Settings to attach media.");
      } else {
        alert("Photo access is needed to attach media to your messages.");
      }
      return;
    }

    // 2. Launch library picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    const isVideo =
      asset.type === "video" ||
      asset.mimeType?.startsWith("video/") ||
      /\.(mp4|mov|webm|m4v|mkv|3gp|avi)($|\?)/i.test(asset.fileName || asset.uri);

    const uploadId = `upload-${Date.now()}`;
    const newUpload: UploadingMedia = {
      id: uploadId,
      uri: asset.uri,
      mediaType: isVideo ? "video" : "image",
      progress: 6,
      fileName: asset.fileName || undefined,
      created_at: new Date().toISOString(),
    };

    // Add optimistic upload card immediately!
    setUploadingList((prev) => [...prev, newUpload]);

    // Scroll to bottom so upload card is immediately in view
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    const updateProgress = (pct: number) => {
      setUploadingList((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, progress: Math.min(99, Math.max(u.progress, pct)) } : u))
      );
    };

    // Smooth ticker ensures immediate responsive visual progress
    let simulatedPct = 6;
    const ticker = setInterval(() => {
      simulatedPct = Math.min(88, simulatedPct + Math.floor(Math.random() * 6) + 3);
      updateProgress(simulatedPct);
    }, 300);

    try {
      const token = await storage.secureGet(TOKEN_KEY, "");
      let publicUrl: string | null = null;
      let mediaKey: string | undefined = undefined;

      const ext = isVideo ? "mp4" : "jpg";
      const mime = asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
      const cleanFileName = asset.fileName
        ? asset.fileName.replace(/\.[^/.]+$/, "") + `.${ext}`
        : `media_${Date.now()}.${ext}`;

      // Method A: Direct multipart upload with live progress tracking
      try {
        const formData = new FormData();
        formData.append("file", {
          uri: asset.uri,
          name: cleanFileName,
          type: mime,
        } as any);

        const upData: any = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API}/storage/upload`);
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
              const real = Math.round((e.loaded / e.total) * 100);
              simulatedPct = Math.max(simulatedPct, real);
              updateProgress(real);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                resolve({ public_url: xhr.responseText });
              }
            } else {
              reject(new Error(`Status ${xhr.status}: ${xhr.responseText}`));
            }
          };
          xhr.onerror = () => reject(new Error("Network upload error"));
          xhr.ontimeout = () => reject(new Error("Upload timed out"));
          xhr.send(formData);
        });

        publicUrl = upData.public_url || upData.url;
      } catch (errDirect) {
        console.warn("Direct storage upload failed, attempting presigned fallback:", errDirect);
      }

      // Method B: Presigned storage upload fallback
      if (!publicUrl) {
        const { upload_url, public_url } = await apiPost<{ upload_url: string; public_url: string }>(
          "/storage/upload-url",
          { filename: cleanFileName, content_type: mime }
        );

        if (Platform.OS === "web") {
          const fileRes = await fetch(asset.uri);
          const blob = await fileRes.blob();
          await fetch(upload_url, {
            method: "PUT",
            headers: { "Content-Type": mime },
            body: blob,
          });
        } else {
          await FileSystem.uploadAsync(upload_url, asset.uri, {
            httpMethod: "PUT",
            headers: { "Content-Type": mime },
          });
        }

        publicUrl = public_url;
      }

      clearInterval(ticker);
      updateProgress(100);

      if (!publicUrl) {
        throw new Error("Could not obtain a public URL for the uploaded media.");
      }

      // Briefly display 100% completion before sending message
      await new Promise((r) => setTimeout(r, 200));
      setUploadingList((prev) => prev.filter((u) => u.id !== uploadId));

      // If E2EE is available, encrypt media key into payload
      if (hasE2EE) {
        try {
          mediaKey = generateMediaKey();
          await sendMessage(`[EMEDIA] ${publicUrl} ${mediaKey}`);
          return;
        } catch {
          // Fall through to standard media
        }
      }

      // Standard media message
      await sendMessage(`[MEDIA] ${publicUrl}`);
    } catch (e) {
      clearInterval(ticker);
      console.error("Media upload failed:", e);
      setUploadingList((prev) => prev.filter((u) => u.id !== uploadId));
      alert("Failed to upload media. Please try again.");
    }
  };

  const keyboardContainerStyle =
    Platform.OS === "android"
      ? { flex: 1, marginBottom: keyboardHeight }
      : { flex: 1 };

  // Combine confirmed messages with active pending upload cards
  const chatListData = useMemo<ChatListItem[]>(() => {
    const pendingAsMessages: ChatListItem[] = uploadingList.map((u) => ({
      id: u.id,
      sender_id: user?.id || "me",
      receiver_id: otherId,
      body: u.mediaType === "video" ? `[LOCAL_VIDEO] ${u.uri}` : `[LOCAL_IMAGE] ${u.uri}`,
      encrypted: false,
      read: false,
      created_at: u.created_at,
      isUploading: true,
      uploadProgress: u.progress,
      localUri: u.uri,
      mediaType: u.mediaType,
    }));

    return [...messages, ...pendingAsMessages].reverse();
  }, [messages, uploadingList, user?.id, otherId]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            testID="chat-back-button"
            onPress={() => router.back()}
            hitSlop={12}
            style={{ padding: 4 }}
          >
            <Icon name="chevron-back" color={colors.ink} size={24} />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {otherUser?.avatar_url ? (
              <Image
                source={{ uri: otherUser.avatar_url }}
                style={{ width: 36, height: 36, borderRadius: 18 }}
              />
            ) : (
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="person" color={colors.muted} size={18} />
              </View>
            )}
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink }}>
              {otherUser?.name || name || "Chat"}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {hasE2EE && (
            <View style={{ marginRight: 8 }}>
              <Icon name="lock-closed" color={colors.muted} size={14} />
            </View>
          )}
        </View>
      </View>

      {/* Main Content & Input with Android + iOS Keyboard Resilience */}
      <KeyboardAvoidingView
        style={keyboardContainerStyle}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.red} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatListData}
            keyExtractor={(item) => item.id}
            inverted={true}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
              // 1. Live Uploading Card (with Progress Bar & Percentage)
              if (item.isUploading) {
                return (
                  <View
                    style={{
                      alignSelf: "flex-end",
                      backgroundColor: colors.ink,
                      paddingHorizontal: 4,
                      paddingVertical: 4,
                      borderRadius: 20,
                      borderBottomRightRadius: 4,
                      maxWidth: "80%",
                      marginBottom: 8,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.05,
                      shadowRadius: 2,
                      elevation: 1,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: 220,
                        height: 220,
                        borderRadius: 16,
                        overflow: "hidden",
                        backgroundColor: "#0f172a",
                      }}
                    >
                      {item.mediaType === "video" ? (
                        Platform.OS === "web" ? (
                          <video
                            src={item.localUri}
                            preload="auto"
                            muted
                            playsInline
                            onLoadedData={(e) => {
                              try {
                                (e.currentTarget as HTMLVideoElement).currentTime = 0.001;
                              } catch {}
                            }}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              pointerEvents: "none",
                              backgroundColor: "#0f172a",
                            }}
                          />
                        ) : (
                          <NativeVideoThumbnail uri={item.localUri || ""} />
                        )
                      ) : (
                        <Image
                          source={{ uri: item.localUri }}
                          style={StyleSheet.absoluteFillObject}
                          contentFit="cover"
                        />
                      )}

                      {/* Translucent overlay with progress */}
                      <View
                        style={[
                          StyleSheet.absoluteFillObject,
                          {
                            backgroundColor: "rgba(0,0,0,0.65)",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 16,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            backgroundColor: "rgba(255,255,255,0.15)",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: 10,
                          }}
                        >
                          <Icon
                            name={item.mediaType === "video" ? "videocam" : "image"}
                            color="#fff"
                            size={24}
                          />
                        </View>

                        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700", marginBottom: 8 }}>
                          Uploading {item.uploadProgress}%
                        </Text>

                        {/* Progress Bar Track & Fill */}
                        <View
                          style={{
                            width: 140,
                            height: 6,
                            backgroundColor: "rgba(255,255,255,0.25)",
                            borderRadius: 3,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              width: `${Math.max(5, item.uploadProgress || 0)}%`,
                              height: "100%",
                              backgroundColor: "#3B82F6",
                              borderRadius: 3,
                            }}
                          />
                        </View>
                      </View>
                    </View>

                    {/* Footer with Timestamp and Clock Status Tick */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        marginTop: 4,
                        marginRight: 8,
                        alignSelf: "flex-end",
                      }}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10 }}>
                        {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                      <Icon name="time-outline" color="rgba(255,255,255,0.6)" size={13} />
                    </View>
                  </View>
                );
              }

              // 2. Standard Message (Text, Image, or Video)
              const isMine =
                !!user?.id &&
                String(item.sender_id || "").toLowerCase().trim() === String(user.id || "").toLowerCase().trim();
              const isTemp = item.id.startsWith("temp-");
              const dec = item.encrypted ? decryptedMessages[item.id] || "🔒 Decrypting..." : item.body;

              const isEncMedia = dec.startsWith("[EMEDIA] ");
              const isLegacyMedia = dec.startsWith("[MEDIA] ");
              const isMedia = isEncMedia || isLegacyMedia;
              let mediaUrl: string | null = null;
              let mediaKey: string | undefined = undefined;

              if (isEncMedia) {
                const parts = dec.substring(9).split(" ");
                mediaUrl = parts[0];
                mediaKey = parts[1];
              } else if (isLegacyMedia) {
                mediaUrl = dec.substring(8);
              }

              const isVideo = isMedia && isVideoMedia(mediaUrl || "");

              return (
                <View
                  style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    backgroundColor: isMine ? colors.ink : colors.surface,
                    borderWidth: isMine ? 0 : 1,
                    borderColor: colors.line,
                    paddingHorizontal: isMedia ? 4 : 16,
                    paddingVertical: isMedia ? 4 : 12,
                    borderRadius: 20,
                    borderBottomRightRadius: isMine ? 4 : 20,
                    borderBottomLeftRadius: isMine ? 20 : 4,
                    maxWidth: "80%",
                    marginBottom: 8,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                    elevation: 1,
                    overflow: "hidden",
                  }}
                >
                  {isMedia ? (
                    <CachedImage
                      url={mediaUrl as string}
                      style={{ width: 220, height: 220, borderRadius: 16 }}
                      contentFit="cover"
                      mediaKey={mediaKey}
                      isVideo={isVideo}
                      onPress={(resolved) => {
                        if (isVideo) {
                          setFullscreenVideo(resolved);
                        } else {
                          setFullscreenImage(resolved);
                        }
                      }}
                    />
                  ) : (
                    <Text style={{ color: isMine ? "#fff" : colors.ink, fontSize: 15, lineHeight: 20 }}>{dec}</Text>
                  )}

                  {/* Message Footer with Timestamp and Status Tick Indicator */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 4,
                      marginRight: isMedia ? 8 : 0,
                      alignSelf: "flex-end",
                    }}
                  >
                    <Text style={{ color: isMine ? "rgba(255,255,255,0.7)" : colors.muted, fontSize: 10 }}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {isMine && (
                      <Icon
                        name={isTemp ? "time-outline" : item.read ? "checkmark-done" : "checkmark"}
                        color={isTemp ? "rgba(255,255,255,0.5)" : item.read ? "#4ADE80" : "rgba(255,255,255,0.7)"}
                        size={13}
                      />
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Bottom Input Row */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.surface,
            alignItems: "center",
          }}
        >
          {/* Paperclip Media Button */}
          <Pressable
            testID="chat-attach-button"
            onPress={attachMedia}
            disabled={sending || uploadingList.length > 0}
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: sending || uploadingList.length > 0 ? 0.5 : 1,
            }}
          >
            <Icon name="attach" color={colors.ink} size={26} />
          </Pressable>

          {/* Text Input Pill */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.paper,
              borderRadius: 24,
              minHeight: 44,
              paddingHorizontal: 16,
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <TextInput
              testID="chat-input"
              style={
                {
                  flex: 1,
                  margin: 0,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: colors.ink,
                  outlineStyle: "none",
                } as any
              }
              placeholder="Type a message..."
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={1000}
            />
          </View>

          {/* Send Button */}
          <Pressable
            testID="chat-send-button"
            onPress={send}
            disabled={body.trim().length === 0 || sending}
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: body.trim().length > 0 ? colors.ink : colors.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ marginLeft: 3 }}>
                <Icon name="send" color={body.trim().length > 0 ? "#fff" : colors.muted} size={18} />
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen Image Viewer Modal */}
      <Modal
        visible={!!fullscreenImage}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" }}>
          <Pressable
            onPress={() => setFullscreenImage(null)}
            hitSlop={16}
            style={{
              position: "absolute",
              top: Platform.OS === "ios" ? 54 : 36,
              right: 20,
              zIndex: 50,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" color="#fff" size={24} />
          </Pressable>
          {fullscreenImage && (
            <Image
              source={{ uri: fullscreenImage }}
              style={{ width: "90%", height: "75%", borderRadius: 8 }}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>

      {/* Fullscreen Video Player Modal */}
      <ChatVideoModal
        videoUrl={fullscreenVideo}
        onClose={() => setFullscreenVideo(null)}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.paper },
    header: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
  });
