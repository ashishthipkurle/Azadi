import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { apiGet, apiPost, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Toast } from "@/src/ui";

export default function Application() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user, logout, refresh } = useAuth();
  const router = useRouter();

  const [beat, setBeat] = useState("");
  const [sampleUrl, setSampleUrl] = useState("");
  const [statement, setStatement] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (user?.role === "reporter") {
          router.replace("/(reporter)/(tabs)");
          return;
        }
        const app = await apiGet<any>("/reporter-application/mine");
        setStatus(app.status);
      } catch (e) {
        // 404 means no application exists yet
      }
    })();
  }, [user, router]);

  const submit = async () => {
    if (beat.trim().length < 2) return setToast({ message: "Beat is required.", tone: "error" });
    if (statement.trim().length < 10) return setToast({ message: "Please provide a more detailed statement.", tone: "error" });

    setBusy(true);
    try {
      await apiPost("/reporter-application", {
        beat: beat.trim(),
        sample_url: sampleUrl.trim() || undefined,
        statement: statement.trim(),
      });
      setStatus("pending");
      setToast({ message: "Application submitted successfully.", tone: "success" });
    } catch (e) {
      setToast({ message: e instanceof ApiError ? e.message : "Failed to submit.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Reporter Application</Text>

          {status === "pending" ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Under Review</Text>
              <Text style={styles.stateBody}>
                Your application is currently being reviewed by our moderation team. You will be notified once it is approved.
              </Text>
              <Button onPress={refresh} style={{ marginTop: 20 }}>Check status</Button>
              <Button onPress={handleLogout} tone="outline" style={{ marginTop: 10 }}>Sign out</Button>
            </View>
          ) : status === "rejected" ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Application Declined</Text>
              <Text style={styles.stateBody}>
                Unfortunately, your application to become a reporter was not approved at this time.
              </Text>
              <Button onPress={handleLogout} tone="outline" style={{ marginTop: 20 }}>Sign out</Button>
            </View>
          ) : (
            <>
              <Text style={styles.helperText}>
                Azadi is for independent field reporters. Tell us what you plan to cover.
              </Text>

              <Text style={styles.label}>Your Beat</Text>
              <TextInput
                value={beat}
                onChangeText={setBeat}
                placeholder="e.g. Civic issues in Mumbai"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />

              <Text style={styles.label}>Sample URL (Optional)</Text>
              <TextInput
                value={sampleUrl}
                onChangeText={setSampleUrl}
                placeholder="Link to previous work, blog, or social profile"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Statement of Intent</Text>
              <TextInput
                value={statement}
                onChangeText={setStatement}
                placeholder="Why do you want to report on Azadi? What stories will you bring?"
                placeholderTextColor={colors.muted}
                style={[styles.input, { height: 120, textAlignVertical: "top" }]}
                multiline
              />

              <Button onPress={submit} loading={busy} style={{ marginTop: 20 }}>Submit application</Button>
              <Button onPress={handleLogout} tone="outline" style={{ marginTop: 12 }}>Sign out for now</Button>
            </>
          )}

          {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 20 },
  title: { fontSize: 26, fontWeight: "800", color: colors.ink, marginBottom: 8, letterSpacing: -1 },
  helperText: { fontSize: 15, color: colors.muted, marginBottom: 24, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 20,
  },
  stateCard: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 20,
  },
  stateTitle: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: 8 },
  stateBody: { fontSize: 16, color: colors.muted, lineHeight: 24 },
});
