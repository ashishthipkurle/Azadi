import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { API, TOKEN_KEY, apiGet, apiPost } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { useE2EE } from "@/src/hooks/use-e2ee";
import { Icon } from "@/src/ui";
import { getLocalMessages, saveLocalMessages, getCachedMedia } from "@/src/utils/local-db";
import { generateMediaKey, encryptMediaData, decryptMediaData } from "@/src/utils/e2e-crypto";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  encrypted: boolean;
  read: boolean;
  created_at: string;
};

// Component to handle offline media caching and encrypted media decryption
function CachedImage({
  url,
  style,
  contentFit,
  mediaKey,
}: {
  url: string;
  style: any;
  contentFit: string;
  mediaKey?: string;
}) {
  const [localUri, setLocalUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (mediaKey) {
          // Encrypted media: download raw bytes, decrypt, write to temp file
          const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || "";
          const encryptedB64 = await FileSystem.readAsStringAsync(
            await getCachedMedia(url),
            { encoding: "base64" as any }
          ).catch(async () => {
            const tmpPath = `${cacheDir}enc_${Date.now()}`;
            await FileSystem.downloadAsync(url, tmpPath);
            return await FileSystem.readAsStringAsync(tmpPath, { encoding: "base64" as any });
          });

          const decryptedB64 = await decryptMediaData(encryptedB64, mediaKey);
          const decPath = `${cacheDir}dec_${Date.now()}.jpg`;
          await FileSystem.writeAsStringAsync(decPath, decryptedB64, { encoding: "base64" as any });
          if (active) setLocalUri(decPath);
        } else {
          // Unencrypted media
          const cached = await getCachedMedia(url);
          if (active) setLocalUri(cached);
        }
      } catch (e) {
        console.error("Media load/decrypt failed:", e);
        if (active) setLocalUri(url);
      }
    })();
    return () => {
      active = false;
    };
  }, [url, mediaKey]);

  if (!localUri) {
    return (
      <View style={[style, { backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="small" />
      </View>
    );
  }
  return <Image source={{ uri: localUri }} style={style} contentFit={contentFit as any} />;
}

export default function ChatScreen() {
  const { id: otherId, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user, ready } = useAuth();
  const { encrypt, decrypt, isReady, hasE2EE } = useE2EE();

  const [messages, setMessages] = useState<Message[]>([]);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<{ name: string; avatar_url?: string } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // Monitor keyboard display to ensure input is never obscured on Android
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
    });

    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (ready && !user) {
    return <Redirect href="/" />;
  }

  const load = useCallback(async () => {
    try {
      if (!user) return;
      const [data, uData] = await Promise.all([
        apiGet<Message[]>(`/messages/${otherId}`),
        apiGet<{ name: string; avatar_url?: string }>(`/users/${otherId}/basic`).catch(() => null),
      ]);

      // Save pulled messages to SQLite local DB
      saveLocalMessages(
        data.map((m) => ({ ...m, encrypted: Boolean(m.encrypted) })),
        user.id
      ).catch(console.error);

      setMessages((prev) => {
        const dataIds = new Set(data.map((m) => m.id));
        const missingLocals = prev.filter((m) => !dataIds.has(m.id));
        const merged = [...data, ...missingLocals];
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return merged;
      });
      if (uData) setOtherUser(uData);
    } catch {
      // Offline mode fallback handled by SQLite
    } finally {
      setLoading(false);
    }
  }, [otherId, user]);

  useEffect(() => {
    // 1. Instantly load messages from SQLite cache on mount
    if (user) {
      getLocalMessages(otherId)
        .then((local) => {
          if (local.length > 0) {
            setMessages(local.reverse());
          }
        })
        .catch(console.error);
    }

    // 2. Poll server for updates
    load();
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, [load, otherId, user]);

  // Handle decryption
  useEffect(() => {
    if (!user?.id) return;
    messages.forEach(async (msg) => {
      if (msg.encrypted && !decryptedMessages[msg.id]) {
        try {
          let pt = "";
          try {
            const parsed = JSON.parse(msg.body);
            if (parsed.r && parsed.s) {
              const cipher = msg.sender_id === user.id ? parsed.s : parsed.r;
              pt = await decrypt(cipher);
            } else {
              pt = await decrypt(msg.body);
            }
          } catch {
            if (msg.sender_id === user.id) {
              setDecryptedMessages((prev) => ({ ...prev, [msg.id]: "🔒 Sent Securely" }));
              return;
            } else {
              pt = await decrypt(msg.body);
            }
          }
          setDecryptedMessages((prev) => ({ ...prev, [msg.id]: pt }));
        } catch {
          // If local decrypt fails (e.g. key mismatch), show message as is or generic label
          setDecryptedMessages((prev) => ({ ...prev, [msg.id]: msg.body || "🔒 Message" }));
        }
      }
    });
  }, [messages, decrypt, decryptedMessages, user?.id]);

  const sendMessage = async (textMessage: string) => {
    const text = textMessage.trim();
    if (text.length === 0 || !user?.id) return;
    setSending(true);

    // 1. Optimistic update (instantaneous UI response)
    const tempId = "temp-" + Date.now();
    const tempMsg: Message = {
      id: tempId,
      sender_id: user.id,
      receiver_id: otherId,
      body: text,
      encrypted: hasE2EE,
      read: false,
      created_at: new Date().toISOString(),
    };

    setDecryptedMessages((prev) => ({ ...prev, [tempId]: text }));
    setMessages((prev) => [...prev, tempMsg]);

    // 2. Encrypt if E2EE is available, otherwise send directly (backend encrypts at rest)
    let ciphertext = text;
    let encrypted = false;
    if (hasE2EE) {
      try {
        const cipherForRecipient = await encrypt(text, otherId);
        const cipherForSender = await encrypt(text, user.id);
        ciphertext = JSON.stringify({ r: cipherForRecipient, s: cipherForSender });
        encrypted = true;
      } catch {
        ciphertext = text;
        encrypted = false;
      }
    }

    // 3. Send to backend
    try {
      const msg = await apiPost<Message>(`/messages/${otherId}`, { body: ciphertext, encrypted });
      setDecryptedMessages((prev) => ({ ...prev, [msg.id]: text }));
      setMessages((prev) => {
        const hasTemp = prev.some((m) => m.id === tempId);
        if (hasTemp) return prev.map((m) => (m.id === tempId ? msg : m));
        const hasMsg = prev.some((m) => m.id === msg.id);
        if (hasMsg) return prev;
        return [...prev, msg];
      });
    } catch (e) {
      console.error("Message send failed:", e);
      // Rollback on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (sending || body.trim().length === 0) return;
    const text = body;
    setBody("");
    await sendMessage(text);
  };

  const attachMedia = async () => {
    if (sending) return;

    // 1. Request media permissions
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        alert("Please allow photo & video access in Settings to attach media.");
      } else {
        alert("Photo access is needed to attach media to your messages.");
      }
      return;
    }

    // 2. Launch library picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setSending(true);

    try {
      const token = await storage.secureGet(TOKEN_KEY, "");
      let publicUrl: string | null = null;
      let mediaKey: string | undefined = undefined;

      // Method A: Direct multipart upload
      try {
        const formData = new FormData();
        formData.append("file", {
          uri: asset.uri,
          name: asset.fileName || `media_${Date.now()}.jpg`,
          type: asset.mimeType || "image/jpeg",
        } as any);

        const uploadRes = await fetch(`${API}/storage/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (uploadRes.ok) {
          const upData = await uploadRes.json();
          publicUrl = upData.public_url || upData.url;
        }
      } catch (errDirect) {
        console.warn("Direct storage upload failed, attempting presigned fallback:", errDirect);
      }

      // Method B: Presigned storage upload fallback
      if (!publicUrl) {
        const filename = (asset.fileName || `media_${Date.now()}`) + ".jpg";
        const { upload_url, public_url } = await apiPost<{ upload_url: string; public_url: string }>(
          "/storage/upload-url",
          { filename, content_type: asset.mimeType || "image/jpeg" }
        );

        await FileSystem.uploadAsync(upload_url, asset.uri, {
          httpMethod: "PUT",
          headers: { "Content-Type": asset.mimeType || "image/jpeg" },
        });

        publicUrl = public_url;
      }

      if (!publicUrl) {
        throw new Error("Could not obtain a public URL for the uploaded media.");
      }

      // If E2EE is available, encrypt media key into payload
      if (hasE2EE) {
        try {
          mediaKey = generateMediaKey();
          await sendMessage(`[EMEDIA] ${publicUrl} ${mediaKey}`);
          return;
        } catch {
          // Fall through to standard media
        }
      }

      // Standard media message
      await sendMessage(`[MEDIA] ${publicUrl}`);
    } catch (e) {
      console.error("Media upload failed:", e);
      alert("Failed to upload media. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const keyboardContainerStyle =
    Platform.OS === "android"
      ? { flex: 1, marginBottom: keyboardHeight }
      : { flex: 1 };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={12}>
            <Icon name="chevron-back" color={colors.ink} size={22} />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {otherUser?.avatar_url ? (
              <Image source={{ uri: otherUser.avatar_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
            ) : (
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: colors.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="person" color={colors.muted} size={18} />
              </View>
            )}
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink }}>
              {otherUser?.name || name || "Chat"}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {hasE2EE && (
            <View style={{ marginRight: 8 }}>
              <Icon name="lock-closed" color={colors.muted} size={14} />
            </View>
          )}
        </View>
      </View>

      {/* Main Content & Input with Android + iOS Keyboard Resilience */}
      <KeyboardAvoidingView
        style={keyboardContainerStyle}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.red} />
          </View>
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
              const dec = item.encrypted ? decryptedMessages[item.id] || "🔒 Decrypting..." : item.body;

              const isEncMedia = dec.startsWith("[EMEDIA] ");
              const isLegacyMedia = dec.startsWith("[MEDIA] ");
              const isMedia = isEncMedia || isLegacyMedia;
              let mediaUrl: string | null = null;
              let mediaKey: string | undefined = undefined;

              if (isEncMedia) {
                const parts = dec.substring(9).split(" ");
                mediaUrl = parts[0];
                mediaKey = parts[1];
              } else if (isLegacyMedia) {
                mediaUrl = dec.substring(8);
              }

              return (
                <View
                  style={{
                    alignSelf: isMine ? "flex-end" : "flex-start",
                    backgroundColor: isMine ? colors.ink : colors.surface,
                    borderWidth: isMine ? 0 : 1,
                    borderColor: colors.line,
                    paddingHorizontal: isMedia ? 4 : 16,
                    paddingVertical: isMedia ? 4 : 12,
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
                    overflow: "hidden",
                  }}
                >
                  {isMedia ? (
                    <Pressable onPress={() => setFullscreenImage(mediaUrl)}>
                      <CachedImage
                        url={mediaUrl as string}
                        style={{ width: 200, height: 200, borderRadius: 16 }}
                        contentFit="cover"
                        mediaKey={mediaKey}
                      />
                    </Pressable>
                  ) : (
                    <Text style={{ color: isMine ? "#fff" : colors.ink, fontSize: 15, lineHeight: 20 }}>{dec}</Text>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 4,
                      marginRight: isMedia ? 8 : 0,
                      alignSelf: "flex-end",
                    }}
                  >
                    <Text style={{ color: isMine ? "rgba(255,255,255,0.7)" : colors.muted, fontSize: 10 }}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {isMine && (
                      <Icon
                        name={isTemp ? "time-outline" : item.read ? "checkmark-done" : "checkmark"}
                        color={isTemp ? "rgba(255,255,255,0.5)" : item.read ? "#4ADE80" : "rgba(255,255,255,0.7)"}
                        size={12}
                      />
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Bottom Input Row */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.surface,
            alignItems: "center",
          }}
        >
          {/* Paperclip Media Button */}
          <Pressable
            testID="chat-attach-button"
            onPress={attachMedia}
            disabled={sending}
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: sending ? 0.5 : 1,
            }}
          >
            <Icon name="attach" color={colors.ink} size={26} />
          </Pressable>

          {/* Text Input Pill */}
          <View
            style={{
              flex: 1,
              backgroundColor: colors.paper,
              borderRadius: 24,
              minHeight: 44,
              paddingHorizontal: 16,
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <TextInput
              testID="chat-input"
              style={
                {
                  flex: 1,
                  margin: 0,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: colors.ink,
                  outlineStyle: "none",
                } as any
              }
              placeholder="Type a message..."
              placeholderTextColor={colors.muted}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={1000}
            />
          </View>

          {/* Send Button */}
          <Pressable
            testID="chat-send-button"
            onPress={send}
            disabled={body.trim().length === 0 || sending}
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: body.trim().length > 0 ? colors.ink : colors.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ marginLeft: 3 }}>
                <Icon name="send" color={body.trim().length > 0 ? "#fff" : colors.muted} size={18} />
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Fullscreen Image Viewer Modal */}
      <Modal
        visible={!!fullscreenImage}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" }}>
          <Pressable
            onPress={() => setFullscreenImage(null)}
            style={{ position: "absolute", top: 50, right: 20, zIndex: 10, padding: 12 }}
          >
            <Icon name="close" color="#fff" size={28} />
          </Pressable>
          {fullscreenImage && (
            <Image
              source={{ uri: fullscreenImage }}
              style={{ width: "90%", height: "70%", borderRadius: 8 }}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.paper },
    header: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
  });
