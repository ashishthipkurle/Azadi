import { Image } from "expo-image";
import { Link, useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";



type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  user: {
    id: string;
    name: string;
    avatar_url?: string;
  };
};
type Convo = {
  other_user: {
    id: string;
    name: string;
    avatar_url?: string;
    role: string;
  };
  last_message: {
    id: string;
    body: string;
    read: boolean;
    created_at: string;
    sender_id: string;
  };
};

export default function MessagesInbox() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user } = useAuth();
    const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [data, reqs] = await Promise.all([
        apiGet<Convo[]>("/messages"),
        apiGet<{ incoming: FriendRequest[] }>("/friends/requests").catch(() => ({ incoming: [] }))
      ]);
      setConvos(data);
      setFriendRequests(reqs.incoming);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  
  const handleRequest = async (id: string, action: "accept" | "reject") => {
    try {
      await apiPost(`/friends/${action}/${id}`);
      setFriendRequests(prev => prev.filter(r => r.sender_id !== id));
      if (action === "accept") {
        // Maybe reload convos or just show toast
        load();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>Messages</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
      ) : convos.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>No messages yet.</Text>
        </View>
      ) : (
        
        <FlatList
          ListHeaderComponent={
            friendRequests.length > 0 ? (
              <View style={{ paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.muted, marginBottom: 12 }}>FRIEND REQUESTS</Text>
                {friendRequests.map(req => (
                  <View key={req.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      {req.user?.avatar_url ? (
                        <Image source={{ uri: req.user.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      ) : (
                        <Text style={{ color: "#fff", fontWeight: "700" }}>{req.user?.name[0]}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{req.user?.name}</Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable onPress={() => handleRequest(req.sender_id, "accept")} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.ink, borderRadius: 8 }}>
                        <Text style={{ color: colors.surface, fontWeight: "700", fontSize: 12 }}>Accept</Text>
                      </Pressable>
                      <Pressable onPress={() => handleRequest(req.sender_id, "reject")} style={{ paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 8 }}>
                        <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 12 }}>Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null
          }

          data={convos}
          keyExtractor={(item) => item.other_user.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const isUnread = item.last_message.sender_id === item.other_user.id && !item.last_message.read;
            return (
              <Pressable
                style={{ flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: "center" }}
                onPress={() => router.push(`/messages/${item.other_user.id}?name=${encodeURIComponent(item.other_user.name)}`)}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.muted, overflow: "hidden", marginRight: 16, alignItems: "center", justifyContent: "center" }}>
                  {item.other_user.avatar_url ? (
                    <Image source={{ uri: item.other_user.avatar_url }} style={{ width: 48, height: 48 }} />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700" }}>{item.other_user.name[0]}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>{item.other_user.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      {new Date(item.last_message.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, color: isUnread ? colors.ink : colors.muted, fontWeight: isUnread ? "700" : "400", marginTop: 4 }} numberOfLines={1}>
                    {item.last_message.body}
                  </Text>
                </View>
                {isUnread && <View style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: colors.red, marginLeft: 8 }} />}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  center: { flex: 1, alignItems: "center", justifyContent: "center" }
});
