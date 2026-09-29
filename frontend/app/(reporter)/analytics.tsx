import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiGet } from "@/src/api";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

type AnalyticsData = {
  total_reads: number;
  total_followers: number;
  total_posts: number;
  top_posts: { post_id: string; title: string; reads: number }[];
};

export default function Analytics() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<AnalyticsData>("/reporter/analytics");
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      </SafeAreaView>
    );
  }

  const maxReads = Math.max(...data.top_posts.map(p => p.reads), 1);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" color={colors.ink} />
          <Text style={styles.backText}>Studio</Text>
        </Pressable>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.overline}>ANALYTICS</Text>
        <Text style={styles.title}>Your performance</Text>

        <View style={styles.statsRow}>
          <Metric label="Followers" value={data.total_followers} />
          <Metric label="Reads" value={data.total_reads} />
          <Metric label="Posts" value={data.total_posts} />
        </View>

        <View style={styles.chartBlock}>
          <Text style={styles.chartTitle}>Top Dispatches (by reads)</Text>
          {data.top_posts.length === 0 ? (
            <Text style={styles.meta}>No reads yet.</Text>
          ) : (
            data.top_posts.map(p => (
              <View key={p.post_id} style={styles.barRow}>
                <View style={styles.barTextRow}>
                  <Text style={styles.barTitle} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.barCount}>{p.reads}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { backgroundColor: colors.red, width: `${(p.reads / maxReads) * 100}%` }]} />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, padding: 16, borderRadius: 8 }}>
      <Text style={{ color: colors.ink, fontSize: 24, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800", marginTop: 4 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", alignItems: "center" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { color: colors.ink, fontWeight: "800" },
  content: { padding: 20 },
  overline: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 8 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginBottom: 24 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 30 },
  chartBlock: { backgroundColor: colors.surface, padding: 20, borderRadius: 8 },
  chartTitle: { color: colors.ink, fontWeight: "800", marginBottom: 20 },
  barRow: { marginBottom: 16 },
  barTextRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  barTitle: { color: colors.ink, flex: 1, marginRight: 10 },
  barCount: { color: colors.muted, fontWeight: "800", fontSize: 13 },
  barTrack: { height: 8, backgroundColor: colors.line, borderRadius: 8, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 8 },
  meta: { color: colors.muted },
});
