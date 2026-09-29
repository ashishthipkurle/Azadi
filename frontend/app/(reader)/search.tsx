import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiGet } from "@/src/api";
import {   } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

type PostResult = {
  id: string;
  title: string;
  reporter_name: string;
  kind: string;
  created_at: string;
};

type UserResult = {
  id: string;
  name: string;
  avatar_url?: string;
};

type ReporterResult = {
  id: string;
  name: string;
  beat: string;
};

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [posts, setPosts] = useState<PostResult[]>([]);
  const [reporters, setReporters] = useState<ReporterResult[]>([]);
  const [users, setUsers] = useState<UserResult[]>([]);

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const search = useCallback(async () => {
    if (!debouncedQuery) {
      setPosts([]);
      setReporters([]);
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet<{ posts: PostResult[]; reporters: ReporterResult[]; users: UserResult[] }>(`/search?q=${encodeURIComponent(debouncedQuery)}`);
      setPosts(data.posts);
      setReporters(data.reporters);
      setUsers(data.users || []);
    } catch (e) {
      console.error("Search failed:", e);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    search();
  }, [search]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" color={colors.ink} />
        </Pressable>
        <TextInput
          style={styles.searchInput}
          placeholder="Search dispatches and reporters..."
          placeholderTextColor="#8A8F91"
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={12}>
            <Icon name="close-circle" color={colors.muted} size={18} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.red} />
          </View>
        ) : debouncedQuery && posts.length === 0 && reporters.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.meta}>No results found for &quot;{debouncedQuery}&quot;</Text>
          </View>
        ) : (
          <>
            {reporters.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.overline}>REPORTERS</Text>
                {reporters.map(r => (
                  <Pressable
                    key={r.id}
                    onPress={() => router.push(`/(reader)/reporter/${r.id}`)}
                    style={styles.resultRow}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{r.name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultTitle}>{r.name}</Text>
                      <Text style={styles.meta}>{r.beat}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {users.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>READERS</Text>
              {users.map(u => (
                <Pressable key={u.id} style={styles.reporterItem} onPress={() => router.push(`/user/${u.id}` as any)}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{u.name.charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reporterName}>{u.name}</Text>
                    <Text style={styles.reporterBeat}>Reader</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          
          {posts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.overline}>DISPATCHES</Text>
                {posts.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(`/(reader)/post/${p.id}`)}
                    style={styles.resultRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultTitle} numberOfLines={2}>{p.title}</Text>
                      <Text style={styles.meta}>
                        {p.kind.toUpperCase()} · By {p.reporter_name}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 200 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: { padding: 4 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    height: 40,
    outlineStyle: "none",
  } as any,
  content: { padding: 20, paddingBottom: 60 },
  section: { marginBottom: 30 },
  overline: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginBottom: 12 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resultTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", marginBottom: 4 },
  meta: { color: colors.muted, fontSize: 13 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.surface, fontWeight: "800", fontSize: 16 },
});
