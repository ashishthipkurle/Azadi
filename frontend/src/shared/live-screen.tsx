/**
 * Shared Full-Screen Live Stream Viewer.
 * Used by both (reader)/live/[room].tsx and (reporter)/live/[room].tsx.
 * Provides the immersive live-streaming experience matching the Azadi live UI design:
 * - Top brand header (azadi⁺, menu, search, notification badge)
 * - Live stream overlay with LIVE badge, 👁 viewer counter, and close button
 * - Real-time floating live chat overlay on lower left
 * - Vertical action rail on right (bookmark, comment, heart with floating animation, share)
 * - Bottom interaction bar with "Add a comment..." pill input, Home, chat badge, and share.
 */
import type { RemoteVideoTrack, TrackPublication, Participant } from "livekit-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { apiPost, ApiError } from "@/src/api";
import { LiveStage } from "@/src/live-stage";
import { subscribeLive, type LiveConnection } from "@/src/livekit";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon, Toast } from "@/src/ui";

type ChatItem = {
  id: string;
  sender: string;
  text: string;
  avatarColor: string;
  badge?: string;
  timestamp: number;
};

type FloatingHeart = {
  id: string;
  anim: Animated.Value;
  xOffset: number;
  color: string;
  size: number;
};

const AVATAR_COLORS = ["#FF5722", "#4CAF50", "#2196F3", "#9C27B0", "#E91E63", "#00BCD4", "#FF9800"];
const HEART_COLORS = ["#FF2D55", "#FF3B30", "#FF6482", "#FF9500", "#FF2D55"];

const INITIAL_MESSAGES: ChatItem[] = [
  {
    id: "init-1",
    sender: "aaditeecinas",
    badge: "VIP",
    text: "Ground report is incredible! Stay safe out there 👏",
    avatarColor: "#FF5722",
    timestamp: Date.now() - 30000,
  },
  {
    id: "init-2",
    sender: "baalsnay",
    text: "baalsnay td good uio 😍😍",
    avatarColor: "#2196F3",
    timestamp: Date.now() - 20000,
  },
  {
    id: "init-3",
    sender: "kavita_news",
    badge: "PRESS",
    text: "Can you show the gathering on the left? ❤️❤️",
    avatarColor: "#E91E63",
    timestamp: Date.now() - 10000,
  },
];

