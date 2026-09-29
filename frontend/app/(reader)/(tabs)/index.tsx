// Reader / client home: dispatch wall with an All / Following tab switch,
// live-now strip, inline Mux media, ₹7 Razorpay support (one-time or monthly),
// and a "flag for moderation" flow.
import { Image } from "expo-image";
import { Link, useRouter, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiDelete, apiGet, apiGetPaginated, apiPost, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { RichEditor } from "@/src/rich-editor";
import { stripHtml, extractFirstImageSrc } from "@/src/utils/text";
import { MediaPlayer, type MediaAttachment } from "@/src/media-player";
import { RazorpayCheckout, type CheckoutOrder } from "@/src/razorpay";
import { SupportChoiceSheet, type SupportInterval } from "@/src/support-choice";
import { sharePost } from "@/src/share";
import {   } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, EmptyState, Icon, Toast, ConfirmModal } from "@/src/ui";

type Post = {
  id: string;
  reporter_id: string;
  reporter_name: string;
  reporter_avatar?: string;
  verified: boolean;
  title: string;
  body: string;
  kind: string;
  location: string;
  stats: string;
  media?: MediaAttachment[];
  blocks?: any[];
  trending_score?: number;
  reads_24h?: number;
  comment_count?: number;
  created_at: string;
};
type Reporter = {
  id: string;
  name: string;
  beat: string;
  location: string;
  followers: number;
  support_total?: number;
  verified: boolean;
};
type LiveSession = {
  id: string;
  room: string;
  title: string;
  reporter_id: string;
  reporter_name: string;
  reporter_avatar?: string;
};



