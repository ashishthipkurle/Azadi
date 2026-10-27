import { useEffect, useState } from "react";
import { Modal, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MediaPlayer } from "@/src/media-player";
import { sharePost } from "@/src/share";
import { ReelsCommentModal } from "@/src/shared/reels-comment-modal";
import { Icon, Toast } from "@/src/ui";
import { storage } from "@/src/utils/storage";

export type ReelItem = {
  id: string;
  title: string;
  body?: string;
  reporter_name?: string;
  playback_id: string;
};

export function ReelModal({
  reel,
  onClose,
}: {
  reel: ReelItem | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  if (!reel) return null;

  return (
    <Modal visible={!!reel} animationType="slide" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" translucent />
      <ReelModalContent reel={reel} onClose={onClose} insets={insets} width={width} height={height} />
    </Modal>
  );
}

function ReelModalContent({
  reel,
  onClose,
  insets,
  width,
  height,
}: {
  reel: ReelItem;
  onClose: () => void;
  insets: any;
  width: number;
  height: number;
}) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);

  useEffect(() => {
    async function loadInteractions() {
      const savedLikes = (await storage.getItem<string[]>("azadi.reels.likes", [])) || [];
      const liked = savedLikes.includes(reel.id);
      setIsLiked(liked);

      const savedCounts = (await storage.getItem<Record<string, number>>("azadi.reels.like_counts", {})) || {};
      setLikeCount(savedCounts[reel.id] ?? (liked ? 1 : 0));

      const commentCounts = (await storage.getItem<Record<string, number>>("azadi.reels.comment_counts", {})) || {};
      setCommentCount(commentCounts[reel.id] ?? 0);
    }
    loadInteractions();
  }, [reel.id]);

  const toggleLike = async () => {
    const nextLiked = !isLiked;
    const nextCount = nextLiked ? likeCount + 1 : Math.max(0, likeCount - 1);
    setIsLiked(nextLiked);
    setLikeCount(nextCount);

    const savedLikes = (await storage.getItem<string[]>("azadi.reels.likes", [])) || [];
    const updatedLikes = nextLiked
      ? Array.from(new Set([...savedLikes, reel.id]))
      : savedLikes.filter((id) => id !== reel.id);
    await storage.setItem("azadi.reels.likes", updatedLikes);

    const savedCounts = (await storage.getItem<Record<string, number>>("azadi.reels.like_counts", {})) || {};
    savedCounts[reel.id] = nextCount;
    await storage.setItem("azadi.reels.like_counts", savedCounts);
  };

  const handleShare = async () => {
    const res = await sharePost({
      id: reel.id,
      title: reel.title,
      reporter_name: reel.reporter_name,
    });
    if (res.method === "clipboard") {
      setToast({ message: "Link copied to clipboard!", tone: "success" });
    }
  };

  return (
    <View style={[styles.container, { width, height }]}>
      {toast && (
        <View style={[styles.toastContainer, { top: insets.top + 50 }]}>
          <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />
        </View>
      )}

      <View style={StyleSheet.absoluteFillObject}>
        <MediaPlayer media={{ kind: "video", playback_id: reel.playback_id }} radius={0} fill paused={false} />
      </View>

      {/* Top Bar with Close Button */}
      <View style={[styles.topBar, { top: Math.max(insets.top, 24) }]}>
        <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
          <Icon name="close" color="#fff" size={26} />
        </Pressable>
      </View>

      {/* Bottom Info Overlay */}
      <View style={[styles.overlayBottom, { bottom: Math.max(insets.bottom, 24) }]} pointerEvents="box-none">
        {reel.reporter_name ? <Text style={styles.reporterName}>@{reel.reporter_name}</Text> : null}
        <Text style={styles.videoTitle} numberOfLines={2}>
          {reel.title}
        </Text>
        {reel.body && reel.body !== reel.title ? (
          <Text style={styles.videoBody} numberOfLines={2}>
            {reel.body}
          </Text>
        ) : null}
      </View>

      {/* Right Action Buttons */}
      <View style={[styles.overlayRight, { bottom: Math.max(insets.bottom, 40) }]} pointerEvents="box-none">
        {/* Like */}
        <Pressable style={styles.actionButton} onPress={toggleLike} hitSlop={10}>
          <View style={styles.actionIconCircle}>
            <Icon
              name={isLiked ? "heart" : "heart-outline"}
              color={isLiked ? "#ff2b54" : "#fff"}
              size={28}
            />
          </View>
          <Text style={[styles.actionText, isLiked && styles.actionTextLiked]}>
            {likeCount > 0 ? likeCount : "Like"}
          </Text>
        </Pressable>

        {/* Comment */}
        <Pressable style={styles.actionButton} onPress={() => setShowComments(true)} hitSlop={10}>
          <View style={styles.actionIconCircle}>
            <Icon name="chatbubble-outline" color="#fff" size={26} />
          </View>
          <Text style={styles.actionText}>{commentCount > 0 ? commentCount : "Comment"}</Text>
        </Pressable>

        {/* Share */}
        <Pressable style={styles.actionButton} onPress={handleShare} hitSlop={10}>
          <View style={styles.actionIconCircle}>
            <Icon name="arrow-redo-outline" color="#fff" size={27} />
          </View>
          <Text style={styles.actionText}>Send</Text>
        </Pressable>
      </View>

      {/* Comments Modal */}
      <ReelsCommentModal
        visible={showComments}
        post={{ id: reel.id, title: reel.title, reporter_name: reel.reporter_name }}
        onClose={() => setShowComments(false)}
        onCommentAdded={async (newCount) => {
          setCommentCount(newCount);
          const savedCommentCounts = (await storage.getItem<Record<string, number>>("azadi.reels.comment_counts", {})) || {};
          savedCommentCounts[reel.id] = newCount;
          await storage.setItem("azadi.reels.comment_counts", savedCommentCounts);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  toastContainer: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 200,
    alignItems: "center",
  },
  topBar: {
    position: "absolute",
    left: 16,
    zIndex: 20,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayBottom: {
    position: "absolute",
    left: 16,
    right: 80,
    zIndex: 10,
  },
  reporterName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  videoTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  videoBody: {
    color: "#ddd",
    fontSize: 13,
    marginTop: 2,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  overlayRight: {
    position: "absolute",
    right: 14,
    zIndex: 20,
    alignItems: "center",
    gap: 18,
  },
  actionButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  actionTextLiked: {
    color: "#ff2b54",
  },
});
