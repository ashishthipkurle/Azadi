// Reporter profile — shows bio, follower / support totals, follow toggle, all
// dispatches, and a one-tap ₹7 support entry point.
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
import { Alert, ActionSheetIOS, Platform, Dimensions } from "react-native";
const { width: windowWidth } = Dimensions.get("window");

import { apiDelete, apiGet, apiPost, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { MediaPlayer, type MediaAttachment } from "@/src/media-player";
import { RazorpayCheckout, type CheckoutOrder } from "@/src/razorpay";
import { SupportChoiceSheet, type SupportInterval } from "@/src/support-choice";
import { sharePost } from "@/src/share";
import { useTheme } from "@/src/hooks/use-theme";
import { EmptyState, Icon, Toast, ConfirmModal } from "@/src/ui";

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

export default function ReporterProfile() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<ProfileResp | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const [checkout, setCheckout] = useState<CheckoutOrder | null>(null);
  const [choosingInterval, setChoosingInterval] = useState(false);
  const [activeTab, setActiveTab] = useState<"grid" | "video">("grid");
  const [showDropdown, setShowDropdown] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<ProfileResp>(`/reporters/${id}`);
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
    setShowDropdown(false);
    try {
      const res = await apiDelete<{ followers: number }>(`/reporters/${id}/follow`);
      setData({ ...data, reporter: { ...data.reporter, is_following: false, followers: res.followers } });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Unfollow action failed.";
      setToast({ message, tone: "error" });
    }
  };

  const toggleFollow = async () => {
    if (!data) return;
    try {
      const res = await apiPost<{ followers: number }>(`/reporters/${id}/follow`);
      setData({ ...data, reporter: { ...data.reporter, is_following: true, followers: res.followers } });
      setToast({ message: `Following ${data.reporter.name}.`, tone: "success" });
    } catch (e) {
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

        {/* Right Side: Burger Menu for Public Actions */}
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
              <View style={[styles.avatar, { backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }]}>
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
          <Pressable style={styles.liveBanner} onPress={() => router.push({ pathname: "/(reader)/live/[room]", params: { room: r.live_room } })}>
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

              <Pressable testID="profile-message-button" onPress={() => router.push(`/messages/${r.id}` as any)} style={styles.actionBtn}>
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
            data.posts.filter((p) => activeTab === "grid" || p.kind === "video").map((p) => {
              let mediaArr = p.media;
              if (typeof mediaArr === "string") {
                try { mediaArr = JSON.parse(mediaArr); } catch { mediaArr = []; }
              }
              const firstMedia = Array.isArray(mediaArr) && mediaArr.length > 0 && typeof mediaArr[0] === "object" ? mediaArr[0] : null;
              return (
                <Pressable key={p.id} onPress={() => router.push({ pathname: "/(reader)/post/[id]", params: { id: p.id } })} style={styles.gridItem}>
                  {firstMedia?.playback_id ? (
                    <MediaPlayer media={firstMedia} fill={true} radius={0} />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: colors.surface, padding: 8, overflow: "hidden" }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: colors.muted }}>{p.kind.toUpperCase()}</Text>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink, marginTop: 4 }} numberOfLines={3}>{p.title}</Text>
                    </View>
                  )}
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
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
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
    gap: 2,
    marginTop: 2,
  },
  gridItem: {
    width: (windowWidth - 4) / 3,
    height: (windowWidth - 4) / 3,
  },
});