export default function Feed() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  const [showReporterModal, setShowReporterModal] = useState(false);

  const [tab, setTab] = useState<"all" | "following" | "trending">("all");
  const [topic, setTopic] = useState<string>("All");
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [bookmarkIds, setBookmarkIds] = useState<Set<string>>(new Set());
  const [reporters, setReporters] = useState<Reporter[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMoreRef = useRef<Record<string, boolean>>({ all: true, following: true });
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const [reporting, setReporting] = useState<Post | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [supportTarget, setSupportTarget] = useState<{ id: string; name: string } | null>(null);
  const [checkout, setCheckout] = useState<{ order: CheckoutOrder; reporterName: string } | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [newDispatchesCount, setNewDispatchesCount] = useState(0);

  const [followedReporters, setFollowedReporters] = useState<{id: string, name: string, avatar_url?: string, verified: boolean}[]>([]);
  const [selectedFollowingReporterId, setSelectedFollowingReporterId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      let followingUrl = `/feed/following${topic !== "All" ? `?topic=${topic}` : ""}`;
      if (selectedFollowingReporterId) {
        followingUrl += (followingUrl.includes("?") ? "&" : "?") + `reporter_id=${selectedFollowingReporterId}`;
      }

      const [p, r, live, following, trending, bookmarks, notifs, followedReps] = await Promise.all([
        apiGet<Post[]>(`/feed${topic !== "All" ? `?topic=${topic}` : ""}`).catch(() => [] as Post[]),
        apiGet<Reporter[]>("/reporters").catch(() => [] as Reporter[]),
        apiGet<LiveSession[]>("/live/sessions").catch(() => [] as LiveSession[]),
        apiGet<Post[]>(followingUrl).catch(() => [] as Post[]),
        apiGet<Post[]>("/feed/trending").catch(() => [] as Post[]),
        apiGet<{ post_ids: string[] }>("/bookmarks").catch(() => ({ post_ids: [] as string[] })),
        apiGet<any[]>("/notifications").catch(() => []),
        apiGet<any[]>("/reporters/following").catch(() => []),
      ]);
      setAllPosts(p);
      setReporters(r);
      setLiveSessions(live);
      setFollowingPosts(following);
      setTrendingPosts(trending);
      setBookmarkIds(new Set(bookmarks.post_ids));
      setHasUnread(notifs.some(n => !n.read));
      setFollowedReporters(followedReps);
    } catch {
      setToast({ message: "Could not load the dispatch wall.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [topic, selectedFollowingReporterId]);

  useEffect(() => {
    load();
  }, [load]);

  // Record a read for the top-most posts so trending reflects real engagement.
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentPosts = tab === "following" ? followingPosts : tab === "trending" ? trendingPosts : allPosts;
    const toMark = currentPosts.slice(0, 6).filter((p) => !seenRef.current.has(p.id));
    toMark.forEach((p) => {
      seenRef.current.add(p.id);
      apiPost(`/posts/${p.id}/read`).catch(() => {
        /* trending is best-effort */
      });
    });
  }, [tab, allPosts, followingPosts, trendingPosts]);

  // Polling for real-time feed updates
  useEffect(() => {
    const interval = setInterval(async () => {
      if (tab === "trending") return;
      const currentPosts = tab === "following" ? followingPosts : allPosts;
      if (currentPosts.length === 0) return;
      const first = currentPosts[0];
      try {
        let url = `/feed${tab === "following" ? "/following" : ""}${topic !== "All" ? `?topic=${topic}` : ""}`;
        if (tab === "following" && selectedFollowingReporterId) {
          url += (url.includes("?") ? "&" : "?") + `reporter_id=${selectedFollowingReporterId}`;
        }
        const more = await apiGetPaginated<Post[]>(url, "since", first.created_at);
        if (more.length > 0) {
          setNewDispatchesCount(more.length);
        }
      } catch {
        // silent fail
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [tab, allPosts, followingPosts, selectedFollowingReporterId]);

  const onRefresh = async () => {
    setRefreshing(true);
    hasMoreRef.current = { all: true, following: true };
    setNewDispatchesCount(0);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || tab === "trending" || !hasMoreRef.current[tab]) return;
    const currentPosts = tab === "following" ? followingPosts : allPosts;
    if (currentPosts.length === 0) return;
    const last = currentPosts[currentPosts.length - 1];
    
    setLoadingMore(true);
    try {
      let url = `/feed${tab === "following" ? "/following" : ""}${topic !== "All" ? `?topic=${topic}` : ""}`;
      if (tab === "following" && selectedFollowingReporterId) {
        url += (url.includes("?") ? "&" : "?") + `reporter_id=${selectedFollowingReporterId}`;
      }
      const more = await apiGetPaginated<Post[]>(url, "before", last.created_at);
      if (more.length === 0) {
        hasMoreRef.current[tab] = false;
        return;
      }
      if (tab === "following") {
        setFollowingPosts(prev => [...prev, ...more]);
      } else {
        setAllPosts(prev => [...prev, ...more]);
      }
    } catch {
      // silent fail on load more
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleBookmark = async (post: Post) => {
    const isSaved = bookmarkIds.has(post.id);
    // Optimistic update.
    setBookmarkIds((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(post.id) : next.add(post.id);
      return next;
    });
    try {
      if (isSaved) await apiDelete(`/bookmarks/${post.id}`);
      else await apiPost("/bookmarks", { post_id: post.id });
      setToast({
        message: isSaved ? "Removed from your reading list." : "Saved to your reading list.",
        tone: isSaved ? "info" : "success",
      });
    } catch {
      // Roll back on failure.
      setBookmarkIds((prev) => {
        const next = new Set(prev);
        isSaved ? next.add(post.id) : next.delete(post.id);
        return next;
      });
      setToast({ message: "Bookmark action failed.", tone: "error" });
    }
  };

  const openSupport = (reporter: { id: string; name?: string }) => {
    setSupportTarget({ id: reporter.id, name: reporter.name || "this reporter" });
  };

  const startCheckout = async (amount: number, interval: SupportInterval) => {
    if (!supportTarget) return;
    try {
      const order = await apiPost<CheckoutOrder>("/support", {
        reporter_id: supportTarget.id,
        amount,
        interval,
      });
      setCheckout({ order, reporterName: supportTarget.name });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Support could not be started.";
      setToast({ message, tone: e instanceof ApiError && e.status === 503 ? "info" : "error" });
    } finally {
      setSupportTarget(null);
    }
  };

  const submitReport = async () => {
    if (!reporting || reportReason.trim().length < 3) {
      setToast({ message: "Tell us briefly what's wrong.", tone: "error" });
      return;
    }
    try {
      await apiPost("/reports", { post_id: reporting.id, reason: reportReason.trim() });
      setReporting(null);
      setReportReason("");
      setToast({ message: "Report sent to moderators.", tone: "success" });
    } catch {
      setToast({ message: "Report could not be sent.", tone: "error" });
    }
  };

  const sourcePosts =
    tab === "following" ? followingPosts : tab === "trending" ? trendingPosts : allPosts;
  const filtered = sourcePosts;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        {/* Left Side: Create Button */}
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <Pressable onPress={() => {
            if (user?.role === "reporter") {
              router.push("/(reporter)/studio");
            } else {
              setShowReporterModal(true);
            }
          }} style={{ width: 40, height: 40, justifyContent: "center", alignItems: "flex-start" }}>
            <Icon name="mic" color={colors.ink} size={24} />
          </Pressable>
        </View>

        {/* Middle: Logo */}
        <View style={{ alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Text style={styles.wordmark}>azadi</Text>
            <View style={styles.signalDot} />
          </View>
          <Text style={styles.kicker}>THE DISPATCH WALL</Text>
        </View>

        {/* Right Side: Search and Notifications */}
        <View style={{ flex: 1, flexDirection: "row", gap: 16, alignItems: "center", justifyContent: "flex-end" }}>
          <Pressable onPress={() => router.push("/(reader)/search")}>
            <Icon name="search-outline" color={colors.ink} size={24} />
          </Pressable>
          <Pressable onPress={() => router.push("/(reader)/notifications")}>
            <View>
              <Icon name="notifications-outline" color={colors.ink} size={24} />
              {hasUnread && <View style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 8, backgroundColor: colors.red, borderWidth: 2, borderColor: colors.paper }} />}
            </View>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <>
              <Text style={styles.hello}>Hey {user?.name?.split(" ")[0] || "there"}.</Text>
          <Text style={styles.headline}>Today&apos;s ground truth.</Text>

          <View style={styles.tabRow}>
            {(["all", "following", "trending"] as const).map((t) => (
              <Pressable
                key={t}
                testID={`feed-tab-${t}`}
                onPress={() => setTab(t)}
                style={[styles.tab, tab === t && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === "all" ? "All" : t === "following" ? `Following · ${followedReporters.length}` : "Trending"}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "following" && followedReporters.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyStrip} style={{ marginBottom: 16 }}>
              <Pressable
                onPress={() => setSelectedFollowingReporterId(null)}
                style={styles.storyAvatarContainer}
              >
                <View style={[styles.storyAvatarWrap, selectedFollowingReporterId === null && styles.storyAvatarActive]}>
                  <View style={[styles.storyAvatarFallback, { backgroundColor: colors.surface }]}>
                    <Icon name="people" color={colors.ink} size={24} />
                  </View>
                </View>
                <Text style={styles.storyAvatarName} numberOfLines={1}>All</Text>
              </Pressable>

              {followedReporters.map(r => {
                const isActive = selectedFollowingReporterId === r.id;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelectedFollowingReporterId(isActive ? null : r.id)}
                    style={styles.storyAvatarContainer}
                  >
                    <View style={[styles.storyAvatarWrap, isActive && styles.storyAvatarActive]}>
                      {r.avatar_url ? (
                        <Image source={{ uri: r.avatar_url }} style={styles.storyAvatar} />
                      ) : (
                        <View style={styles.storyAvatarFallback}>
                          <Text style={styles.storyAvatarFallbackText}>{r.name?.[0]}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.storyAvatarName, isActive && { color: colors.ink, fontWeight: "700" }]} numberOfLines={1}>
                      {r.name.split(" ")[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {newDispatchesCount > 0 ? (
            <Pressable testID="new-dispatches-banner" style={styles.newDispatchesBanner} onPress={onRefresh}>
              <Icon name="arrow-up" color={colors.surface} size={14} />
              <Text style={styles.newDispatchesText}>{newDispatchesCount} new dispatch{newDispatchesCount === 1 ? '' : 'es'}</Text>
            </Pressable>
          ) : null}

          {liveSessions.length ? (
            <View style={styles.liveStrip}>
              <View style={styles.liveStripHeader}>
                <View style={styles.liveDot} />
                <Text style={styles.liveStripLabel}>LIVE NOW · {liveSessions.length}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {liveSessions.map((s) => (
                  <Pressable
                    key={s.id}
                    testID={`live-tile-${s.room}`}
                    onPress={() =>
                      router.push({
                        pathname: "/(reader)/live/[room]",
                        params: { room: s.room, title: s.title, reporter: s.reporter_name },
                      })
                    }
                    style={styles.liveTile}
                  >
                    <View style={styles.liveTilePill}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveTilePillText}>LIVE</Text>
                    </View>
                    <Text style={styles.liveTileTitle} numberOfLines={2}>{s.title}</Text>
                    <Text style={styles.liveTileMeta}>{s.reporter_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
            </>
          }
          ListEmptyComponent={
            <EmptyState
              title={tab === "following" ? "You're not following anyone yet." : "Nothing here yet."}
              body={
                tab === "following"
                  ? "Tap a reporter's byline to open their profile and follow them."
                  : "Check back soon — new dispatches drop throughout the day."
              }
              icon="newspaper-outline"
            />
          }
          renderItem={({ item: post, index: i }) => (
            <Pressable key={post.id} onPress={() => router.push({ pathname: "/(reader)/post/[id]", params: { id: post.id } })}>
              <View testID="reader-feed-item" style={[styles.post, i === 0 && styles.leadPost]}>
                <View style={styles.postTop}>
                  <Text style={[styles.postOverline, post.kind === "live now" && { color: colors.red }]}>
                    {post.kind.toUpperCase()}
                  </Text>
                  {tab === "trending" && post.reads_24h ? (
                    <View style={styles.trendingBadge}>
                      <Icon name="flame" color={colors.red} size={12} />
                      <Text style={styles.trendingBadgeText}>{post.reads_24h} reads · 24h</Text>
                    </View>
                  ) : null}
                  {post.location && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Icon name="location-outline" size={12} color={i === 0 ? "#B7BEC5" : colors.muted} />
                      <Text style={[styles.meta, i === 0 && { color: "#B7BEC5" }]}>
                        {post.location}
                        {post.edited_at ? " • Edited" : ""}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.postTitle, i === 0 && styles.leadTitle]}>{post.title}</Text>
                {(() => {
                  // Strip HTML tags safely (avoids regex stack overflow on large base64)
                  const previewText = stripHtml(post.body || '');
                  const firstImgSrc = extractFirstImageSrc(post.body || '');
                  return (
                    <>
                      <Text style={[styles.postBody, i === 0 && styles.leadBody]} numberOfLines={4}>{previewText}</Text>
                      {firstImgSrc ? (
                        <Image
                          source={{ uri: firstImgSrc }}
                          style={[styles.feedImage, { borderRadius: 8 }]}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : null}
                      {Array.isArray(post.media) && post.media.length > 0 ? (
                        <View style={styles.mediaStack}>
                          {post.media.map((m, idx) => (
                            <MediaPlayer key={`${post.id}-${idx}`} media={m} />
                          ))}
                        </View>
                      ) : null}
                    </>
                  );
                })()}

                <View style={styles.postFooter}>
                  <Pressable
                    testID={`reader-open-reporter-${post.reporter_id}`}
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push({ pathname: "/(reader)/reporter/[id]", params: { id: post.reporter_id } });
                    }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    {post.reporter_avatar ? (
                      <Image source={{ uri: post.reporter_avatar }} style={{ width: 24, height: 24, borderRadius: 8 }} />
                    ) : (
                      <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>{post.reporter_name?.[0]}</Text>
                      </View>
                    )}
                    <Text style={[styles.byline, i === 0 && { color: colors.surface }]}>
                      By {post.reporter_name}{" "}
                      {post.verified ? <Icon name="checkmark-circle" size={13} color={colors.blue} /> : null}
                    </Text>
                  </Pressable>
                  <Text style={[styles.meta, i === 0 && { color: "#B7BEC5" }]}>{post.stats}</Text>
                </View>
                <View style={[styles.actions, i === 0 && { borderTopColor: "#2E353D" }]}>
                  <Pressable
                    testID="reader-support-button"
                    onPress={(e) => {
                      e.stopPropagation();
                      openSupport({ id: post.reporter_id, name: post.reporter_name });
                    }}
                    style={styles.action}
                  >
                    <Icon name="heart-outline" color={i === 0 ? colors.surface : colors.red} size={18} />
                    <Text style={[styles.actionText, i === 0 && { color: colors.surface }]}>Support ₹7</Text>
                  </Pressable>
                  <Pressable
                    testID={`reader-bookmark-${post.id}`}
                    onPress={(e) => {
                      e.stopPropagation();
                      toggleBookmark(post);
                    }}
                    style={styles.action}
                  >
                    <Icon
                      name={bookmarkIds.has(post.id) ? "bookmark" : "bookmark-outline"}
                      color={i === 0 ? colors.surface : bookmarkIds.has(post.id) ? colors.blue : colors.muted}
                      size={18}
                    />
                    <Text style={[styles.actionText, i === 0 && { color: colors.surface }]}>
                      {bookmarkIds.has(post.id) ? "Saved" : "Save"}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="reader-share-button"
                    onPress={(e) => {
                      e.stopPropagation();
                      sharePost(post as any);
                    }}
                    style={styles.action}
                  >
                    <Icon name="share-outline" color={i === 0 ? colors.surface : colors.muted} size={18} />
                    <Text style={[styles.actionText, i === 0 && { color: colors.surface }]}>Share</Text>
                  </Pressable>
                  <Pressable
                    testID="reader-comment-button"
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push({ pathname: "/(reader)/post/[id]", params: { id: post.id } });
                    }}
                    style={styles.action}
                  >
                    <Icon name="chatbubble-outline" color={i === 0 ? colors.surface : colors.muted} size={18} />
                    <Text style={[styles.actionText, i === 0 && { color: colors.surface }]}>{post.comment_count || 0}</Text>
                  </Pressable>
                  <Pressable
                    testID="reader-report-button"
                    onPress={(e) => {
                      e.stopPropagation();
                      setReporting(post);
                    }}
                    style={styles.action}
                  >
                    <Icon name="flag-outline" color={i === 0 ? colors.surface : colors.muted} size={18} />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            <>
              {loadingMore && <ActivityIndicator color={colors.red} style={{ marginVertical: 20 }} />}
              <View style={styles.reporterBlock}>
            <Text style={styles.overline}>FIND YOUR REPORTER</Text>
            <Text style={styles.blockHeading}>Support the work, not the noise.</Text>
            {reporters.length === 0 ? (
              <Text style={styles.meta}>No reporters yet. Invite one to join.</Text>
            ) : (
              reporters.map((r) => (
                <Pressable
                  key={r.id}
                  testID={`reader-open-reporter-card-${r.id}`}
                  onPress={() => router.push({ pathname: "/(reader)/reporter/[id]", params: { id: r.id } })}
                  style={styles.reporterRow}
                >
                  <View style={styles.reporterMark}>
                    <Text style={styles.reporterInitial}>{r.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reporterName}>
                      {r.name}{" "}
                      {r.verified ? <Icon name="checkmark-circle" size={13} color={colors.blue} /> : null}
                    </Text>
                    <Text style={styles.meta}>
                      {r.beat} · {r.followers} follower{r.followers === 1 ? "" : "s"}
                      {r.support_total ? ` · ₹${r.support_total} supported` : ""}
                    </Text>
                  </View>
                  <Pressable
                    testID="support-seven-rupees-button"
                    onPress={(e) => {
                      e.stopPropagation?.();
                      openSupport(r);
                    }}
                    style={styles.supportSmall}
                  >
                    <Text style={styles.supportSmallText}>₹7</Text>
                  </Pressable>
                </Pressable>
              ))
            )}
          </View>
            </>
          }
        />
      )}


      <Modal visible={!!reporting} transparent animationType="slide" onRequestClose={() => setReporting(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.overline}>FLAG DISPATCH</Text>
            <Text style={styles.blockHeading}>What&apos;s wrong with this post?</Text>
            <TextInput
              testID="report-reason-input"
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Give moderators enough context to review"
              placeholderTextColor="#8A8F91"
              multiline
              style={styles.reportInput}
            />
            <Button testID="report-submit-button" onPress={submitReport} tone="red">
              Send to moderators
            </Button>
            <Button
              onPress={() => {
                setReporting(null);
                setReportReason("");
              }}
              tone="outline"
            >
              Cancel
            </Button>
          </View>
        </View>
      </Modal>

      <SupportChoiceSheet
        visible={!!supportTarget}
        reporterName={supportTarget?.name || ""}
        onDismiss={() => setSupportTarget(null)}
        onChoose={startCheckout}
      />



      <RazorpayCheckout
        visible={!!checkout}
        order={checkout?.order || null}
        reporterName={checkout?.reporterName || ""}
        userName={user?.name}
        userEmail={user?.email}
        onDismiss={() => setCheckout(null)}
        onResult={(res) => {
          setCheckout(null);
          setToast({ message: res.message, tone: res.ok ? "success" : "error" });
          if (res.ok) load();
        }}
      />

      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    
      <ConfirmModal
        visible={showReporterModal}
        title="Become a Reporter"
        body="If you want to be a reporter you can request it."
        confirmText="Request"
        onCancel={() => setShowReporterModal(false)}
        onConfirm={() => {
          setShowReporterModal(false);
          setToast?.({ message: "Your request has been submitted.", tone: "success" });
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: { color: colors.ink, fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  signalDot: { width: 6, height: 6, borderRadius: 8, backgroundColor: colors.red, marginLeft: 4, marginTop: 6 },
  kicker: { fontSize: 9, letterSpacing: 2, color: colors.muted, marginTop: 4, fontWeight: "800" },
  content: { padding: 20, paddingBottom: 60 },
  hello: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  headline: { color: colors.ink, fontSize: 32, fontWeight: "800", letterSpacing: -1, marginTop: 4, marginBottom: 16 },
  tabRow: { flexDirection: "row", backgroundColor: colors.line, padding: 3, borderRadius: 8, marginBottom: 18 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8 },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: "800", fontSize: 12 },
  tabTextActive: { color: colors.ink },
  newDispatchesBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.ink, padding: 10, borderRadius: 8, marginBottom: 20 },
  newDispatchesText: { color: colors.surface, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  liveStrip: { marginBottom: 20 },
  liveStripHeader: { flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 10 },
  liveStripLabel: { color: colors.red, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  liveDot: { backgroundColor: colors.red, width: 8, height: 8, borderRadius: 8 },
  liveTile: {
    width: 220,
    backgroundColor: colors.ink,
    padding: 14,
    borderRadius: 8,
    gap: 8,
    flexShrink: 0,
  },
  storyStrip: { paddingHorizontal: 16, gap: 12, paddingVertical: 4 },
  storyAvatarContainer: { alignItems: "center", gap: 6, width: 64 },
  storyAvatarWrap: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 2, borderColor: "transparent",
    alignItems: "center", justifyContent: "center",
  },
  storyAvatarActive: { borderColor: colors.red },
  storyAvatar: { width: 52, height: 52, borderRadius: 26 },
  storyAvatarFallback: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.paper, alignItems: "center", justifyContent: "center",
  },
  storyAvatarFallbackText: { color: colors.muted, fontSize: 18, fontWeight: "800" },
  storyAvatarName: { color: colors.muted, fontSize: 11, textAlign: "center" },
  liveTilePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveTilePillText: { color: colors.surface, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  liveTileTitle: { color: colors.surface, fontSize: 15, fontWeight: "800", lineHeight: 20 },
  liveTileMeta: { color: "#B7BEC5", fontSize: 11 },
  post: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 20,
    marginTop: 12,
    paddingHorizontal: 16,
  },
  leadPost: { backgroundColor: colors.ink, borderTopWidth: 0, padding: 20, marginTop: 20, borderRadius: 8 },
  postTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  postOverline: { color: colors.muted, fontSize: 10, letterSpacing: 1.6, fontWeight: "800" },
  trendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F5E5E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  trendingBadgeText: { color: colors.red, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  overline: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "800" },
  postTitle: { color: colors.ink, fontSize: 22, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  leadTitle: { color: colors.surface, fontSize: 28, lineHeight: 30 },
  postBody: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  leadBody: { color: "#B7BEC5" },
  mediaStack: { gap: 10, marginTop: 14 },
  feedImage: { width: "100%" as any, height: 200, marginTop: 14, backgroundColor: colors.dark },
  postFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 18, alignItems: "center" },
  byline: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12 },
  actions: { flexDirection: "row", gap: 20, marginTop: 16, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  action: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  reporterBlock: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    marginTop: 24,
    borderRadius: 8,
  },
  blockHeading: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 8, marginBottom: 4 },
  reporterRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  reporterMark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  reporterInitial: { color: colors.surface, fontWeight: "800" },
  reporterName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  supportSmall: {
    borderWidth: 1,
    borderColor: colors.red,
    paddingHorizontal: 14,
    height: 34,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.paper,
  },
  supportSmallText: { color: colors.red, fontSize: 12, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(24,32,42,0.55)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: 22, paddingBottom: 32, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  reportInput: {
    color: colors.ink,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    minHeight: 120,
    fontSize: 14,
    marginTop: 12,
    marginBottom: 12,
    textAlignVertical: "top",
    borderRadius: 8,
  },
});
