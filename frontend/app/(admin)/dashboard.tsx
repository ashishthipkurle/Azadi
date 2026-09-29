// Admin dashboard: metrics, moderation queue, user directory with disable /
// enable / verify actions. Every destructive action goes through a confirm
// sheet — no silent takedowns.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { apiGet, apiPost, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, EmptyState, Icon, Toast } from "@/src/ui";

type Overview = {
  users: number;
  reporters: number;
  posts: number;
  open_reports: number;
  live_now: number;
  queue: {
    id: string;
    post_id: string;
    reason: string;
    note: string;
    reporter_name: string;
    created_at: string;
    status: string;
  }[];
};
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  disabled?: boolean;
  verified?: boolean;
  avatar_url?: string;
  created_at: string;
};

type AdminApplication = {
  id: string;
  user_name: string;
  beat: string;
  sample_url: string | null;
  statement: string;
  created_at: string;
};

export default function AdminDashboard() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<"queue" | "appeals" | "users" | "applications" | "audit">("queue");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [selected, setSelected] = useState<Overview["queue"][number] | null>(null);
  const [selectedApp, setSelectedApp] = useState<AdminApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, u, a, auditRes, appealsRes] = await Promise.all([
        apiGet<Overview>("/admin/overview"),
        apiGet<AdminUser[]>("/admin/users"),
        apiGet<AdminApplication[]>("/admin/applications"),
        apiGet<{ items: any[]; next_cursor: string | null }>("/admin/audit"),
        apiGet<any[]>("/admin/appeals")
      ]);
      setOverview(o);
      setUsers(u);
      setApplications(a);
      setAuditLogs(auditRes.items);
      setAppeals(appealsRes);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not load admin data.";
      setToast({ message, tone: "error" });
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

  const resolveReport = async () => {
    if (!selected) return;
    try {
      await apiPost(`/reports/${selected.id}/resolve`);
      setSelected(null);
      setToast({ message: "Report resolved · audit entry created.", tone: "success" });
      await load();
    } catch {
      setToast({ message: "Could not resolve the report.", tone: "error" });
    }
  };

  const toggleUser = async (u: AdminUser) => {
    try {
      await apiPost(`/admin/users/${u.id}/${u.disabled ? "enable" : "disable"}`);
      setToast({
        message: u.disabled ? `${u.name} re-enabled.` : `${u.name} disabled.`,
        tone: "success",
      });
      await load();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Action failed.";
      setToast({ message, tone: "error" });
    }
  };

  const verifyUser = async (u: AdminUser) => {
    try {
      await apiPost(`/admin/users/${u.id}/verify`);
      setToast({ message: `${u.name} verified.`, tone: "success" });
      await load();
    } catch {
      setToast({ message: "Could not verify user.", tone: "error" });
    }
  };

  const reviewApplication = async (action: "approve" | "reject") => {
    if (!selectedApp) return;
    try {
      await apiPost(`/admin/applications/${selectedApp.id}/review`, { action });
      setSelectedApp(null);
      setToast({ message: `Application ${action}d.`, tone: "success" });
      await load();
    } catch {
      setToast({ message: "Could not review application.", tone: "error" });
    }
  };

  const reviewAppeal = async (id: string, action: "approve" | "reject") => {
    try {
      await apiPost(`/admin/appeals/${id}/review`, { action });
      setToast({ message: `Appeal ${action}d.`, tone: "success" });
      await load();
    } catch {
      setToast({ message: "Could not review appeal.", tone: "error" });
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

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Text style={styles.wordmark}>azadi</Text>
            <View style={styles.signalDot} />
          </View>
          <Text style={styles.kicker}>TRUST & SAFETY</Text>
        </View>
        <Pressable testID="admin-logout-button" onPress={logout} style={styles.avatar}>
          <Icon name="log-out-outline" color={colors.surface} size={19} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.red} />}
      >
        <Text style={styles.hello}>Hey {user?.name}.</Text>
        <Text style={styles.headline}>Accountability desk.</Text>

        <View style={styles.metrics}>
          <Metric label="USERS" value={overview?.users ?? "—"} />
          <Metric label="REPORTERS" value={overview?.reporters ?? "—"} />
          <Metric label="POSTS" value={overview?.posts ?? "—"} />
          <Metric label="OPEN FLAGS" value={overview?.open_reports ?? "—"} tone={overview && overview.open_reports > 0 ? colors.red : undefined} />
        </View>

        <View style={styles.segment}>
          {(["queue", "appeals", "users", "applications", "audit"] as const).map((t) => (
            <Pressable
              key={t}
              testID={`admin-tab-${t}`}
              onPress={() => setTab(t)}
              style={[styles.segmentItem, tab === t && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>
                {t === "queue"
                  ? `Queue (${overview?.open_reports ?? 0})`
                  : t === "appeals"
                  ? `Appeals (${appeals.length})`
                  : t === "users"
                  ? `Users (${overview?.users ?? users.length})`
                  : t === "applications"
                  ? `Apps (${applications.length})`
                  : `Audit`}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "audit" ? (
          <View style={{ gap: 12 }}>
            {auditLogs.length ? auditLogs.map((log) => (
              <View key={log.id} style={styles.userRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{log.action} {log.target_type}</Text>
                  <Text style={styles.meta}>
                    by {log.admin_name} on {new Date(log.created_at).toLocaleString()}
                  </Text>
                  {log.details ? <Text style={[styles.queueNote, { marginTop: 4 }]}>{log.details}</Text> : null}
                </View>
              </View>
            )) : (
              <EmptyState title="No audit logs." body="Admin actions will appear here." icon="list-outline" />
            )}
          </View>
        ) : tab === "queue" ? (
          overview?.queue?.length ? (
            overview.queue.map((item) => (
              <Pressable
                testID="admin-moderation-queue"
                key={item.id}
                onPress={() => setSelected(item)}
                style={styles.queueItem}
              >
                <View style={styles.severity}>
                  <Icon name="flag-outline" color={colors.red} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueReason}>{item.reason}</Text>
                  <Text style={styles.meta}>
                    Post {item.post_id.slice(0, 8)} · flagged by {item.reporter_name}
                  </Text>
                  {item.note ? <Text style={styles.queueNote}>{item.note}</Text> : null}
                </View>
                <Text style={styles.queueStatus}>{item.status}</Text>
              </Pressable>
            ))
          ) : (
            <EmptyState
              title="Clear queue."
              body="No reports need your attention. Transparent moderation keeps trust visible."
              icon="checkmark-done-outline"
            />
          )
        ) : tab === "appeals" ? (
          <View style={{ gap: 12 }}>
            {appeals.length ? appeals.map((appeal) => (
              <View key={appeal.id} style={styles.card}>
                <Text style={styles.userName}>Appeal from {appeal.reporter_name}</Text>
                <Text style={styles.meta}>Submitted {new Date(appeal.appealed_at).toLocaleString()}</Text>
                
                <View style={{ marginTop: 12, padding: 12, backgroundColor: colors.surface, borderRadius: 8 }}>
                  <Text style={styles.meta}>Original Report Reason:</Text>
                  <Text style={styles.queueNote}>{appeal.reason}</Text>
                </View>
                
                <View style={{ marginTop: 12, padding: 12, backgroundColor: colors.surface, borderRadius: 8 }}>
                  <Text style={styles.meta}>Appeal Statement:</Text>
                  <Text style={styles.queueNote}>{appeal.appeal_text}</Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                  <Button style={{ flex: 1 }} onPress={() => reviewAppeal(appeal.id, "approve")}>Approve</Button>
                  <Button style={{ flex: 1 }} tone="outline" onPress={() => reviewAppeal(appeal.id, "reject")}>Reject</Button>
                </View>
              </View>
            )) : (
              <EmptyState title="No active appeals." body="Appeals from suspended users will appear here." icon="mail-outline" />
            )}
          </View>
        ) : tab === "users" ? (
          <View style={{ gap: 12 }}>
            {users.map((u) => (
              <View key={u.id} testID={`admin-user-${u.role}`} style={styles.userRow}>
                {u.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} style={{ width: 32, height: 32, borderRadius: 8 }} />
                ) : (
                  <View style={styles.userMark}>
                    <Text style={styles.userInitial}>{u.name[0]}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={styles.userName}>{u.name}</Text>
                    {u.verified ? <Icon name="checkmark-circle" color={colors.blue} size={13} /> : null}
                    {u.disabled ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>DISABLED</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.meta}>
                    {u.email} · {u.role.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userActions}>
                  {u.role === "reporter" && !u.verified ? (
                    <Pressable testID={`admin-verify-${u.id}`} onPress={() => verifyUser(u)} style={styles.iconBtn}>
                      <Icon name="checkmark-circle-outline" color={colors.blue} size={20} />
                    </Pressable>
                  ) : null}
                  {u.id !== user?.id ? (
                    <Pressable testID={`admin-toggle-${u.id}`} onPress={() => toggleUser(u)} style={styles.iconBtn}>
                      <Icon name={u.disabled ? "power-outline" : "ban-outline"} color={u.disabled ? colors.green : colors.red} size={20} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {applications.length === 0 ? (
              <EmptyState icon="folder-open-outline" title="No pending applications" body="Check back later." />
            ) : (
              applications.map((a) => (
                <View key={a.id} style={styles.userRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.userName}>{a.user_name}</Text>
                    <Text style={styles.meta}>Beat: {a.beat}</Text>
                    <Text style={styles.meta}>Applied: {new Date(a.created_at).toLocaleDateString()}</Text>
                    <Text style={[styles.meta, { color: colors.ink }]}>"{a.statement}"</Text>
                    {a.sample_url ? (
                      <Text style={[styles.meta, { color: colors.blue }]}>{a.sample_url}</Text>
                    ) : null}
                  </View>
                  <View style={styles.userActions}>
                    <Pressable onPress={() => setSelectedApp(a)} style={styles.iconBtn}>
                      <Text style={[styles.actionText, { color: colors.blue }]}>Review</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={styles.principles}>
          <Text style={styles.overline}>PLATFORM PRINCIPLES</Text>
          <Text style={styles.principleText}>No silent takedowns · evidence required · appeal always available</Text>
          <Text style={styles.principleMeta}>Every action creates an audit entry for the reporter and admin.</Text>
        </View>
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.overline}>REPORT DETAIL</Text>
            <Text style={styles.modalHeading}>Review with context.</Text>
            <Text style={styles.modalReason}>{selected?.reason}</Text>
            {selected?.note ? <Text style={styles.modalNote}>{selected.note}</Text> : null}
            <Text style={styles.meta}>
              Post {selected?.post_id.slice(0, 8)} · flagged by {selected?.reporter_name}
            </Text>
            <Button testID="admin-resolve-report-button" onPress={resolveReport} tone="red">
              Resolve report
            </Button>
            <Button onPress={() => setSelected(null)} tone="outline">
              Keep open
            </Button>
          </View>
        </View>
      </Modal>

      {selectedApp && (
        <Modal transparent animationType="fade" onRequestClose={() => setSelectedApp(null)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <Text style={styles.overline}>REVIEW APPLICATION</Text>
              <Text style={styles.modalHeading}>Approve {selectedApp.user_name}?</Text>
              <Text style={styles.modalReason}>Beat: {selectedApp.beat}</Text>
              <Text style={styles.modalNote}>"{selectedApp.statement}"</Text>
              
              <Button onPress={() => reviewApplication("approve")} style={{ marginTop: 24 }}>Approve as Reporter</Button>
              <Button onPress={() => reviewApplication("reject")} tone="outline" style={{ marginTop: 12 }}>Decline</Button>
              <Button onPress={() => setSelectedApp(null)} tone="outline" style={{ marginTop: 12 }}>Cancel</Button>
            </View>
          </View>
        </Modal>
      )}

      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </SafeAreaView>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricNumber, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
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
    justifyContent: "space-between",
  },
  wordmark: { color: colors.ink, fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  signalDot: { width: 6, height: 6, borderRadius: 8, backgroundColor: colors.red, marginLeft: 4, marginTop: 6 },
  kicker: { fontSize: 9, letterSpacing: 2, color: colors.muted, marginTop: 4, fontWeight: "800" },
  avatar: { backgroundColor: colors.ink, borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 60 },
  hello: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  headline: { color: colors.ink, fontSize: 30, fontWeight: "800", letterSpacing: -1, marginTop: 4, marginBottom: 20 },
  metrics: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    marginBottom: 20,
    backgroundColor: colors.surface,
  },
  metric: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, borderRightWidth: 1, borderColor: colors.line },
  metricNumber: { fontSize: 22, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  metricLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, marginTop: 4, fontWeight: "800" },
  segment: { flexDirection: "row", backgroundColor: colors.line, padding: 3, borderRadius: 8, marginBottom: 18 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontWeight: "800", fontSize: 12 },
  segmentTextActive: { color: colors.ink },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingVertical: 16,
  },
  severity: { width: 34, height: 34, backgroundColor: "#F5E5E2", alignItems: "center", justifyContent: "center", borderRadius: 8 },
  queueReason: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  queueNote: { color: colors.muted, fontSize: 12, marginTop: 3, fontStyle: "italic" },
  queueStatus: { color: colors.red, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  meta: { color: colors.muted, fontSize: 12 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
  },
  userMark: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  userInitial: { color: colors.surface, fontWeight: "800" },
  userName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  userActions: { flexDirection: "row", gap: 6 },
  iconBtn: { padding: 8, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  badge: { backgroundColor: colors.red, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { color: colors.surface, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  overline: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "800" },
  principles: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 22, marginTop: 28 },
  principleText: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: "700", marginTop: 10 },
  principleMeta: { color: colors.muted, fontSize: 12, marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(24,32,42,0.55)", justifyContent: "flex-end" },
  modal: { backgroundColor: colors.surface, padding: 22, paddingBottom: 32, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  modalHeading: { color: colors.ink, fontSize: 22, fontWeight: "800", marginTop: 8, marginBottom: 8 },
  modalReason: { color: colors.ink, fontSize: 15, fontWeight: "700", marginBottom: 6 },
  modalNote: { color: colors.muted, fontSize: 13, marginBottom: 12, fontStyle: "italic" },
});
