// Shared Reporter profile screen — shows bio, follower / support totals, follow toggle, all
// dispatches in grid with 9:16 vertical cards, and reel modal / support entry points.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiDelete, apiGet, apiPost, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { type MediaAttachment } from "@/src/media-player";
import { RazorpayCheckout, type CheckoutOrder } from "@/src/razorpay";
import { SupportChoiceSheet, type SupportInterval } from "@/src/support-choice";
import { useTheme } from "@/src/hooks/use-theme";
import { EmptyState, Icon, Toast } from "@/src/ui";
import { ReelModal, ReelItem } from "@/src/shared/reel-modal";
import { useFollowStore, followStore } from "@/src/follow-store";

type ProfileResp = {
  reporter: {
    id: string;
    name: string;
    email: string;
    role: string;
    verified?: boolean;
    beat?: string;
    location?: string;
    followers: number;
    following: number;
    support_total: number;
    is_following: boolean;
    avatar_url?: string;
    is_live?: boolean;
    live_room?: string;
  };
  posts: {
    id: string;
    title: string;
    body: string;
    kind: string;
    location: string;
    stats: string;
    created_at: string;
    media?: MediaAttachment[];
    comment_count?: number;
  }[];
};

export default function ReporterProfileScreen({ routePrefix = "/(reader)" }: { routePrefix?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateUser } = useAuth();
  const { follow, unfollow } = useFollowStore();
  const [data, setData] = useState<ProfileResp | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const [checkout, setCheckout] = useState<CheckoutOrder | null>(null);
  const [choosingInterval, setChoosingInterval] = useState(false);
  const [activeTab, setActiveTab] = useState<"grid" | "video">("grid");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeReel, setActiveReel] = useState<ReelItem | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<ProfileResp>(`/reporters/${id}`);
      if (res?.reporter?.is_following) {
        followStore.setFollowedReporters([
          ...followStore.getFollowedReporters().filter((r) => r.id !== res.reporter.id),
          {
            id: res.reporter.id,
            name: res.reporter.name,
            avatar_url: res.reporter.avatar_url,
            verified: !!res.reporter.verified,
          },
        ]);
      }
      setData(res);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load this reporter.";
      setToast({ message, tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const performUnfollow = async () => {
    if (!data) return;
    const rep = data.reporter;
    setShowDropdown(false);

    // 1. Instant optimistic UI on current profile
    setData({
      ...data,
      reporter: {
        ...rep,
        is_following: false,
        followers: Math.max(0, (rep.followers || 1) - 1),
      },
    });

    // 2. Instant global update to Home screen following strip & Profile tab following count
    try {
      const res = await unfollow(
        rep.id,
        (delta) => updateUser((prev) => (prev ? { ...prev, following: Math.max(0, (prev.following || 0) + delta) } : prev))
      );
      if (res && typeof res.followers === "number") {
        setData((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, followers: res.followers } } : prev));
      }
    } catch (e) {
      // Revert if error
      setData({ ...data, reporter: { ...rep, is_following: true, followers: rep.followers } });
      const message = e instanceof ApiError ? e.message : "Unfollow action failed.";
      setToast({ message, tone: "error" });
    }
  };

  const toggleFollow = async () => {
    if (!data) return;
    const rep = data.reporter;

    // 1. Instant optimistic UI on current profile
    setData({
      ...data,
      reporter: {
        ...rep,
        is_following: true,
        followers: (rep.followers || 0) + 1,
      },
    });
    setToast({ message: `Following ${rep.name}.`, tone: "success" });

    // 2. Instant global update to Home screen following strip & Profile tab following count
    try {
      const res = await follow(
        { id: rep.id, name: rep.name, avatar_url: rep.avatar_url, verified: rep.verified },
        (delta) => updateUser((prev) => (prev ? { ...prev, following: Math.max(0, (prev.following || 0) + delta) } : prev))
      );
      if (res && typeof res.followers === "number") {
        setData((prev) => (prev ? { ...prev, reporter: { ...prev.reporter, followers: res.followers } } : prev));
      }
    } catch (e) {
      // Revert if error
      setData({ ...data, reporter: { ...rep, is_following: false, followers: rep.followers } });
      const message = e instanceof ApiError ? e.message : "Follow action failed.";
      setToast({ message, tone: "error" });
    }
  };

  const startCheckout = async (amount: number, interval: SupportInterval) => {
    if (!data) return;
    setChoosingInterval(false);
    try {
      const order = await apiPost<CheckoutOrder>("/support", {
        reporter_id: data.reporter.id,
        amount,
        interval,
      });
      setCheckout(order);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Support could not be started.";
      setToast({ message, tone: e instanceof ApiError && e.status === 503 ? "info" : "error" });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) return null;
  const r = data.reporter;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topHeader}>
        {/* Left Side: Back & Username */}
        <View style={{ flex: 1, alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
          <Pressable testID="profile-back" onPress={() => router.back()} hitSlop={12}>
            <Icon name="arrow-back" color={colors.ink} size={24} />
          </Pressable>
          <Text style={styles.username}>{r.name?.toLowerCase().replace(/\s+/g, "_")}</Text>
          {r.verified ? <Icon name="checkmark-circle" color={colors.blue} size={16} /> : null}
        </View>

        {/* Right Side: Options Menu */}
        <View style={{ flexDirection: "row", gap: 20, alignItems: "center" }}>
          <Pressable onPress={() => setToast({ message: "Options coming soon", tone: "info" })}>
            <Icon name="ellipsis-horizontal" color={colors.ink} size={24} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.red}
          />
        }
      >
        {/* Profile Head */}
        <View style={styles.profileHead}>
          <View style={styles.avatarContainer}>
            {r.avatar_url ? (
              <Image source={{ uri: r.avatar_url }} style={styles.avatar} />
            ) : (
              <View
                style={[styles.avatar, { backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }]}
              >
                <Text style={styles.avatarText}>{r.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{data.posts.length}</Text>
              <Text style={styles.statLabel}>posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{r.followers}</Text>
              <Text style={styles.statLabel}>followers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{r.following ?? 0}</Text>
              <Text style={styles.statLabel}>following</Text>
            </View>
          </View>
        </View>

        {/* Bio Section */}
        <View style={styles.bioSection}>
          <Text style={styles.bioName}>{r.name}</Text>
          <Text style={styles.bioText}>{r.beat || "Independent reporting from the ground."}</Text>
          {r.location ? <Text style={styles.meta}>Based in {r.location}</Text> : null}
        </View>

        {r.is_live && r.live_room ? (
          <Pressable
            style={styles.liveBanner}
            onPress={() => router.push({ pathname: `${routePrefix}/live/[room]` as any, params: { room: r.live_room } })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={styles.liveBannerDot} />
              <Text style={styles.liveBannerText}>CURRENTLY LIVE</Text>
            </View>
            <Icon name="chevron-forward" color={colors.surface} size={16} />
          </Pressable>
        ) : null}

        {/* Action Buttons */}
        <View style={[styles.actionButtons, { zIndex: 10 }]}>
          {user ? (
            <>
              <View style={{ flex: 1, zIndex: 10 }}>
                <Pressable
                  testID="profile-follow-toggle"
                  onPress={() => {
                    if (r.is_following) {
                      setShowDropdown(!showDropdown);
                    } else {
                      toggleFollow();
                    }
                  }}
                  style={[styles.actionBtn, r.is_following ? styles.followingBtn : { backgroundColor: colors.blue }]}
                >
                  <Text style={[styles.actionBtnText, { color: r.is_following ? colors.ink : colors.paper }]}>
                    {r.is_following ? "Following" : "Follow"}
                  </Text>
                  {r.is_following && <Icon name="chevron-down" color={colors.ink} size={14} />}
                </Pressable>

                {showDropdown && (
                  <View style={styles.dropdownMenu}>
                    <Pressable style={styles.dropdownItem} onPress={performUnfollow}>
                      <Text style={[styles.dropdownItemText, { color: colors.red }]}>Unfollow</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <Pressable
                testID="profile-message-button"
                onPress={() => router.push(`/messages/${r.id}` as any)}
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>Message</Text>
              </Pressable>

              <Pressable testID="profile-support-button" onPress={() => setChoosingInterval(true)} style={styles.iconBtn}>
                <Icon name="heart-outline" color={colors.ink} size={20} />
              </Pressable>
            </>
          ) : (
            <View style={{ flex: 1, alignItems: "center", marginTop: 12 }}>
              <Text style={styles.meta}>Sign in to follow or support this reporter.</Text>
            </View>
          )}
        </View>

        {/* Content Tabs & Grid */}
        <View style={styles.contentTabs}>
          <Pressable onPress={() => setActiveTab("grid")} style={[styles.tab, activeTab === "grid" && styles.activeTab]}>
            <Icon name="grid-outline" color={activeTab === "grid" ? colors.ink : colors.muted} size={24} />
          </Pressable>
          <Pressable onPress={() => setActiveTab("video")} style={[styles.tab, activeTab === "video" && styles.activeTab]}>
            <Icon name="videocam-outline" color={activeTab === "video" ? colors.ink : colors.muted} size={24} />
          </Pressable>
        </View>

        {/* Grid Area */}
        <View style={styles.grid}>
          {data.posts.filter((p) => activeTab === "grid" || p.kind === "video").length === 0 ? (
            <View style={{ width: "100%", padding: 32, alignItems: "center" }}>
              <EmptyState title="No posts yet" body="This reporter hasn't published anything here." icon="images-outline" />
            </View>
          ) : (
            data.posts
              .filter((p) => activeTab === "grid" || p.kind === "video")
              .map((p) => {
                let mediaArr = p.media;
                if (typeof mediaArr === "string") {
                  try {
                    mediaArr = JSON.parse(mediaArr);
                  } catch {
                    mediaArr = [];
                  }
                }
                const firstMedia =
                  Array.isArray(mediaArr) && mediaArr.length > 0 && typeof mediaArr[0] === "object" ? mediaArr[0] : null;
                const isVideo = p.kind === "video" || firstMedia?.kind === "video";

                if (isVideo && firstMedia?.playback_id) {
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() =>
                        setActiveReel({
                          id: p.id,
                          title: p.title,
                          body: p.body,
                          reporter_name: r.name,
                          playback_id: firstMedia.playback_id as string,
                        })
                      }
                      style={styles.gridItem}
                    >
                      <View style={styles.gridItemInner}>
                        <Image
                          source={{
                            uri: `https://image.mux.com/${firstMedia.playback_id}/thumbnail.jpg?width=400&height=711&fit_mode=smartcrop`,
                          }}
                          style={StyleSheet.absoluteFillObject}
                          contentFit="cover"
                        />
                        <View style={styles.gridVideoBadge}>
                          <Icon name="play" color="#fff" size={12} />
                        </View>
                      </View>
                    </Pressable>
                  );
                }

                return (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push({ pathname: `${routePrefix}/post/[id]` as any, params: { id: p.id } })}
                    style={styles.gridItem}
                  >
                    <View style={styles.gridItemInner}>
                      {firstMedia?.playback_id ? (
                        <Image
                          source={{
                            uri: `https://image.mux.com/${firstMedia.playback_id}/thumbnail.jpg?width=400&height=711&fit_mode=smartcrop`,
                          }}
                          style={StyleSheet.absoluteFillObject}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{ flex: 1, backgroundColor: colors.surface, padding: 8, overflow: "hidden" }}>
                          <Text style={{ fontSize: 10, fontWeight: "800", color: colors.muted }}>{p.kind.toUpperCase()}</Text>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink, marginTop: 4 }} numberOfLines={3}>
                            {p.title}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })
          )}
        </View>
      </ScrollView>

      <SupportChoiceSheet
        visible={choosingInterval}
        reporterName={r.name}
        onDismiss={() => setChoosingInterval(false)}
        onChoose={startCheckout}
      />

      <RazorpayCheckout
        visible={!!checkout}
        order={checkout}
        reporterName={r.name}
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

      <ReelModal reel={activeReel} onClose={() => setActiveReel(null)} />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.paper },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    scroll: { paddingBottom: 60 },
    topHeader: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    username: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.ink,
    },
    profileHead: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      marginTop: 12,
    },
    avatarContainer: {
      marginRight: 24,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    avatarText: {
      color: colors.paper,
      fontSize: 32,
      fontWeight: "800",
    },
    statsContainer: {
      flex: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    statBox: {
      alignItems: "center",
    },
    statNumber: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.ink,
    },
    statLabel: {
      fontSize: 13,
      color: colors.ink,
      marginTop: 2,
    },
    bioSection: {
      paddingHorizontal: 16,
      marginTop: 12,
    },
    bioName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.ink,
      marginBottom: 2,
    },
    bioText: {
      fontSize: 14,
      color: colors.ink,
      lineHeight: 20,
    },
    meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
    liveBanner: {
      backgroundColor: colors.red,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      marginHorizontal: 16,
      marginTop: 16,
    },
    liveBannerDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: colors.surface },
    liveBannerText: { color: colors.surface, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
    actionButtons: {
      flexDirection: "row",
      paddingHorizontal: 16,
      marginTop: 16,
      gap: 8,
    },
    actionBtn: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
    },
    followingBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
    actionBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.ink,
    },
    dropdownMenu: {
      position: "absolute",
      top: 40,
      left: 0,
      right: 0,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 5,
      zIndex: 100,
    },
    dropdownItem: {
      padding: 12,
      alignItems: "center",
    },
    dropdownItemText: {
      fontSize: 14,
      fontWeight: "700",
    },
    iconBtn: {
      backgroundColor: colors.surface,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    contentTabs: {
      flexDirection: "row",
      marginTop: 24,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
    },
    activeTab: {
      borderBottomWidth: 1,
      borderBottomColor: colors.ink,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 2,
      width: "100%",
    },
    gridItem: {
      width: "33.333%",
      aspectRatio: 9 / 16,
      padding: 1.5,
      backgroundColor: colors.paper,
    },
    gridItemInner: {
      flex: 1,
      width: "100%",
      height: "100%",
      backgroundColor: colors.dark,
      position: "relative",
      overflow: "hidden",
      borderRadius: 4,
    },
    gridVideoBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      backgroundColor: "rgba(0, 0, 0, 0.65)",
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
  });
