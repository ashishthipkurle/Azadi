import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View, Dimensions, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiGet } from "@/src/api";

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
};

export type LiveSession = {
  room: string;
  reporter_id: string;
  reporter_name: string;
  title: string;
};

import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

const { height, width } = Dimensions.get("window");

export default function Reels() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"videos" | "live">("videos");

  const load = useCallback(async () => {
    try {
      const [p, live] = await Promise.all([
        apiGet<Post[]>(`/feed?kind=video`).catch(() => [] as Post[]),
        apiGet<LiveSession[]>("/live/sessions").catch(() => [] as LiveSession[]),
      ]);
      setPosts(p);
      setLiveSessions(live);
    } catch {
      // quiet fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renderItem = ({ item }: { item: any }) => {
    if (activeTab === "live") {
      const live = item as LiveSession;
      return (
        <View style={styles.reelContainer}>
          <View style={[styles.videoPlaceholder, { backgroundColor: "#220000" }]}>
            <Icon name="radio" color={colors.red} size={64} />
            <Text style={styles.videoTitle}>{live.title}</Text>
            <Text style={styles.videoBody}>{live.reporter_name}</Text>
            <Pressable 
              style={[styles.liveButton, { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12 }]}
              onPress={() => router.push({
                pathname: "/(reporter)/live/[room]",
                params: { room: live.room, title: live.title, reporter: live.reporter_name },
              })}
            >
              <Text style={[styles.liveButtonText, { fontSize: 16 }]}>Watch Live Stream</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    
    const post = item as Post;
    return (
      <View style={styles.reelContainer}>
        {/* We would render a video player here for item.media[0] */}
        <View style={styles.videoPlaceholder}>
          <Icon name="play-circle-outline" color="#fff" size={64} />
          <Text style={styles.videoTitle}>{post.title}</Text>
          <Text style={styles.videoBody}>{post.body}</Text>
        </View>
        <View style={styles.overlayRight}>
          <View style={styles.actionButton}>
            <Icon name="heart-outline" color="#fff" size={28} />
          </View>
          <View style={styles.actionButton}>
            <Icon name="chatbubble-outline" color="#fff" size={26} />
          </View>
          <View style={styles.actionButton}>
            <Icon name="arrow-redo-outline" color="#fff" size={28} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.safe}>
      <View style={styles.segmentContainer}>
        <Pressable 
          style={[styles.segmentBtn, activeTab === "videos" && styles.segmentBtnActive]} 
          onPress={() => setActiveTab("videos")}
        >
          <Text style={[styles.segmentText, activeTab === "videos" && styles.segmentTextActive]}>Video Reports</Text>
        </Pressable>
        <Pressable 
          style={[styles.segmentBtn, activeTab === "live" && styles.segmentBtnActive]} 
          onPress={() => setActiveTab("live")}
        >
          <Text style={[styles.segmentText, activeTab === "live" && styles.segmentTextActive]}>Live Streams</Text>
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
          data={activeTab === "videos" ? posts : liveSessions}
          keyExtractor={(item) => activeTab === "videos" ? item.id : item.room}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }} tintColor="#fff" />
          }
        />
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  segmentContainer: {
    position: "absolute",
    top: 60,
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
    height: height - 85, // roughly viewport minus tab bar
    width,
    backgroundColor: "#111",
    justifyContent: "flex-end",
  },
  videoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  videoTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 20,
    textAlign: "center",
  },
  videoBody: {
    color: "#ccc",
    fontSize: 15,
    marginTop: 10,
    textAlign: "center",
  },
  overlayRight: {
    position: "absolute",
    right: 16,
    bottom: 40,
    gap: 24,
    alignItems: "center",
  },
  actionButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  liveBanner: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.red,
    marginRight: 8,
  },
  liveText: {
    color: "#fff",
    fontWeight: "bold",
    flex: 1,
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
  }
});
