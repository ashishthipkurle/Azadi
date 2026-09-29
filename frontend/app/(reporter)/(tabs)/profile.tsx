import { useRouter } from "expo-router";
import { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, Dimensions, ActivityIndicator } from "react-native";
const { width: windowWidth } = Dimensions.get("window");
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon, EmptyState } from "@/src/ui";
import { apiGet } from "@/src/api";
import { MediaPlayer } from "@/src/media-player";
import { shareProfile } from "@/src/share";

export default function Profile() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"grid" | "video">("grid");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiGet(`/reporters/${user.id}`);
      setData(res);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.red} />
        </View>
      </SafeAreaView>
    );
  }

  const r = data?.reporter || user;
  const posts = data?.posts || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topHeader}>
        {/* Left Side: Create Button */}
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <Pressable onPress={() => {
            if (user?.role === "reporter") {
              router.push("/(reporter)/studio");
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

        {/* Right Side: Search and Notifications and Menu */}
        <View style={{ flex: 1, flexDirection: "row", gap: 16, alignItems: "center", justifyContent: "flex-end" }}>
          <Pressable onPress={() => router.push("/(reporter)/search")}>
            <Icon name="search-outline" color={colors.ink} size={24} />
          </Pressable>
          <Pressable onPress={() => router.push("/(reporter)/notifications")}>
            <Icon name="notifications-outline" color={colors.ink} size={24} />
          </Pressable>
          <Pressable onPress={() => router.push("/settings")}>
            <Icon name="menu-outline" color={colors.ink} size={28} />
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
            {r?.avatar_url ? (
              <Image source={{ uri: r.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }]}>
                <Text style={styles.avatarText}>{r?.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{posts.length}</Text>
              <Text style={styles.statLabel}>posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{r?.followers || 0}</Text>
              <Text style={styles.statLabel}>followers</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{r?.following || 0}</Text>
              <Text style={styles.statLabel}>following</Text>
            </View>
          </View>
        </View>

        {/* Bio Section */}
        <View style={styles.bioSection}>
          <Text style={styles.bioName}>{r?.name}</Text>
          <Text style={styles.bioText}>{r?.bio || "Independent reporting from the ground."}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable onPress={() => router.push("/profile-edit")} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Edit profile</Text>
          </Pressable>
          <Pressable onPress={() => shareProfile("Check out my reporter profile on Azadi!", `https://azadi.freepress.in/reporters/${user?.id}`)} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Share profile</Text>
          </Pressable>
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
          {posts.filter((p: any) => activeTab === "grid" || p.kind === "video").length === 0 ? (
            <View style={{ width: "100%", padding: 32, alignItems: "center" }}>
              <EmptyState title="No posts yet" body="You haven't published anything here." icon="images-outline" />
            </View>
          ) : (
            posts.filter((p: any) => activeTab === "grid" || p.kind === "video").map((p: any) => {
              // Safely parse media — backend may return it as a JSON string
              let mediaArr = p.media;
              if (typeof mediaArr === "string") {
                try { mediaArr = JSON.parse(mediaArr); } catch { mediaArr = []; }
              }
              const firstMedia = Array.isArray(mediaArr) && mediaArr.length > 0 && typeof mediaArr[0] === "object" ? mediaArr[0] : null;
              return (
                <Pressable key={p.id} onPress={() => router.push({ pathname: "/(reporter)/post/[id]", params: { id: p.id } })} style={styles.gridItem}>
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
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 40 },
  topHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: { color: colors.ink, fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  signalDot: { width: 6, height: 6, borderRadius: 8, backgroundColor: colors.red, marginLeft: 4, marginTop: 6 },
  kicker: { fontSize: 9, letterSpacing: 2, color: colors.muted, marginTop: 4, fontWeight: "800" },
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
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
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
