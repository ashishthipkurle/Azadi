import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { useCallback, useEffect, useState, useRef } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { useE2EE } from "@/src/hooks/use-e2ee";
import { Icon } from "@/src/ui";


type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  encrypted?: boolean;
  read: boolean;
  created_at: string;
};

export default function ChatScreen() {
  const { id: otherId, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user, ready } = useAuth();
  const { encrypt, decrypt, isReady } = useE2EE();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<{ name: string; avatar_url?: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);

  if (ready && !user) {
    return <Redirect href="/" />;
  }

  const load = useCallback(async () => {
    try {
      const [data, uData] = await Promise.all([
        apiGet<Message[]>(`/messages/${otherId}`),
        apiGet<{ name: string; avatar_url?: string }>(`/users/${otherId}/basic`).catch(() => null)
      ]);
      setMessages(prev => {
        const tempMessages = prev.filter(m => m.id.startsWith("temp-"));
        return [...data, ...tempMessages];
      });
      if (uData) setOtherUser(uData);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [otherId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [load]);

  // Handle decryption
  useEffect(() => {
    if (!isReady || !user?.id) return;
    messages.forEach(async (msg) => {
      if (msg.encrypted && !decryptedMessages[msg.id]) {
        try {
          let pt = "";
          try {
            // Attempt to parse dual-encrypted payload
            const parsed = JSON.parse(msg.body);
            if (parsed.r && parsed.s) {
              if (msg.sender_id === user.id) {
                pt = await decrypt(parsed.s);
              } else {
                pt = await decrypt(parsed.r);
              }
            } else {
              pt = await decrypt(msg.body); // fallback
            }
          } catch (e) {
            // Not JSON, fallback to legacy
            if (msg.sender_id === user.id) {
              // Legacy messages were only encrypted for the recipient.
              // Sender cannot decrypt them.
              setDecryptedMessages(prev => ({ ...prev, [msg.id]: "🔒 Sent Securely" }));
              return;
            } else {
              pt = await decrypt(msg.body);
            }
          }
          setDecryptedMessages(prev => ({ ...prev, [msg.id]: pt }));
        } catch (err) {
          console.error("Failed to decrypt msg", msg.id, err);
          setDecryptedMessages(prev => ({ ...prev, [msg.id]: "🔒 Encrypted Message" }));
        }
      }
    });
  }, [messages, isReady, decrypt, decryptedMessages, user?.id]);

  const send = async () => {
    const text = body.trim();
    if (text.length === 0 || sending || !isReady || !user?.id) return;
    setSending(true);
    
    // 1. Optimistic update (instantaneous UI response)
    const tempId = "temp-" + Date.now();
    const tempMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: otherId,
      body: text,
      encrypted: true, // Optimistically assume success
      read: false,
      created_at: new Date().toISOString()
    };
    
    setDecryptedMessages(prev => ({ ...prev, [tempId]: text }));
    setMessages((prev) => [...prev, tempMsg]);
    setBody("");
    
    // 2. Encrypt asynchronously (might fetch public keys from network on first try)
    let ciphertext = text;
    let encrypted = false;
    try {
      const cipherForRecipient = await encrypt(text, otherId);
      const cipherForSender = await encrypt(text, user.id);
      ciphertext = JSON.stringify({ r: cipherForRecipient, s: cipherForSender });
      encrypted = true;
    } catch (e) {
      console.error("Encryption failed details:", e);
      ciphertext = text;
      encrypted = false;
    }
    
    // 3. Send to backend
    try {
      const msg = await apiPost<Message>(`/messages/${otherId}`, { body: ciphertext, encrypted });
      if (encrypted) {
        setDecryptedMessages(prev => ({ ...prev, [msg.id]: text }));
      }
      setMessages((prev) => {
        const hasTemp = prev.some(m => m.id === tempId);
        if (hasTemp) return prev.map(m => m.id === tempId ? msg : m);
        const hasMsg = prev.some(m => m.id === msg.id);
        if (hasMsg) return prev;
        return [...prev, msg];
      });
    } catch {
      // Rollback on failure
      setMessages((prev) => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.header, { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} hitSlop={12}>
            <Icon name="chevron-back" color={colors.ink} />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {otherUser?.avatar_url ? (
              <Image source={{ uri: otherUser.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
            ) : (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.line, alignItems: "center", justifyContent: "center" }}>
                <Icon name="person" color={colors.muted} size={16} />
              </View>
            )}
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink }}>
              {otherUser?.name || name || "Chat"}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {isReady && <Icon name="lock-closed" color={colors.muted} size={14} style={{ marginRight: 8 }} />}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.red} /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={[...messages].reverse()}
            keyExtractor={(item) => item.id}
            inverted={true}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => {
              const isMine = item.sender_id === user?.id;
              const isTemp = item.id.startsWith("temp-");
              return (
                <View style={{
                  alignSelf: isMine ? "flex-end" : "flex-start",
                  backgroundColor: isMine ? colors.ink : colors.surface,
                  borderWidth: isMine ? 0 : 1,
                  borderColor: colors.line,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 20,
                  borderBottomRightRadius: isMine ? 4 : 20,
                  borderBottomLeftRadius: isMine ? 20 : 4,
                  maxWidth: "80%",
                  marginBottom: 8,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05,
                  shadowRadius: 2,
                  elevation: 1,
                }}>
                  <Text style={{ color: isMine ? "#fff" : colors.ink, fontSize: 15, lineHeight: 20 }}>
                    {item.encrypted ? (decryptedMessages[item.id] || "🔒 Decrypting...") : item.body}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, alignSelf: isMine ? "flex-end" : "flex-start" }}>
                    <Text style={{ color: isMine ? "rgba(255,255,255,0.7)" : colors.muted, fontSize: 10 }}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {isMine && (
                      <Icon 
                        name={isTemp ? "time-outline" : (item.read ? "checkmark-done" : "checkmark")} 
                        color={isTemp ? "rgba(255,255,255,0.5)" : (item.read ? "#4ADE80" : "rgba(255,255,255,0.7)")} 
                        size={12} 
                      />
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
        <View style={{ flexDirection: "row", padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface, alignItems: "flex-end" }}>
          <View style={{ flex: 1, backgroundColor: colors.paper, borderRadius: 24, minHeight: 48, paddingHorizontal: 16, justifyContent: "center" }}>
            <TextInput
              style={{ flex: 1, margin: 0, paddingVertical: 12, fontSize: 15, color: colors.ink, outlineStyle: "none" } as any}
              placeholder="Type a secure message..."
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={1000}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={body.trim().length === 0 || sending || !isReady}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: body.trim().length > 0 && isReady ? colors.red : colors.muted, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="send" color="#fff" size={20} style={{ marginLeft: 4 }} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  center: { flex: 1, alignItems: "center", justifyContent: "center" }
});
