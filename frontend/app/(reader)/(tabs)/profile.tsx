import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon, ConfirmModal, Toast, EmptyState } from "@/src/ui";
import { shareProfile } from "@/src/share";
import { AppHeader } from "@/src/shared/app-header";

export default function Profile() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [showReporterModal, setShowReporterModal] = useState(false);
  const [toast, setToast] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"grid" | "bookmarks">("grid");

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh])
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <AppHeader
        routePrefix="/(reader)"
        showMenu={true}
        onLeftPress={() => {
          if (user?.role === "reporter") {
            router.push("/(reporter)/studio");
          } else {
            setShowReporterModal(true);
          }
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Head */}
        <View style={styles.profileHead}>
          <View style={styles.avatarContainer}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }]}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>0</Text>
              <Text style={styles.statLabel}>posts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{user?.friends || 0}</Text>
              <Text style={styles.statLabel}>friends</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{user?.following || 0}</Text>
              <Text style={styles.statLabel}>following</Text>
            </View>
          </View>
        </View>

        {/* Bio Section */}
        <View style={styles.bioSection}>
          <Text style={styles.bioName}>{user?.name}</Text>
          <Text style={styles.bioText}>{user?.bio || "I love reading dispatches on Azadi."}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable onPress={() => router.push("/profile-edit" as any)} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Edit profile</Text>
          </Pressable>
          <Pressable onPress={() => shareProfile("Check out my profile on Azadi!", `https://azadi.freepress.in/users/${user?.id}`)} style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>Share profile</Text>
          </Pressable>
        </View>

        {/* Content Tabs & Grid */}
        <View style={styles.contentTabs}>
          <Pressable onPress={() => setActiveTab("grid")} style={[styles.tab, activeTab === "grid" && styles.activeTab]}>
            <Icon name="grid-outline" color={activeTab === "grid" ? colors.ink : colors.muted} size={24} />
          </Pressable>
          <Pressable onPress={() => setActiveTab("bookmarks")} style={[styles.tab, activeTab === "bookmarks" && styles.activeTab]}>
            <Icon name="bookmark-outline" color={activeTab === "bookmarks" ? colors.ink : colors.muted} size={24} />
          </Pressable>
        </View>

        {/* Grid Area */}
        <View style={styles.grid}>
           <View style={{ width: "100%", padding: 32, alignItems: "center" }}>
              <EmptyState title={activeTab === "grid" ? "No posts" : "No bookmarks"} body={activeTab === "grid" ? "You haven't published anything." : "You haven't bookmarked anything yet."} icon={activeTab === "grid" ? "images-outline" : "bookmark-outline"} />
           </View>
        </View>
      </ScrollView>

      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
      <ConfirmModal
        visible={showReporterModal}
        title="Become a Reporter"
        body="If you want to be a reporter you can request it."
        confirmText="Request"
        onCancel={() => setShowReporterModal(false)}
        onConfirm={() => {
          setShowReporterModal(false);
          setToast({ message: "Your request has been submitted.", tone: "success" });
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 40 },
  topHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
  },
  headerSideLeft: {
    minWidth: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerSideRight: {
    minWidth: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  headerBtn: {
    padding: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  wordmark: { color: colors.ink, fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  signalDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: colors.red, marginLeft: 3, marginTop: 5 },
  kicker: { fontSize: 8, letterSpacing: 1.2, color: colors.muted, marginTop: 2, fontWeight: "800" },
  username: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  profileHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 12,
  },
  avatarContainer: {
    marginRight: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    color: colors.paper,
    fontSize: 32,
    fontWeight: "800",
  },
  statsContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statBox: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  statLabel: {
    fontSize: 13,
    color: colors.ink,
    marginTop: 2,
  },
  bioSection: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  bioName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 2,
  },
  bioText: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
  },
  contentTabs: {
    flexDirection: "row",
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  activeTab: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    marginTop: 2,
  },
  gridItem: {
    width: "33.333%",
    aspectRatio: 9 / 16,
    padding: 1.5,
  },
});
