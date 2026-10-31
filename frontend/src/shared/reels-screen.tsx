/**
 * Shared Video/Reels screen.
 * Used by both (reporter)/(tabs)/video.tsx and (reader)/(tabs)/reels.tsx.
 * The only difference is the live stream route path.
 */
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
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
import { LiveReelItem } from "@/src/shared/live-reel-item";
import { Icon, Toast, ReelSkeleton } from "@/src/ui";
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
  reporter_avatar?: string;
  media: any[];
  stats?: string;
  comment_count?: number;
};

export type LiveSession = {
  id?: string;
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

function VideoReelItem({
  post,
  reelHeight,
  shouldPlay,
  mountVideo = true,
  onVideoReady,
  isLiked,
  likeCount,
  commentCount,
  onLike,
  onComment,
  onShare,
  routePrefix,
  colors,
  styles,
}: {
  post: Post;
  reelHeight: number;
  shouldPlay: boolean;
  mountVideo?: boolean;
  onVideoReady?: () => void;
  isLiked: boolean;
  likeCount: number;
  commentCount: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  routePrefix: string;
  colors: any;
  styles: any;
}) {
  const router = useRouter();
  const [descExpanded, setDescExpanded] = useState(false);
  const [reporterAvatar, setReporterAvatar] = useState<string | null>(post.reporter_avatar || null);

  useEffect(() => {
    let cancelled = false;
    if (!reporterAvatar && post.reporter_id) {
      apiGet<{ name?: string; avatar_url?: string }>(`/users/${post.reporter_id}/basic`)
        .then((data) => {
          if (!cancelled && data?.avatar_url) {
            setReporterAvatar(data.avatar_url);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [post.reporter_id, reporterAvatar]);

  let mediaArr = post.media;
  if (typeof mediaArr === "string") {
    try {
      mediaArr = JSON.parse(mediaArr);
    } catch {
      mediaArr = [];
    }
  }
  const media = Array.isArray(mediaArr) && mediaArr.length > 0 ? mediaArr[0] : null;

  // Combine title and body into description
  const description = post.title
    ? (post.body && post.body !== post.title ? `${post.title}\n${post.body}` : post.title)
    : (post.body || "");

  const openReporterProfile = () => {
    if (post.reporter_id) {
      router.push({
        pathname: `${routePrefix}/reporter/[id]` as any,
        params: { id: post.reporter_id },
      });
    }
  };

  const posterUri = media?.thumbnail_url || (media?.playback_id ? `https://image.mux.com/${media.playback_id}/thumbnail.jpg?width=800&fit_mode=preserve` : media?.url);

  return (
    <View style={[styles.reelContainer, { height: reelHeight, width: "100%" }]}>
      {media ? (
        <View style={StyleSheet.absoluteFillObject}>
          {mountVideo ? (
            <MediaPlayer media={media} radius={0} fill paused={!shouldPlay} resetOnPause={true} showPlayPauseOverlay={false} onReady={onVideoReady} />
          ) : (
            <View style={StyleSheet.absoluteFillObject}>
              <ReelSkeleton style={StyleSheet.absoluteFillObject} />
              {posterUri ? (
                <Image
                  source={{ uri: posterUri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={150}
                />
              ) : null}
            </View>
          )}
        </View>
      ) : (
        <ReelSkeleton style={StyleSheet.absoluteFillObject} />
      )}

      {/* Bottom Details Overlay (Styled like Live Streams) */}
      <View style={styles.streamDetailsOverlay} pointerEvents="box-none">
        {/* Reporter profile avatar + name */}
        <Pressable onPress={openReporterProfile} style={styles.reporterProfileRow}>
          {reporterAvatar ? (
            <Image source={{ uri: reporterAvatar }} style={styles.reporterAvatar} />
          ) : (
            <View style={[styles.reporterAvatarFallback, { backgroundColor: colors.red }]}>
              <Text style={styles.reporterAvatarLetter}>
                {(post.reporter_name || "R").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.reporterNameWrap}>
            <View style={styles.reporterNameBadgeRow}>
              <Text style={styles.reporterNameText} numberOfLines={1}>
                @{post.reporter_name}
              </Text>
              <Icon name="checkmark-circle" color="#2196F3" size={14} />
            </View>
            <Text style={styles.reporterLiveTag}>REPORTER</Text>
          </View>
        </Pressable>

        {/* Expandable description section below the name */}
        {description ? (
          <Pressable
            onPress={() => setDescExpanded((prev) => !prev)}
            style={styles.descriptionContainer}
            hitSlop={6}
          >
            <Text
              style={styles.descriptionText}
              numberOfLines={descExpanded ? undefined : 2}
            >
              {description}
            </Text>
            <Text style={styles.descriptionToggleText}>
              {descExpanded ? "Show less" : "…more"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Right Interaction Bar */}
      <View style={styles.overlayRight} pointerEvents="box-none">
        {/* Like Button */}
        <Pressable style={styles.actionButton} onPress={onLike} hitSlop={10}>
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
        <Pressable style={styles.actionButton} onPress={onComment} hitSlop={10}>
          <View style={styles.actionIconCircle}>
            <Icon name="chatbubble-outline" color="#fff" size={26} />
          </View>
          <Text style={styles.actionText}>
            {commentCount > 0 ? commentCount : "Comment"}
          </Text>
        </Pressable>

        {/* Send / Share Button */}
        <Pressable style={styles.actionButton} onPress={onShare} hitSlop={10}>
          <View style={styles.actionIconCircle}>
            <Icon name="arrow-redo-outline" color="#fff" size={27} />
          </View>
          <Text style={styles.actionText}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ReelsScreen({ routePrefix }: { routePrefix: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { initialPostId, navTimestamp, tab, initialRoom } = useLocalSearchParams<{
    initialPostId?: string;
    navTimestamp?: string;
    tab?: string;
    initialRoom?: string;
  }>();
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
  const [activeTab, setActiveTab] = useState<"videos" | "live">(tab === "live" ? "live" : "videos");
  const [visibleLiveRoom, setVisibleLiveRoom] = useState<string | null>(initialRoom || null);

  useEffect(() => {
    if (tab === "live") {
      setActiveTab("live");
      if (initialRoom) setVisibleLiveRoom(initialRoom);
    }
  }, [tab, initialRoom]);

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

      let orderedSessions = live || [];
      if (initialRoom) {
        const found = orderedSessions.find((s) => s.room === initialRoom);
        if (found) {
          orderedSessions = [found, ...orderedSessions.filter((s) => s.room !== initialRoom)];
        }
      }
      setLiveSessions(orderedSessions);
      if (orderedSessions.length > 0) {
        setVisibleLiveRoom((cur) => cur || orderedSessions[0].room);
      }

      // Preserve currently playing video or set to first video
      if (finalOrderedPosts.length > 0) {
        setVisiblePostId((current) => current || finalOrderedPosts[0].id);
      }
    } catch {
      // quiet fail
    } finally {
      setLoading(false);
    }
  }, [initialPostId, initialRoom]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh live sessions on focus so ended broadcasts are instantly cleared
  useEffect(() => {
    if (isFocused) {
      apiGet<LiveSession[]>("/live/sessions")
        .then((live) => {
          if (live) {
            setLiveSessions(live);
            if (activeTab === "live" && live.length > 0 && !visibleLiveRoom) {
              setVisibleLiveRoom(live[0].room);
            }
          }
        })
        .catch(() => {});
    }
  }, [isFocused, activeTab, visibleLiveRoom]);

  // Ensure visiblePostId or visibleLiveRoom is initialized if not set yet
  useEffect(() => {
    if (activeTab === "videos" && !visiblePostId && posts.length > 0) {
      setVisiblePostId(posts[0].id);
    }
    if (activeTab === "live" && !visibleLiveRoom && liveSessions.length > 0) {
      setVisibleLiveRoom(liveSessions[0].room);
    }
  }, [activeTab, posts, liveSessions, visiblePostId, visibleLiveRoom]);

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: 50,
      },
      onViewableItemsChanged: ({ viewableItems }: any) => {
        if (viewableItems && viewableItems.length > 0) {
          const primary = viewableItems[0]?.item;
          if (primary?.id) {
            setVisiblePostId(primary.id);
          }
          if (primary?.room) {
            setVisibleLiveRoom(primary.room);
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

  // Track which posts have finished initial stream buffering
  const [readyPostIds, setReadyPostIds] = useState<Record<string, boolean>>({});

  const handleVideoReady = useCallback((postId: string) => {
    setReadyPostIds((prev) => {
      if (prev[postId]) return prev;
      return { ...prev, [postId]: true };
    });
  }, []);

    // Prefetch thumbnails 2 to 5 reels ahead for instant loading and 0 blank screens
  useEffect(() => {
    if (activeTab !== "videos" || posts.length === 0) return;
    const currentIdx = posts.findIndex((p) => p.id === visiblePostId);
    const startIdx = currentIdx >= 0 ? currentIdx + 1 : 1;
    // Preload 2 to 5 reels ahead
    const upcoming = posts.slice(startIdx, startIdx + 5);
    const urls: string[] = [];

    for (const p of upcoming) {
      let mediaArr = p.media;
      if (typeof mediaArr === "string") {
        try { mediaArr = JSON.parse(mediaArr); } catch { mediaArr = []; }
      }
      const m = Array.isArray(mediaArr) && mediaArr.length > 0 ? mediaArr[0] : null;
      if (m) {
        if (m.thumbnail_url) {
          urls.push(m.thumbnail_url);
        } else if (m.playback_id) {
          urls.push(`https://image.mux.com/${m.playback_id}/thumbnail.jpg?width=800&fit_mode=preserve`);
        } else if (m.url && m.kind === "image") {
          urls.push(m.url);
        }
      }
    }

    if (urls.length > 0) {
      urls.forEach((u) => Image.prefetch(u).catch(() => {}));
    }
  }, [visiblePostId, posts, activeTab]);

  const renderItem = ({ item }: { item: any }) => {
    if (activeTab === "live") {
      const live = item as LiveSession;
      const isLiveActive = isFocused && isDocVisible && visibleLiveRoom === live.room;
      return (
        <LiveReelItem
          session={live}
          height={reelHeight}
          isActive={isLiveActive}
          onEndStream={() => {
            setLiveSessions((prev) => prev.filter((s) => s.room !== live.room));
            setToast({ message: "Live stream ended.", tone: "info" });
          }}
        />
      );
    }

    const post = item as Post;
    const isCurrentActive = visiblePostId === post.id;
    const shouldPlay = isFocused && isDocVisible && isCurrentActive && activeTab === "videos";

    const postIndex = posts.findIndex((p) => p.id === post.id);
    const activeIndex = posts.findIndex((p) => p.id === visiblePostId);

    // Strict priority downloading flow:
    // 1. Visible reel ALWAYS gets priority and loads first.
    // 2. Next reel below only begins mounting/downloading AFTER the active reel is ready.
    // 3. Second reel below only begins after both the active and next reel are ready.
    // 4. When user scrolls, the new reel immediately takes top priority.
    let mountVideo = false;
    if (isCurrentActive) {
      mountVideo = true;
    } else if (activeIndex >= 0 && postIndex === activeIndex + 1) {
      mountVideo = !!readyPostIds[visiblePostId || ""];
    } else if (activeIndex >= 0 && postIndex === activeIndex + 2) {
      const nextId = posts[activeIndex + 1]?.id;
      mountVideo = !!readyPostIds[visiblePostId || ""] && !!(nextId && readyPostIds[nextId]);
    } else if (activeIndex >= 0 && postIndex === activeIndex - 1) {
      mountVideo = !!readyPostIds[post.id];
    } else {
      mountVideo = false;
    }

    const postInteraction = interactions[post.id];
    const isLiked = postInteraction ? postInteraction.liked : !!(post as any).liked;
    const likeCount = postInteraction ? postInteraction.likeCount : ((post as any).like_count ?? 0);
    const commentCount = postInteraction ? postInteraction.commentCount : ((post as any).comment_count ?? 0);

    return (
      <VideoReelItem
        post={post}
        reelHeight={reelHeight}
        shouldPlay={shouldPlay}
        mountVideo={mountVideo}
        onVideoReady={() => handleVideoReady(post.id)}
        isLiked={isLiked}
        likeCount={likeCount}
        commentCount={commentCount}
        onLike={() => toggleLike(post)}
        onComment={() => setActiveCommentPost(post)}
        onShare={() => handleShare(post)}
        routePrefix={routePrefix}
        colors={colors}
        styles={styles}
      />
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
          pagingEnabled={Platform.OS === "ios"}
          windowSize={5}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews={false}
          snapToInterval={reelHeight}
          snapToAlignment="start"
          decelerationRate={Platform.OS === "ios" ? "fast" : 0.982}
          disableIntervalMomentum={true}
          overScrollMode="never"
          bounces={false}
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
    streamDetailsOverlay: {
      position: "absolute",
      left: 14,
      bottom: 24,
      zIndex: 18,
      gap: 6,
      maxWidth: "74%",
    },
    reporterProfileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    reporterAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1.5,
      borderColor: "#FFFFFF",
      backgroundColor: "#222",
    },
    reporterAvatarFallback: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: "#FFFFFF",
    },
    reporterAvatarLetter: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
    },
    reporterNameWrap: {
      justifyContent: "center",
      gap: 2,
    },
    reporterNameBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    reporterNameText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
      textShadowColor: "rgba(0,0,0,0.85)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    reporterLiveTag: {
      color: "rgba(255, 255, 255, 0.75)",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    descriptionContainer: {
      marginTop: 2,
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    descriptionText: {
      color: "#F0F0F0",
      fontSize: 13,
      lineHeight: 18,
      textShadowColor: "rgba(0,0,0,0.85)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    descriptionToggleText: {
      color: "#64B5F6",
      fontSize: 12,
      fontWeight: "700",
      marginTop: 2,
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