export default function LiveRoomScreen({ routePrefix = "/(reader)" }: { routePrefix?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { room, title, reporter } = useLocalSearchParams<{ room: string; title?: string; reporter?: string }>();

  const [track, setTrack] = useState<RemoteVideoTrack | null>(null);
  const [status, setStatus] = useState<"connecting" | "waiting" | "live" | "ended" | "error">("connecting");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const [viewers, setViewers] = useState<number>(3300);
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>(INITIAL_MESSAGES);
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(1280);
  const [bookmarked, setBookmarked] = useState(false);
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);

  const disconnectRef = useRef<null | (() => Promise<void>)>(null);
  const chatListRef = useRef<FlatList>(null);

  // LiveKit room connection
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const tokenResp = await apiPost<{ token: string; url: string }>("/live/viewer-token", { room });
        if (cancelled) return;
        const conn = await subscribeLive({ url: tokenResp.url, token: tokenResp.token });
        if (cancelled) {
          await conn.disconnect();
          return;
        }
        setConnection(conn);
        setStatus("waiting");
        if (conn.room.numParticipants > 1) {
          setViewers(conn.room.numParticipants * 150 + Math.floor(Math.random() * 200));
        }

        const onTrackSubscribed = (t: any, _pub: TrackPublication, _p: Participant) => {
          if (t.kind === "video") {
            setTrack(t);
            setStatus("live");
          }
        };
        const onTrackUnsubscribed = (t: any) => {
          if (t.kind === "video") {
            setTrack(null);
            setStatus("waiting");
          }
        };
        const onParticipant = () => {
          setViewers((prev) => Math.max(prev, conn.room.numParticipants * 150));
        };
        const onDisconnected = () => setStatus("ended");

        // Handle data channel chat messages & likes
        const onDataReceived = (payload: Uint8Array, participant?: Participant) => {
          try {
            const decoder = new TextDecoder();
            const text = decoder.decode(payload);
            const data = JSON.parse(text);
            if (data.type === "chat") {
              const senderName = participant?.name || participant?.identity || "Viewer";
              const newMsg: ChatItem = {
                id: Math.random().toString(36).substring(7),
                sender: senderName,
                text: data.text,
                avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev.slice(-30), newMsg]);
            } else if (data.type === "like") {
              spawnFloatingHeart();
              setLikeCount((c) => c + 1);
            }
          } catch (e) {
            console.error("Failed to parse live event", e);
          }
        };

        // Attach any already-published video track
        conn.room.remoteParticipants.forEach((rp) => {
          rp.videoTrackPublications.forEach((pub) => {
            if (pub.track) {
              setTrack(pub.track as RemoteVideoTrack);
              setStatus("live");
            }
          });
        });

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const lk = require("livekit-client");
        conn.room
          .on(lk.RoomEvent.TrackSubscribed, onTrackSubscribed)
          .on(lk.RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
          .on(lk.RoomEvent.ParticipantConnected, onParticipant)
          .on(lk.RoomEvent.ParticipantDisconnected, onParticipant)
          .on(lk.RoomEvent.Disconnected, onDisconnected)
          .on(lk.RoomEvent.DataReceived, onDataReceived);

        disconnectRef.current = conn.disconnect;
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        const message =
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not join the live room.";
        setToast({ message, tone: e instanceof ApiError && e.status === 503 ? "info" : "error" });
      }
    };
    start();
    return () => {
      cancelled = true;
      if (disconnectRef.current) disconnectRef.current().catch(() => {});
    };
  }, [room]);

  const leave = async () => {
    if (disconnectRef.current) await disconnectRef.current();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`${routePrefix}/(tabs)` as any);
    }
  };

  const spawnFloatingHeart = () => {
    const anim = new Animated.Value(0);
    const id = Math.random().toString(36).substring(7);
    const heart: FloatingHeart = {
      id,
      anim,
      xOffset: (Math.random() - 0.5) * 50,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
      size: 24 + Math.random() * 12,
    };

    setFloatingHearts((prev) => [...prev, heart]);

    Animated.timing(anim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== id));
    });
  };

  const handleLike = async () => {
    setLiked(true);
    setLikeCount((c) => c + 1);
    spawnFloatingHeart();

    if (connection?.room) {
      try {
        const msg = { type: "like" };
        const encoder = new TextEncoder();
        const payload = encoder.encode(JSON.stringify(msg));
        await connection.room.localParticipant.publishData(payload, { reliable: false });
      } catch {
        /* best-effort */
      }
    }
  };

  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    setCommentText("");

    const newMsg: ChatItem = {
      id: Math.random().toString(36).substring(7),
      sender: user?.name || "Me",
      text,
      avatarColor: colors.red,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMsg]);

    if (connection?.room) {
      try {
        const msg = { type: "chat", text };
        const encoder = new TextEncoder();
        const payload = encoder.encode(JSON.stringify(msg));
        await connection.room.localParticipant.publishData(payload, { reliable: true });
      } catch (e) {
        console.error("Failed to broadcast chat", e);
      }
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Watch ${reporter || "Azadi"}'s live stream "${title || "Field Report"}" on Azadi!`,
        title: title || "Live Broadcast",
      });
    } catch {
      /* ignore */
    }
  };

  const formatViewers = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* 1. Top Brand Header */}
      <View style={styles.topHeader}>
        <Pressable onPress={() => router.push(`${routePrefix}/(tabs)` as any)} hitSlop={12} style={styles.headerIconBtn}>
          <Icon name="menu-outline" color="#FFFFFF" size={24} />
        </Pressable>

        <View style={styles.brandTitleWrap}>
          <Text style={styles.brandWordmark}>azadi</Text>
          <Text style={styles.brandPlus}>⁺</Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable onPress={() => router.push(`${routePrefix}/search` as any)} hitSlop={12} style={styles.headerIconBtn}>
            <Icon name="search-outline" color="#FFFFFF" size={22} />
          </Pressable>
          <Pressable onPress={() => router.push(`${routePrefix}/notifications` as any)} hitSlop={12} style={styles.headerIconBtn}>
            <View>
              <Icon name="notifications-outline" color="#FFFFFF" size={22} />
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>1</Text>
              </View>
            </View>
          </Pressable>
        </View>
      </View>

      {/* 2. Main Video Stream Viewport */}
      <View style={styles.videoStageContainer}>
        {status === "connecting" ? (
          <View style={styles.centerStatus}>
            <ActivityIndicator color={colors.red} size="large" />
            <Text style={styles.centerStatusText}>Connecting to field feed…</Text>
          </View>
        ) : status === "waiting" ? (
          <View style={styles.centerStatus}>
            <View style={styles.pulseRadio}>
              <Icon name="radio" color={colors.red} size={36} />
            </View>
            <Text style={styles.centerStatusTitle}>{title || "Field Broadcast"}</Text>
            <Text style={styles.centerStatusText}>
              Waiting for {reporter || "the reporter"} to broadcast video track.
            </Text>
          </View>
        ) : status === "ended" || status === "error" ? (
          <View style={styles.centerStatus}>
            <Icon name="close-circle-outline" color={colors.red} size={48} />
            <Text style={styles.centerStatusTitle}>
              {status === "ended" ? "Broadcast has ended" : "Unable to reach stream"}
            </Text>
            <Pressable onPress={leave} style={styles.returnBtn}>
              <Text style={styles.returnBtnText}>Return to feed</Text>
            </Pressable>
          </View>
        ) : (
          <LiveStage track={track} fill showBadge={false} />
        )}

        {/* Top Video Overlay: LIVE pill + 👁 Viewers + Close ✕ */}
        <View style={styles.streamTopOverlay} pointerEvents="box-none">
          <View style={styles.badgesGroup}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <View style={styles.viewerBadge}>
              <Icon name="eye-outline" color="#FFFFFF" size={13} />
              <Text style={styles.viewerBadgeText}>{formatViewers(viewers)}</Text>
            </View>
          </View>

          <Pressable testID="live-close-button" onPress={leave} hitSlop={14} style={styles.closeBtn}>
            <Icon name="close" color="#FFFFFF" size={20} />
          </Pressable>
        </View>

        {/* Stream Reporter & Title Kicker (Top Left overlay) */}
        {title ? (
          <View style={styles.streamTitleOverlay} pointerEvents="none">
            <Text style={styles.streamHeadline} numberOfLines={1}>{title}</Text>
            {reporter && <Text style={styles.streamReporter} numberOfLines={1}>@{reporter}</Text>}
          </View>
        ) : null}

        {/* 3. Floating Live Chat (Lower Left overlay) */}
        <View style={styles.chatOverlay} pointerEvents="box-none">
          <FlatList
            ref={chatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <View style={styles.chatBubble}>
                <View style={[styles.chatAvatar, { backgroundColor: item.avatarColor }]}>
                  <Text style={styles.chatAvatarLetter}>{item.sender.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.chatTextWrap}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.chatSender}>@{item.sender}</Text>
                    {item.badge && (
                      <View style={styles.chatBadge}>
                        <Text style={styles.chatBadgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.chatMessage}>{item.text}</Text>
                </View>
              </View>
            )}
          />
        </View>

        {/* 4. Right Vertical Action Rail */}
        <View style={styles.actionRail} pointerEvents="box-none">
          <Pressable onPress={() => setBookmarked((b) => !b)} style={styles.railBtn}>
            <Icon name={bookmarked ? "bookmark" : "bookmark-outline"} color="#FFFFFF" size={26} />
          </Pressable>

          <Pressable onPress={() => chatListRef.current?.scrollToEnd({ animated: true })} style={styles.railBtn}>
            <Icon name="chatbubble-outline" color="#FFFFFF" size={26} />
          </Pressable>

          <Pressable onPress={handleLike} style={styles.railBtn}>
            <Icon name={liked ? "heart" : "heart-outline"} color={liked ? "#FF2D55" : "#FFFFFF"} size={28} />
            <Text style={styles.railCountText}>{likeCount >= 1000 ? `${(likeCount / 1000).toFixed(1)}k` : likeCount}</Text>
          </Pressable>

          <Pressable onPress={handleShare} style={styles.railBtn}>
            <Icon name="arrow-redo-outline" color="#FFFFFF" size={28} />
          </Pressable>

          <Pressable onPress={handleLike} style={styles.railHeartBtn}>
            <Icon name="heart" color="#FF2D55" size={22} />
          </Pressable>
        </View>

        {/* Floating Hearts Animation Canvas */}
        <View style={styles.floatingHeartsCanvas} pointerEvents="none">
          {floatingHearts.map((heart) => {
            const translateY = heart.anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -260],
            });
            const opacity = heart.anim.interpolate({
              inputRange: [0, 0.2, 0.8, 1],
              outputRange: [0, 1, 0.9, 0],
            });
            const scale = heart.anim.interpolate({
              inputRange: [0, 0.3, 1],
              outputRange: [0.6, 1.2, 1],
            });

            return (
              <Animated.View
                key={heart.id}
                style={[
                  styles.floatingHeartItem,
                  {
                    transform: [{ translateY }, { translateX: heart.xOffset }, { scale }],
                    opacity,
                  },
                ]}
              >
                <Icon name="heart" color={heart.color} size={heart.size} />
              </Animated.View>
            );
          })}
        </View>
      </View>

      {/* 5. Bottom Interactive Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
      >
        <View style={styles.bottomBar}>
          <Pressable
            onPress={() => router.push(`${routePrefix}/(tabs)` as any)}
            style={styles.homeBtn}
          >
            <Icon name="home-outline" color="#FFFFFF" size={22} />
            <Text style={styles.homeBtnText}>Home</Text>
          </Pressable>

          <View style={styles.commentInputWrap}>
            <TextInput
              testID="live-comment-input"
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment..."
              placeholderTextColor="#A0A0A0"
              style={styles.commentInput}
              onSubmitEditing={handleSendComment}
              returnKeyType="send"
            />
            {commentText.trim().length > 0 && (
              <Pressable onPress={handleSendComment} style={styles.sendBtn}>
                <Icon name="arrow-up-circle" color={colors.red} size={26} />
              </Pressable>
            )}
          </View>

          <Pressable style={styles.bottomIconBtn}>
            <View>
              <Icon name="chatbox-ellipses-outline" color="#FFFFFF" size={24} />
              <View style={styles.messageBadge}>
                <Text style={styles.messageBadgeText}>99</Text>
              </View>
            </View>
            <Text style={styles.bottomIconLabel}>Messages</Text>
          </Pressable>

          <Pressable onPress={handleShare} style={styles.bottomIconBtn}>
            <Icon name="paper-plane-outline" color="#FFFFFF" size={22} />
            <Text style={styles.bottomIconLabel}>Share</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: "#000000",
    },
    topHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: "#000000",
      zIndex: 20,
    },
    headerIconBtn: {
      padding: 6,
    },
    brandTitleWrap: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    brandWordmark: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.8,
      fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    },
    brandPlus: {
      color: "#E50914",
      fontSize: 16,
      fontWeight: "900",
      marginLeft: 2,
      marginTop: -2,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    notifBadge: {
      position: "absolute",
      top: -3,
      right: -4,
      backgroundColor: "#E50914",
      borderRadius: 7,
      minWidth: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    notifBadgeText: {
      color: "#FFFFFF",
      fontSize: 9,
      fontWeight: "bold",
    },
    videoStageContainer: {
      flex: 1,
      backgroundColor: "#0F1115",
      position: "relative",
      overflow: "hidden",
    },
    centerStatus: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 12,
    },
    pulseRadio: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(229, 9, 20, 0.15)",
      borderWidth: 1.5,
      borderColor: "rgba(229, 9, 20, 0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    centerStatusTitle: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
    },
    centerStatusText: {
      color: "#8E9AA0",
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
      maxWidth: 280,
    },
    returnBtn: {
      marginTop: 10,
      backgroundColor: "rgba(255,255,255,0.12)",
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
    },
    returnBtnText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    streamTopOverlay: {
      position: "absolute",
      top: 14,
      left: 14,
      right: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      zIndex: 15,
    },
    badgesGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    liveBadge: {
      backgroundColor: "#E50914",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    liveBadgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    viewerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: "rgba(255, 255, 255, 0.15)",
    },
    viewerBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    streamTitleOverlay: {
      position: "absolute",
      top: 54,
      left: 14,
      right: 80,
      zIndex: 12,
    },
    streamHeadline: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "700",
      textShadowColor: "rgba(0,0,0,0.8)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    streamReporter: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 12,
      marginTop: 2,
      textShadowColor: "rgba(0,0,0,0.8)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    chatOverlay: {
      position: "absolute",
      left: 14,
      right: 76,
      bottom: 12,
      maxHeight: 220,
      zIndex: 10,
    },
    chatBubble: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8,
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      alignSelf: "flex-start",
      maxWidth: "92%",
    },
    chatAvatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    chatAvatarLetter: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },
    chatTextWrap: {
      flexShrink: 1,
    },
    chatSender: {
      color: "#64B5F6",
      fontSize: 12,
      fontWeight: "700",
    },
    chatBadge: {
      backgroundColor: "#E50914",
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 3,
    },
    chatBadgeText: {
      color: "#FFFFFF",
      fontSize: 8,
      fontWeight: "900",
    },
    chatMessage: {
      color: "#FFFFFF",
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "500",
    },
    actionRail: {
      position: "absolute",
      right: 12,
      bottom: 20,
      alignItems: "center",
      gap: 18,
      zIndex: 12,
    },
    railBtn: {
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    railCountText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    railHeartBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    floatingHeartsCanvas: {
      position: "absolute",
      right: 16,
      bottom: 60,
      width: 60,
      height: 280,
      zIndex: 14,
    },
    floatingHeartItem: {
      position: "absolute",
      bottom: 0,
      right: 10,
    },
    bottomBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: "#000000",
      gap: 10,
    },
    homeBtn: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    homeBtnText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "600",
      marginTop: 2,
    },
    commentInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
      paddingHorizontal: 14,
      height: 40,
    },
    commentInput: {
      flex: 1,
      color: "#FFFFFF",
      fontSize: 13,
      paddingVertical: 6,
    },
    sendBtn: {
      paddingLeft: 6,
    },
    bottomIconBtn: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    bottomIconLabel: {
      color: "#8E9AA0",
      fontSize: 9,
      fontWeight: "600",
      marginTop: 2,
    },
    messageBadge: {
      position: "absolute",
      top: -4,
      right: -6,
      backgroundColor: "#E50914",
      borderRadius: 8,
      paddingHorizontal: 4,
      paddingVertical: 1,
      minWidth: 16,
      alignItems: "center",
    },
    messageBadgeText: {
      color: "#FFFFFF",
      fontSize: 9,
      fontWeight: "bold",
    },
  });
