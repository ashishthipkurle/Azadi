import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { apiGet, apiPost, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, EmptyState, Icon, Toast } from "@/src/ui";


export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ id: string; name: string; avatar_url?: string; role: string } | null>(null);
  const [friendStatus, setFriendStatus] = useState<"none" | "pending" | "friends">("none");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<any>(`/users/${id}`);
      setData(res.user);
      setFriendStatus(res.friend_status || "none");
    } catch (e) {
      setToast({ message: "Could not load user profile.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const sendFriendRequest = async () => {
    if (!user) return;
    setRequesting(true);
    try {
      await apiPost(`/friends/request/${id}`);
      setFriendStatus("pending");
      setToast({ message: "Friend request sent!", tone: "success" });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to send request.";
      setToast({ message: msg, tone: "error" });
    } finally {
      setRequesting(false);
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

  if (!data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 20 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Icon name="chevron-back" color={colors.ink} />
            <Text style={{ color: colors.ink, fontWeight: "700" }}>Back</Text>
          </Pressable>
        </View>
        <EmptyState title="User not found" body="This user does not exist or was removed." icon="person-outline" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 20 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="chevron-back" color={colors.ink} />
          <Text style={{ color: colors.ink, fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ alignItems: "center", marginTop: 20 }}>
          {data.avatar_url ? (
            <Image source={{ uri: data.avatar_url }} style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 16 }} />
          ) : (
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 40, fontWeight: "800", color: colors.ink }}>{data.name[0]}</Text>
            </View>
          )}
          <Text style={{ fontSize: 24, fontWeight: "800", color: colors.ink }}>{data.name}</Text>
          <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>Reader</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 32 }}>
          {user?.id !== id && (
            <>
              <View style={{ flex: 1 }}>
                <Button 
                  onPress={friendStatus === "none" ? sendFriendRequest : () => {}} 
                  tone="dark" 
                  disabled={friendStatus !== "none"}
                  icon={friendStatus === "friends" ? "checkmark" : friendStatus === "pending" ? "time" : "person-add"}
                  loading={requesting}
                >
                  {friendStatus === "friends" ? "Friends" : friendStatus === "pending" ? "Requested" : "Add Friend"}
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button onPress={() => router.push(`/messages/${id}` as any)} tone="outline" icon="chatbubbles-outline">
                  Message
                </Button>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  center: { flex: 1, alignItems: "center", justifyContent: "center" }
});
