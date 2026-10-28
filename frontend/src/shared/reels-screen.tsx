/**
 * Shared Video/Reels screen.
 * Used by both (reporter)/(tabs)/video.tsx and (reader)/(tabs)/reels.tsx.
 * The only difference is the live stream route path.
 */
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  LayoutChangeEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiGet } from "@/src/api";
import { useTheme } from "@/src/hooks/use-theme";
import { MediaPlayer } from "@/src/media-player";
import { sharePost } from "@/src/share";
import { ReelsCommentModal } from "@/src/shared/reels-comment-modal";
import { Icon, Toast } from "@/src/ui";
import { storage } from "@/src/utils/storage";
import {
  useAppDispatch,
  useAppSelector,
  hydratePostsInteractions,
  toggleLikeWithBatchBuffer,
} from "@/src/store";

export type Post = {
  id: string;
  title: string;
  body: string;
  kind: string;
  created_at: string;
  reporter_id: string;
  reporter_name: string;
  reporter_verified: boolean;
  media: any[];
  stats?: string;
  comment_count?: number;
};

export type LiveSession = {
  room: string;
  reporter_id: string;
  reporter_name: string;
  title: string;
};

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let targetReelPost: Post | null = null;

export function prepareReelTransition(post: any) {
  if (!post) {
    targetReelPost = null;
    return;
  }
  let mediaArr = post.media;
  if (typeof mediaArr === "string") {
    try {
      mediaArr = JSON.parse(mediaArr);
    } catch {
      mediaArr = [];
    }
  }
  targetReelPost = {
    ...post,
    media: Array.isArray(mediaArr) ? mediaArr : [],
  };
}

