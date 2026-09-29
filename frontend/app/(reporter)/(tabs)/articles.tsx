import { useCallback, useEffect, useState, useRef } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { apiGet, apiGetPaginated } from "@/src/api";
import { Post } from "@/src/types";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

export default function Articles() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMoreRef = useRef(true);

  const load = useCallback(async () => {
    try {
      // For now, let's just fetch dispatches as articles
      const p = await apiGet<Post[]>(`/feed?kind=dispatch`).catch(() => [] as Post[]);
      setPosts(p);
    } catch {
      // quiet fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || posts.length === 0 || !hasMoreRef.current) return;
    const last = posts[posts.length - 1];
    setLoadingMore(true);
    try {
      const more = await apiGetPaginated<Post[]>(`/feed`, "before", last.created_at + "&kind=dispatch");
      if (more.length === 0) {
        hasMoreRef.current = false;
      } else if (more.length > 0) {
        setPosts((prev) => [...prev, ...more]);
      }
    } catch {
    } finally {
      setLoadingMore(false);
    }
  };

  const renderItem = ({ item }: { item: Post }) => (
    <View style={styles.post}>
      <Text style={styles.postTitle}>{item.title}</Text>
      <Text style={styles.postBody}>{item.body}</Text>
      <View style={styles.postFooter}>
        <Text style={styles.byline}>{item.reporter_name}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Articles</Text>
      </View>
      
      {posts.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Icon name="document-text-outline" color={colors.muted} size={48} />
          <Text style={styles.emptyTitle}>No articles yet.</Text>
          <Text style={styles.emptyBody}>Check back later for written dispatches.</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }} tintColor={colors.red} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { color: colors.ink, fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  list: { paddingBottom: 60 },
  post: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  postTitle: { color: colors.ink, fontSize: 22, lineHeight: 26, fontWeight: "800", letterSpacing: -0.5 },
  postBody: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  postFooter: { marginTop: 18, flexDirection: "row" },
  byline: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
  },
  emptyBody: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
  }
});
