import { useRouter } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";

import { apiGet, apiPost } from "@/src/api";
import {   } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

type Notification = {
  id: string;
  kind: string; // 'follow', 'support', 'comment', 'report'
  actor_id: string;
  actor_name: string;
  subject_id: string;
  subject_kind: string;
  message: string;
  read: boolean;
  created_at: string;
};

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<Notification[]>("/notifications");
      setNotifications(data);
      // Optimistically mark all as read
      await apiPost("/notifications/read-all", {});
    } catch (e) {
      console.error("Failed to load notifications", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePress = (n: Notification) => {
    if (n.kind === "follow" || n.kind === "support") {
      router.push(`/(reader)/reporter/${n.actor_id}`);
    } else if (n.kind === "comment" || n.subject_kind === "post") {
      router.push(`/(reader)/post/${n.subject_id}`);
    }
  };

  const getIcon = (kind: string) => {
    switch (kind) {
      case "follow": return "person-add";
      case "support": return "heart";
      case "comment": return "chatbubble";
      default: return "notifications";
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.red} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.meta}>No notifications yet.</Text>
          </View>
        ) : (
          notifications.map(n => (
            <Pressable
              key={n.id}
              onPress={() => handlePress(n)}
              style={[styles.row, !n.read && styles.rowUnread]}
            >
              <View style={styles.iconContainer}>
                <Icon name={getIcon(n.kind)} size={20} color={n.kind === "support" ? colors.red : colors.ink} />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.message}>
                  <Text style={{ fontWeight: "700" }}>{n.actor_name}</Text> {n.message.replace(n.actor_name + " ", "")}
                </Text>
                <Text style={styles.time}>{new Date(n.created_at).toLocaleDateString()}</Text>
              </View>
              {!n.read && <View style={styles.unreadDot} />}
            </Pressable>
          ))
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
    gap: 16,
  },
  backBtn: { padding: 4 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  content: { paddingBottom: 60 },
  row: {
    flexDirection: "row",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    alignItems: "center",
    gap: 16,
  },
  rowUnread: {
    backgroundColor: colors.surface,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: { flex: 1 },
  message: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  time: { color: colors.muted, fontSize: 12, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: colors.red },
  meta: { color: colors.muted, fontSize: 14 },
});