export default function ReelsScreen({ routePrefix }: { routePrefix: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { initialPostId, navTimestamp } = useLocalSearchParams<{ initialPostId?: string; navTimestamp?: string }>();
  const flatListRef = useRef<FlatList>(null);
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Dynamically measure container height so reels fit 100% of visible screen with 0px gap across all devices
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const fallbackReelHeight = windowHeight - (52 + Math.max(insets.bottom, Platform.OS === "ios" ? 18 : 6));
  const reelHeight = containerHeight > 0 ? containerHeight : fallbackReelHeight;

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    if (height > 0 && Math.abs(height - containerHeight) > 1) {
      setContainerHeight(height);
    }
  }, [containerHeight]);

  const [posts, setPosts] = useState<Post[]>(() => {
    if (initialPostId && targetReelPost && targetReelPost.id === initialPostId) {
      return [targetReelPost];
    }
    return [];
  });
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"videos" | "live">("videos");

  // Track active visible post for single-item playback
  const [visiblePostId, setVisiblePostId] = useState<string | null>(initialPostId || null);
  const [listResetKey, setListResetKey] = useState<number>(0);

  // Synchronously adjust state during render if a new reel navigation happened (instant, zero delay, no old video)
  const [lastNavKey, setLastNavKey] = useState<string | undefined>(undefined);
  const currentNavKey = initialPostId ? `${initialPostId}_${navTimestamp || ""}` : undefined;

  if (currentNavKey && currentNavKey !== lastNavKey) {
    setLastNavKey(currentNavKey);
    setListResetKey((k) => k + 1);

    const target = (targetReelPost && targetReelPost.id === initialPostId)
      ? targetReelPost
      : posts.find((p) => p.id === initialPostId);

    if (target) {
      const others = posts.filter((p) => p.id !== target.id);
      setPosts([target, ...others]);
      setVisiblePostId(target.id);
      if (activeTab !== "videos") setActiveTab("videos");
    } else {
      setVisiblePostId(initialPostId || null);
      if (activeTab !== "videos") setActiveTab("videos");
    }
  }

  // Track document visibility on web (switching browser tabs / window minimize)
  const [isDocVisible, setIsDocVisible] = useState(true);

  // Likes & Comments interaction state managed via Redux
  const dispatch = useAppDispatch();
  const interactions = useAppSelector((state) => state.interactions.posts);
  const [activeCommentPost, setActiveCommentPost] = useState<Post | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);

  // Web tab/window visibility listener
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const handleVisChange = () => {
      setIsDocVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisChange);
    return () => document.removeEventListener("visibilitychange", handleVisChange);
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, live] = await Promise.all([
        apiGet<Post[]>(`/feed?kind=video`).catch(() => [] as Post[]),
        apiGet<LiveSession[]>("/live/sessions").catch(() => [] as LiveSession[]),
      ]);
      const rawPosts = p || [];
      const parsedPosts = rawPosts.map((item) => {
        let mediaArr = item.media;
        if (typeof mediaArr === "string") {
          try {
            mediaArr = JSON.parse(mediaArr);
          } catch {
            mediaArr = [];
          }
        }
        return { ...item, media: Array.isArray(mediaArr) ? mediaArr : [] };
      });
      let videoPosts = parsedPosts.filter((item) => {
        return item.kind === "video" || item.media.some((m: any) => m.kind === "video" || m.playback_id);
      });

      // If initialPostId is specified, locate or fetch it
      let targetPost: Post | null = (targetReelPost && targetReelPost.id === initialPostId) ? targetReelPost : null;
      if (initialPostId && !targetPost) {
        targetPost = videoPosts.find((item) => item.id === initialPostId) || null;
        if (!targetPost) {
          try {
            const single = await apiGet<Post>(`/posts/${initialPostId}`);
            if (single) {
              let mediaArr = single.media;
              if (typeof mediaArr === "string") {
                try { mediaArr = JSON.parse(mediaArr); } catch { mediaArr = []; }
              }
              targetPost = { ...single, media: Array.isArray(mediaArr) ? mediaArr : [] };
            }
          } catch {}
        }
      }

      let finalOrderedPosts: Post[] = [];
      if (targetPost) {
        // The clicked video is ALWAYS the first video (index 0)
        const others = shuffleArray(videoPosts.filter((p) => p.id !== targetPost!.id));
        finalOrderedPosts = [targetPost, ...others];
      } else {
        // When opening the reels page directly, randomize the video order completely
        finalOrderedPosts = shuffleArray(videoPosts);
      }

      setPosts(finalOrderedPosts);
      dispatch(hydratePostsInteractions(finalOrderedPosts));
      setLiveSessions(live);

      // Preserve currently playing video or set to first video
      if (finalOrderedPosts.length > 0) {
        setVisiblePostId((current) => current || finalOrderedPosts[0].id);
      }
    } catch {
      // quiet fail
    } finally {
      setLoading(false);
    }
  }, [initialPostId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ensure visiblePostId is initialized if not set yet
  useEffect(() => {
    if (activeTab === "videos" && !visiblePostId && posts.length > 0) {
      setVisiblePostId(posts[0].id);
    }
  }, [activeTab, posts, visiblePostId]);

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: 60,
      },
      onViewableItemsChanged: ({ viewableItems }: any) => {
        if (viewableItems && viewableItems.length > 0) {
          const primary = viewableItems[0]?.item;
          if (primary?.id) {
            setVisiblePostId(primary.id);
          }
        }
      },
    },
  ]);

  // Toggle Like with instant optimistic UI + 2-second debounced batch dispatch
  const toggleLike = (post: Post) => {
    dispatch(toggleLikeWithBatchBuffer(post.id));
  };

  // Share handler
  const handleShare = async (post: Post) => {
    const res = await sharePost({
      id: post.id,
      title: post.title,
      reporter_name: post.reporter_name,
    });
    if (res.method === "clipboard") {
      setToast({ message: "Link copied to clipboard!", tone: "success" });
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    if (activeTab === "live") {
      const live = item as LiveSession;
      return (
        <View style={[styles.reelContainer, { height: reelHeight, width: "100%" }]}>
          <View style={[styles.videoPlaceholder, { backgroundColor: "#220000" }]}>
            <Icon name="radio" color={colors.red} size={64} />
            <Text style={[styles.videoTitle, { textAlign: "center", fontSize: 22, marginTop: 20 }]}>
              {live.title}
            </Text>
            <Text style={[styles.videoBody, { textAlign: "center" }]}>{live.reporter_name}</Text>
            <Pressable
              style={[styles.liveButton, { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12 }]}
              onPress={() =>
                router.push({
                  pathname: `${routePrefix}/live/[room]` as any,
                  params: { room: live.room, title: live.title, reporter: live.reporter_name },
                })
              }
            >
              <Text style={[styles.liveButtonText, { fontSize: 16 }]}>Watch Live Stream</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    const post = item as Post;
    let mediaArr = post.media;
    if (typeof mediaArr === "string") {
      try {
        mediaArr = JSON.parse(mediaArr);
      } catch {
        mediaArr = [];
      }
    }
    const media = Array.isArray(mediaArr) && mediaArr.length > 0 ? mediaArr[0] : null;

    // Check if this reel item should be playing
    const isCurrentActive = visiblePostId === post.id;
    const shouldPlay = isFocused && isDocVisible && isCurrentActive && activeTab === "videos";

    const postInteraction = interactions[post.id];
    const isLiked = postInteraction ? postInteraction.liked : !!(post as any).liked;
    const likeCount = postInteraction ? postInteraction.likeCount : ((post as any).like_count ?? 0);
    const commentCount = postInteraction ? postInteraction.commentCount : ((post as any).comment_count ?? 0);

    return (
      <View style={[styles.reelContainer, { height: reelHeight, width: "100%" }]}>
        {media ? (
          <View style={StyleSheet.absoluteFillObject}>
            <MediaPlayer media={media} radius={0} fill paused={!shouldPlay} resetOnPause={true} showPlayPauseOverlay={false} />
          </View>
        ) : (
          <View style={styles.videoPlaceholder}>
            <Icon name="film-outline" color="#555" size={48} />
          </View>
        )}

        {/* Bottom Details Overlay */}
        <View style={styles.overlayBottom} pointerEvents="box-none">
          <Text style={styles.reporterName}>@{post.reporter_name}</Text>
          <Text style={styles.videoTitle} numberOfLines={2}>
            {post.title}
          </Text>
          {post.body && post.body !== post.title && (
            <Text style={styles.videoBody} numberOfLines={2}>
              {post.body}
            </Text>
          )}
        </View>

        {/* Right Interaction Bar */}
        <View style={styles.overlayRight} pointerEvents="box-none">
          {/* Like Button */}
          <Pressable style={styles.actionButton} onPress={() => toggleLike(post)} hitSlop={10}>
            <View style={styles.actionIconCircle}>
              <Icon
                name={isLiked ? "heart" : "heart-outline"}
                color={isLiked ? "#ff2b54" : "#fff"}
                size={28}
              />
            </View>
            <Text style={[styles.actionText, isLiked && styles.actionTextLiked]}>
              {likeCount > 0 ? likeCount : "Like"}
            </Text>
          </Pressable>

          {/* Comment Button */}
          <Pressable
            style={styles.actionButton}
            onPress={() => setActiveCommentPost(post)}
            hitSlop={10}
          >
            <View style={styles.actionIconCircle}>
              <Icon name="chatbubble-outline" color="#fff" size={26} />
            </View>
            <Text style={styles.actionText}>
              {commentCount > 0 ? commentCount : "Comment"}
            </Text>
          </Pressable>

          {/* Send / Share Button */}
          <Pressable style={styles.actionButton} onPress={() => handleShare(post)} hitSlop={10}>
            <View style={styles.actionIconCircle}>
              <Icon name="arrow-redo-outline" color="#fff" size={27} />
            </View>
            <Text style={styles.actionText}>Send</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.safe} onLayout={handleContainerLayout}>
      {toast && (
        <View style={[styles.toastContainer, { top: insets.top + 60 }]}>
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        </View>
      )}

      {/* Segment Tabs */}
      <View style={[styles.segmentContainer, { top: insets.top + 10 }]}>
        <Pressable
          style={[styles.segmentBtn, activeTab === "videos" && styles.segmentBtnActive]}
          onPress={() => setActiveTab("videos")}
        >
          <Text style={[styles.segmentText, activeTab === "videos" && styles.segmentTextActive]}>
            Video Reports
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, activeTab === "live" && styles.segmentBtnActive]}
          onPress={() => setActiveTab("live")}
        >
          <Text style={[styles.segmentText, activeTab === "live" && styles.segmentTextActive]}>
            Live Streams
          </Text>
        </Pressable>
      </View>

      {activeTab === "videos" && posts.length === 0 && !loading && (
        <View style={styles.empty}>
          <Icon name="videocam-outline" color={colors.muted} size={48} />
          <Text style={styles.emptyTitle}>No videos yet.</Text>
          <Text style={styles.emptyBody}>Check back later for field reports in video format.</Text>
        </View>
      )}

      {activeTab === "live" && liveSessions.length === 0 && !loading && (
        <View style={styles.empty}>
          <Icon name="radio" color={colors.muted} size={48} />
          <Text style={styles.emptyTitle}>No live streams.</Text>
          <Text style={styles.emptyBody}>Check back later for active live streams.</Text>
        </View>
      )}

      {((activeTab === "videos" && posts.length > 0) || (activeTab === "live" && liveSessions.length > 0)) && (
        <FlatList
          key={`reels-list-${listResetKey}`}
          ref={flatListRef}
          style={{ flex: 1, width: "100%" }}
          data={activeTab === "videos" ? posts : liveSessions}
          keyExtractor={(item) => (activeTab === "videos" ? item.id : item.room)}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={Platform.OS === "android" ? reelHeight : undefined}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum={true}
          getItemLayout={(_, index) => ({
            length: reelHeight,
            offset: reelHeight * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
            }, 120);
          }}
          showsVerticalScrollIndicator={false}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor="#fff"
            />
          }
        />
      )}

      {/* Comment Modal Sheet */}
      <ReelsCommentModal
        visible={!!activeCommentPost}
        post={activeCommentPost}
        onClose={() => setActiveCommentPost(null)}
      />
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#000" },
    toastContainer: {
      position: "absolute",
      left: 20,
      right: 20,
      zIndex: 200,
      alignItems: "center",
    },
    segmentContainer: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      zIndex: 100,
      gap: 24,
    },
    segmentBtn: {
      paddingVertical: 6,
    },
    segmentBtnActive: {
      borderBottomWidth: 2,
      borderBottomColor: "#fff",
    },
    segmentText: {
      color: "rgba(255,255,255,0.6)",
      fontSize: 18,
      fontWeight: "bold",
      textShadowColor: "rgba(0,0,0,0.5)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    segmentTextActive: {
      color: "#fff",
    },
    reelContainer: {
      width: "100%",
      backgroundColor: "#111",
      justifyContent: "flex-end",
      position: "relative",
      overflow: "hidden",
    },
    videoPlaceholder: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    overlayBottom: {
      position: "absolute",
      left: 16,
      right: 80,
      bottom: 28,
      gap: 6,
    },
    reporterName: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
      textShadowColor: "rgba(0,0,0,0.8)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    videoTitle: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 22,
      textShadowColor: "rgba(0,0,0,0.8)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    videoBody: {
      color: "rgba(255,255,255,0.85)",
      fontSize: 14,
      lineHeight: 18,
      textShadowColor: "rgba(0,0,0,0.8)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    overlayRight: {
      position: "absolute",
      right: 14,
      bottom: 40,
      gap: 18,
      alignItems: "center",
      zIndex: 40,
    },
    actionButton: {
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    actionIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    actionText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "700",
      textShadowColor: "rgba(0, 0, 0, 0.9)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    actionTextLiked: {
      color: "#ff2b54",
    },
    liveButton: {
      backgroundColor: colors.red,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    liveButtonText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "bold",
    },
    empty: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 40,
    },
    emptyTitle: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "bold",
      marginTop: 16,
    },
    emptyBody: {
      color: "#888",
      textAlign: "center",
      marginTop: 8,
    },
  });
