import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";
import { storage } from "@/src/utils/storage";

export type ReelComment = {
  id: string;
  post_id: string;
  user_name: string;
  user_id?: string;
  body: string;
  created_at: string;
};

function formatTimeAgo(isoDate: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "Recently";
  }
}

export function ReelsCommentModal({
  visible,
  post,
  onClose,
  onCommentAdded,
}: {
  visible: boolean;
  post: { id: string; title: string; reporter_name?: string } | null;
  onClose: () => void;
  onCommentAdded?: (newCount: number) => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();

  const [comments, setComments] = useState<ReelComment[]>([]);
  const [inputText, setInputText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !post?.id) return;
    let isMounted = true;

    async function loadComments() {
      const storageKey = `azadi.reels.comments.${post?.id}`;
      const cached = (await storage.getItem<ReelComment[]>(storageKey, [])) || [];
      if (isMounted && cached && cached.length > 0) {
        setComments(cached);
      }

      // Try fetching server comments
      try {
        const serverComments = await apiGet<any[]>(`/posts/${post?.id}/comments`);
        if (isMounted && Array.isArray(serverComments) && serverComments.length > 0) {
          const merged = [...serverComments];
          // Merge unique cached comments that might not be on server yet
          for (const c of cached) {
            if (!merged.some((m) => m.id === c.id)) {
              merged.push(c);
            }
          }
          setComments(merged);
          await storage.setItem(storageKey, merged);
        }
      } catch {
        // quiet fallback to local comments
      }
    }

    loadComments();
    return () => {
      isMounted = false;
    };
  }, [visible, post?.id]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !post?.id || submitting) return;

    setSubmitting(true);
    const newComment: ReelComment = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      post_id: post.id,
      user_name: user?.name || "Reader",
      user_id: user?.id,
      body: text,
      created_at: new Date().toISOString(),
    };

    const updated = [newComment, ...comments];
    setComments(updated);
    setInputText("");
    setSubmitting(false);

    // Save locally
    const storageKey = `azadi.reels.comments.${post.id}`;
    await storage.setItem(storageKey, updated);
    onCommentAdded?.(updated.length);

    // Sync to backend if available
    try {
      await apiPost(`/posts/${post.id}/comments`, { body: text });
    } catch {
      // quiet fallback
    }
  };

  if (!post) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.backdropClickable} onPress={onClose} />
        
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[
            styles.sheetContainer,
            { maxHeight: windowHeight * 0.72, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          {/* Top Grab Handle */}
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              Comments {comments.length > 0 ? `· ${comments.length}` : ""}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Icon name="close" color="#fff" size={22} />
            </Pressable>
          </View>

          {/* Comments List */}
          <ScrollView
            style={styles.commentsList}
            contentContainerStyle={comments.length === 0 ? styles.emptyContainer : styles.commentsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {comments.length === 0 ? (
              <View style={styles.emptyView}>
                <Icon name="chatbubbles-outline" color="#555" size={48} />
                <Text style={styles.emptyTitle}>No comments yet</Text>
                <Text style={styles.emptySubtitle}>Be the first to share your thoughts on this dispatch.</Text>
              </View>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(c.user_name || "R")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.commentBodyContainer}>
                    <View style={styles.commentMetaRow}>
                      <Text style={styles.authorName}>{c.user_name || "Reader"}</Text>
                      <Text style={styles.timeAgo}>{formatTimeAgo(c.created_at)}</Text>
                    </View>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <View style={styles.userAvatarSmall}>
              <Text style={styles.userAvatarTextSmall}>
                {(user?.name || "R")[0].toUpperCase()}
              </Text>
            </View>
            <TextInput
              style={styles.textInput}
              placeholder={`Add a comment as ${user?.name ? `@${user.name.split(" ")[0]}` : "reader"}…`}
              placeholderTextColor="#888"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
            />
            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim() || submitting}
              style={[
                styles.sendBtn,
                (!inputText.trim() || submitting) && styles.sendBtnDisabled,
              ]}
              hitSlop={8}
            >
              <Icon
                name="arrow-up"
                color={inputText.trim() ? "#fff" : "#666"}
                size={20}
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.65)",
      justifyContent: "flex-end",
    },
    backdropClickable: {
      flex: 1,
    },
    sheetContainer: {
      backgroundColor: "#16181F",
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.1)",
      overflow: "hidden",
    },
    dragHandleContainer: {
      alignItems: "center",
      paddingTop: 8,
      paddingBottom: 4,
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: "rgba(255, 255, 255, 0.2)",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(255, 255, 255, 0.08)",
    },
    headerTitle: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      alignItems: "center",
      justifyContent: "center",
    },
    commentsList: {
      flex: 1,
    },
    commentsContent: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      gap: 16,
    },
    emptyContainer: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 30,
    },
    emptyView: {
      alignItems: "center",
      gap: 8,
    },
    emptyTitle: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
      marginTop: 4,
    },
    emptySubtitle: {
      color: "#888",
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
    },
    commentRow: {
      flexDirection: "row",
      gap: 12,
      alignItems: "flex-start",
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#2E3342",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "700",
    },
    commentBodyContainer: {
      flex: 1,
      gap: 4,
    },
    commentMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    authorName: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },
    timeAgo: {
      color: "#777",
      fontSize: 11,
    },
    commentBody: {
      color: "#ddd",
      fontSize: 14,
      lineHeight: 20,
    },
    inputBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
      borderTopWidth: 1,
      borderTopColor: "rgba(255, 255, 255, 0.08)",
      backgroundColor: "#16181F",
      gap: 10,
    },
    userAvatarSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.red || "#e53935",
      alignItems: "center",
      justifyContent: "center",
    },
    userAvatarTextSmall: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "700",
    },
    textInput: {
      flex: 1,
      minHeight: 40,
      maxHeight: 100,
      backgroundColor: "#232631",
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      color: "#fff",
      fontSize: 14,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.red || "#e53935",
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnDisabled: {
      backgroundColor: "#2E3342",
    },
  });
