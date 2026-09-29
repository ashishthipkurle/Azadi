import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiDelete, apiGet, apiPost, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { MediaPlayer, type MediaAttachment } from "@/src/media-player";
import { RazorpayCheckout, type CheckoutOrder } from "@/src/razorpay";
import { SupportChoiceSheet, type SupportInterval } from "@/src/support-choice";
import {   } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon, Toast } from "@/src/ui";
import { sharePost } from "@/src/share";
import { HtmlBodyRenderer } from "@/src/html-body";

type Post = {
  id: string;
  reporter_id: string;
  reporter_name: string;
  verified: boolean;
  title: string;
  body: string;
  kind: string;
  location: string;
  stats: string;
  media?: MediaAttachment[];
  blocks?: any[];
  comment_count: number;
  edited_at?: string;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  user_name: string;
  body: string;
  parent_id?: string;
  created_at: string;
};

export default function PostDetailScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  const [supportTarget, setSupportTarget] = useState<{ id: string; name: string } | null>(null);
  const [checkout, setCheckout] = useState<{ order: CheckoutOrder; reporterName: string } | null>(null);
  const [reporting, setReporting] = useState<Post | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Comments state
  const [commentBody, setCommentBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, b] = await Promise.all([
        apiGet<Post>(`/posts/${id}`),
        apiGet<Comment[]>(`/posts/${id}/comments`),
        apiGet<{ post_ids: string[] }>("/bookmarks").catch(() => ({ post_ids: [] as string[] })),
      ]);
      setPost(p);
      setComments(c);
      setIsBookmarked(b.post_ids.includes(id as string));
    } catch {
      setToast({ message: "Could not load the dispatch.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleBookmark = async () => {
    if (!post) return;
    const isSaved = isBookmarked;
    setIsBookmarked(!isSaved);
    try {
      if (isSaved) await apiDelete(`/bookmarks/${post.id}`);
      else await apiPost("/bookmarks", { post_id: post.id });
      setToast({
        message: isSaved ? "Removed from your reading list." : "Saved to your reading list.",
        tone: isSaved ? "info" : "success",
      });
    } catch {
      setIsBookmarked(isSaved);
      setToast({ message: "Bookmark action failed.", tone: "error" });
    }
  };

  const startCheckout = async (amount: number, interval: SupportInterval) => {
    if (!supportTarget) return;
    try {
      const order = await apiPost<CheckoutOrder>("/support", {
        reporter_id: supportTarget.id,
        amount,
        interval,
      });
      setCheckout({ order, reporterName: supportTarget.name });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Support could not be started.";
      setToast({ message, tone: e instanceof ApiError && e.status === 503 ? "info" : "error" });
    } finally {
      setSupportTarget(null);
    }
  };

  const submitReport = async () => {
    if (!reporting || reportReason.trim().length < 3) {
      setToast({ message: "Tell us briefly what's wrong.", tone: "error" });
      return;
    }
    try {
      await apiPost("/reports", { post_id: reporting.id, reason: reportReason.trim() });
      setReporting(null);
      setReportReason("");
      setToast({ message: "Report sent to moderators.", tone: "success" });
    } catch {
      setToast({ message: "Report could not be sent.", tone: "error" });
    }
  };

  const submitComment = async () => {
    if (commentBody.trim().length === 0) return;
    setSubmittingComment(true);
    try {
      await apiPost(`/posts/${id}/comments`, {
        body: commentBody.trim(),
        parent_id: replyingTo?.id || null,
      });
      setCommentBody("");
      setReplyingTo(null);
      await load(); // reload comments
    } catch {
      setToast({ message: "Could not post comment.", tone: "error" });
    } finally {
      setSubmittingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await apiDelete(`/comments/${commentId}`);
      await load();
    } catch {
      setToast({ message: "Could not delete comment.", tone: "error" });
    }
  };

  if (loading || !post) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable testID="post-back" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Icon name="chevron-back" color={colors.ink} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          {loading ? <ActivityIndicator color={colors.red} /> : <Text style={styles.meta}>Post not found</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const topLevelComments = comments.filter(c => !c.parent_id);
  const repliesByParent = comments.reduce((acc, c) => {
    if (c.parent_id) {
      if (!acc[c.parent_id]) acc[c.parent_id] = [];
      acc[c.parent_id].push(c);
    }
    return acc;
  }, {} as Record<string, Comment[]>);

  const renderComment = (comment: Comment, isReply: boolean = false) => (
    <View key={comment.id} style={[styles.commentRow, isReply && styles.commentReply]}>
      <View style={styles.commentAvatar}>
        <Text style={styles.commentAvatarText}>{comment.user_name[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentAuthor}>{comment.user_name}</Text>
          <Text style={styles.meta}>{new Date(comment.created_at).toLocaleDateString()}</Text>
        </View>
        <Text style={styles.commentBody}>{comment.body}</Text>
        <View style={styles.commentActions}>
          <Pressable onPress={() => { setReplyingTo(comment); setCommentBody(""); }}>
            <Text style={styles.commentActionText}>Reply</Text>
          </Pressable>
          {(user?.id === comment.user_id || user?.role === "admin") && (
            <Pressable onPress={() => deleteComment(comment.id)}>
              <Text style={styles.commentActionTextRed}>Delete</Text>
            </Pressable>
          )}
        </View>

        {repliesByParent[comment.id]?.map(reply => renderComment(reply, true))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable testID="post-back" onPress={() => router.canGoBack() ? router.back() : router.replace("/(reader)/(tabs)")} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" color={colors.ink} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
        >
          <Text style={styles.postOverline}>{post.kind.toUpperCase()}</Text>
          <Text style={styles.postTitle}>{post.title}</Text>
          <View style={styles.postTopMeta}>
            <Text style={styles.meta}>
              By <Text style={{ color: colors.ink, fontWeight: "700" }} onPress={() => router.push(`/(reader)/reporter/${post.reporter_id}`)}>{post.reporter_name}</Text>
              {post.verified ? <Icon name="checkmark-circle" size={13} color={colors.blue} /> : null}
            </Text>
            <Text style={styles.meta}>
              {new Date(post.created_at).toLocaleDateString()} · {post.location}
              {post.edited_at ? " (Edited)" : ""}
            </Text>
          </View>

          <HtmlBodyRenderer html={post.body} colors={colors} />

          {/* Fallback: render legacy media array if present and body is not HTML */}
          {!/<[a-z][\s\S]*>/i.test(post.body) && post.media?.length ? (
            <View style={styles.mediaStack}>
              {Array.isArray(post.media) && post.media.map((m, idx) => (
                <MediaPlayer key={`${post.id}-${idx}`} media={m} />
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={() => setSupportTarget({ id: post.reporter_id, name: post.reporter_name })} style={styles.action}>
              <Icon name="heart-outline" color={colors.red} size={18} />
              <Text style={styles.actionText}>Support ₹7</Text>
            </Pressable>
            <Pressable onPress={toggleBookmark} style={styles.action}>
              <Icon name={isBookmarked ? "bookmark" : "bookmark-outline"} color={isBookmarked ? colors.blue : colors.muted} size={18} />
              <Text style={styles.actionText}>{isBookmarked ? "Saved" : "Save"}</Text>
            </Pressable>
            <Pressable onPress={() => sharePost(post)} style={styles.action}>
              <Icon name="share-outline" color={colors.muted} size={18} />
              <Text style={styles.actionText}>Share</Text>
            </Pressable>
            <Pressable onPress={() => setReporting(post)} style={styles.action}>
              <Icon name="flag-outline" color={colors.muted} size={18} />
              <Text style={styles.actionText}>Flag</Text>
            </Pressable>
          </View>

          <View style={styles.commentsSection}>
            <Text style={styles.commentsHeading}>Comments · {post.comment_count}</Text>
            {topLevelComments.length === 0 ? (
              <Text style={styles.meta}>No comments yet. Start the conversation.</Text>
            ) : (
              topLevelComments.map(c => renderComment(c))
            )}
          </View>
        </ScrollView>

        <View style={styles.commentInputArea}>
          {replyingTo && (
            <View style={styles.replyingToBanner}>
              <Text style={styles.meta}>Replying to {replyingTo.user_name}</Text>
              <Pressable onPress={() => setReplyingTo(null)}><Icon name="close" size={16} color={colors.muted} /></Pressable>
            </View>
          )}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor="#8A8F91"
              value={commentBody}
              onChangeText={setCommentBody}
              multiline
            />
            <Pressable onPress={submitComment} disabled={submittingComment || commentBody.trim().length === 0} style={styles.sendBtn}>
              {submittingComment ? <ActivityIndicator size="small" color={colors.surface} /> : <Icon name="paper-plane" color={colors.surface} size={16} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!reporting} transparent animationType="slide" onRequestClose={() => setReporting(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.postOverline}>FLAG DISPATCH</Text>
            <Text style={styles.commentsHeading}>What&apos;s wrong with this post?</Text>
            <TextInput
              value={reportReason}
              onChangeText={setReportReason}
              placeholder="Give moderators enough context to review"
              placeholderTextColor="#8A8F91"
              multiline
              style={styles.reportInput}
            />
            <Button onPress={submitReport} tone="red">Send to moderators</Button>
            <Button onPress={() => { setReporting(null); setReportReason(""); }} tone="outline">Cancel</Button>
          </View>
        </View>
      </Modal>

      <SupportChoiceSheet
        visible={!!supportTarget}
        reporterName={supportTarget?.name || ""}
        onDismiss={() => setSupportTarget(null)}
        onChoose={startCheckout}
      />

      <RazorpayCheckout
        visible={!!checkout}
        order={checkout?.order || null}
        reporterName={checkout?.reporterName || ""}
        userName={user?.name}
        userEmail={user?.email}
        onDismiss={() => setCheckout(null)}
        onResult={(res) => {
          setCheckout(null);
          setToast({ message: res.message, tone: res.ok ? "success" : "error" });
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  content: { padding: 20, paddingBottom: 60 },
  postOverline: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "800" },
  postTitle: { color: colors.ink, fontSize: 32, lineHeight: 36, fontWeight: "800", letterSpacing: -0.5, marginTop: 10 },
  postTopMeta: { marginTop: 12, marginBottom: 20, gap: 4 },
  meta: { color: colors.muted, fontSize: 13 },
  mediaStack: { gap: 10, marginBottom: 20 },
  blocksContainer: { gap: 16, marginBottom: 20 },
  postBody: { color: colors.ink, fontSize: 17, lineHeight: 26 },
  actions: { flexDirection: "row", gap: 20, marginTop: 32, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 20 },
  action: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  commentsSection: { marginTop: 40, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 24 },
  commentsHeading: { color: colors.ink, fontSize: 20, fontWeight: "800", marginBottom: 20 },
  commentRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  commentReply: { marginTop: 16 },
  commentAvatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  commentAvatarText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  commentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  commentAuthor: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  commentBody: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  commentActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  commentActionText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  commentActionTextRed: { color: colors.red, fontSize: 12, fontWeight: "700" },
  commentInputArea: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, padding: 12, paddingBottom: Platform.OS === "ios" ? 24 : 12 },
  replyingToBanner: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.paper, padding: 8, borderRadius: 8, marginBottom: 8 },
  commentInputRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  commentInput: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, minHeight: 44, maxHeight: 120, fontSize: 15, color: colors.ink },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(24,32,42,0.55)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: 22, paddingBottom: 32, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  reportInput: { color: colors.ink, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, padding: 14, minHeight: 120, fontSize: 14, marginTop: 12, marginBottom: 12, textAlignVertical: "top", borderRadius: 8 },
});
