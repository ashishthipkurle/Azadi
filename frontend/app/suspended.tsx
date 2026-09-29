import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, EmptyState, Icon, Toast } from "@/src/ui";

type Strike = {
  id: string;
  reason: string;
  note?: string;
  appeal_status?: string;
};

export default function SuspendedScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user, logout } = useAuth();
  
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [loading, setLoading] = useState(true);
  const [appealingId, setAppealingId] = useState<string | null>(null);
  const [appealText, setAppealText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!user.disabled) {
      router.replace("/");
      return;
    }
    apiGet<Strike[]>("/users/me/strikes")
      .then(setStrikes)
      .catch(() => setToast({ message: "Could not fetch account standing.", tone: "error" }))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return <Redirect href="/" />;

  const submitAppeal = async (id: string) => {
    if (appealText.trim().length < 10) {
      setToast({ message: "Please provide a detailed appeal.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await apiPost(`/reports/${id}/appeal`, { text: appealText.trim() });
      setToast({ message: "Appeal submitted. We will review it shortly.", tone: "success" });
      setAppealingId(null);
      setAppealText("");
      setStrikes((prev) =>
        prev.map((s) => (s.id === id ? { ...s, appeal_status: "pending" } : s))
      );
    } catch {
      setToast({ message: "Failed to submit appeal.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Icon name="warning" color={colors.red} size={48} />
        <Text style={styles.title}>Account Suspended</Text>
        <Text style={styles.body}>
          Your account has been suspended because one or more of your dispatches violated our guidelines.
          We require evidence for all reporting.
        </Text>
        
        {strikes.length > 0 ? (
          <View style={{ marginTop: 24, gap: 16 }}>
            <Text style={styles.overline}>REPORTS AGAINST YOU</Text>
            {strikes.map((s) => (
              <View key={s.id} style={styles.card}>
                <Text style={styles.reason}>{s.reason}</Text>
                {s.note ? <Text style={styles.note}>{s.note}</Text> : null}
                
                {s.appeal_status === "pending" ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Appeal under review</Text>
                  </View>
                ) : appealingId === s.id ? (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    <TextInput
                      style={styles.input}
                      placeholder="Explain your side. Provide any missing evidence."
                      placeholderTextColor={colors.muted}
                      value={appealText}
                      onChangeText={setAppealText}
                      multiline
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button style={{ flex: 1 }} onPress={() => submitAppeal(s.id)} loading={busy}>Submit appeal</Button>
                      <Button style={{ flex: 1 }} tone="outline" onPress={() => setAppealingId(null)}>Cancel</Button>
                    </View>
                  </View>
                ) : (
                  <Button style={{ marginTop: 12 }} tone="outline" onPress={() => setAppealingId(s.id)}>Appeal this decision</Button>
                )}
              </View>
            ))}
          </View>
        ) : (
          <EmptyState title="No active reports." body="Your account was suspended by an admin." icon="shield-outline" />
        )}

        <View style={{ marginTop: 48 }}>
          <Button tone="outline" onPress={logout}>Sign out</Button>
        </View>
      </ScrollView>
      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 24, alignItems: "center" },
  title: { fontSize: 28, fontWeight: "800", color: colors.ink, marginTop: 16, marginBottom: 8, textAlign: "center" },
  body: { fontSize: 16, color: colors.muted, textAlign: "center", lineHeight: 24 },
  overline: { fontSize: 11, fontWeight: "800", color: colors.muted, letterSpacing: 1 },
  card: { width: "100%", backgroundColor: colors.background, padding: 16, borderRadius: 8, marginTop: 8 },
  reason: { fontSize: 16, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  note: { fontSize: 14, color: colors.muted },
  badge: { alignSelf: "flex-start", backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 12, borderColor: colors.line, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: "700", color: colors.muted },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, fontSize: 15, color: colors.ink, minHeight: 80, textAlignVertical: "top" }
});
