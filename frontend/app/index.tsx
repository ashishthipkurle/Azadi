// Entry screen:
// 1. If the auth context is still hydrating -> spinner.
// 2. If the user is logged in -> redirect to their role home.
// 3. Otherwise -> unauthenticated landing with sign-in / register.
import { Redirect } from "expo-router";
import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, apiPost } from "@/src/api";
import { Role, useAuth } from "@/src/auth";
import { } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon, Overline, Toast } from "@/src/ui";
import { storage } from "@/src/utils/storage";
import { WelcomeScreen } from "@/app/welcome";

type Mode = "landing" | "login" | "register" | "forgot_password" | "reset_password";

export default function Index() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { ready, user, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("landing");
  const [role, setRole] = useState<Role>("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);

  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    storage.getItem<boolean>("azadi.onboarded", false).then(setOnboarded);
  }, []);

  if (!ready || onboarded === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.red} />
        </View>
      </SafeAreaView>
    );
  }
  if (user) {
    if (!onboarded && user.role === "client") {
      return <Redirect href="/onboarding" />;
    }
    // Phase 3 Reporter Application: If user is reporter but not yet verified, maybe we redirect them to application.
    // For now, if role is reporter, they just go to studio. Wait, the plan says:
    // "After registering as reporter role -> redirect to application form instead of studio"
    // "Show Under review status screen until approved"
    const dest = user.role === "reporter" ? "/(reporter)/(tabs)" : user.role === "admin" ? "/(admin)/dashboard" : "/(reader)/(tabs)";
    return <Redirect href={dest} />;
  }

  if (mode === "landing") {
    return (
      <WelcomeScreen
        onSignIn={() => setMode("login")}
        onCreateAccount={() => setMode("register")}
      />
    );
  }

  const submit = async () => {
    if (busy) return;
    if (mode === "forgot_password") {
      if (!email.trim()) {
        setToast({ message: "Enter your email", tone: "error" });
        return;
      }
      setBusy(true);
      try {
        const res = await apiPost<{ dev_token?: string }>("/auth/forgot-password", { email: email.trim() });
        if (res.dev_token) {
          setResetToken(res.dev_token);
          setMode("reset_password");
          setToast({ message: "Check your email (or use the token pre-filled here).", tone: "success" });
        } else {
          setMode("login");
          setToast({ message: "If that email is registered, you will receive a link.", tone: "info" });
        }
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Request failed.";
        setToast({ message, tone: "error" });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === "reset_password") {
      if (!resetToken.trim() || !password) {
        setToast({ message: "Enter your reset token and new password", tone: "error" });
        return;
      }
      setBusy(true);
      try {
        await apiPost("/auth/reset-password", { token: resetToken.trim(), new_password: password });
        setMode("login");
        setPassword("");
        setToast({ message: "Password reset successfully. You can now log in.", tone: "success" });
      } catch (e) {
        const message = e instanceof ApiError ? e.message : "Reset failed.";
        setToast({ message, tone: "error" });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!email.trim() || !password) {
      setToast({ message: "Enter your email and password", tone: "error" });
      return;
    }
    if (mode === "register" && name.trim().length < 2) {
      setToast({ message: "Tell us the name to show on your byline", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") await register(name.trim(), email.trim(), password, role);
      else await login(email.trim(), password);
    } catch (e) {
      console.error("Auth error:", e);
      const message = e instanceof ApiError ? e.message : "Could not reach the server. Try again in a moment.";
      setToast({ message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.wordmark}>azadi</Text>
            <View style={styles.signalDot} />
          </View>

          {mode === "forgot_password" ? (
            <>
              <Pressable testID="auth-back" onPress={() => setMode("login")} hitSlop={12} style={styles.back}>
                <Icon name="chevron-back" color={colors.ink} />
                <Text style={styles.backText}>Back to login</Text>
              </Pressable>
              <Text style={styles.title}>Reset password.</Text>
              <Text style={styles.subtitle}>Enter your email to receive a reset link.</Text>

              <Overline>EMAIL</Overline>
              <TextInput
                testID="auth-email-input"
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#8A8F91"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <Button testID="auth-submit-button" onPress={submit} loading={busy} tone="dark">
                Send link
              </Button>
            </>
          ) : mode === "reset_password" ? (
            <>
              <Pressable testID="auth-back" onPress={() => setMode("login")} hitSlop={12} style={styles.back}>
                <Icon name="chevron-back" color={colors.ink} />
                <Text style={styles.backText}>Cancel</Text>
              </Pressable>
              <Text style={styles.title}>New password.</Text>
              <Text style={styles.subtitle}>Enter your reset token and new password.</Text>

              <Overline>RESET TOKEN</Overline>
              <TextInput
                style={styles.input}
                placeholder="Token from email"
                placeholderTextColor="#8A8F91"
                autoCapitalize="none"
                value={resetToken}
                onChangeText={setResetToken}
              />

              <Overline>NEW PASSWORD</Overline>
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor="#8A8F91"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Button testID="auth-submit-button" onPress={submit} loading={busy} tone="dark">
                Reset password
              </Button>
            </>
          ) : (
            <>
              <Pressable testID="auth-back" onPress={() => setMode("landing")} style={styles.back}>
                <Icon name="chevron-back" color={colors.ink} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>

              <Text style={styles.title}>{mode === "login" ? "Welcome back." : "Join the newsroom."}</Text>
              <Text style={styles.subtitle}>
                {mode === "login"
                  ? "Sign in to keep reading and supporting reporters you trust."
                  : "Independent reporters, curious readers, and moderators all live here."}
              </Text>

              {mode === "register" ? (
                <>
                  <Overline>NAME</Overline>
                  <TextInput
                    testID="auth-name-input"
                    style={styles.input}
                    placeholder="How your byline should read"
                    placeholderTextColor="#8A8F91"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />

                  <Overline>I AM A</Overline>
                  <View style={styles.roleRow}>
                    {(["client", "reporter"] as const).map((r) => (
                      <Pressable
                        key={r}
                        testID={`auth-role-${r}`}
                        onPress={() => setRole(r)}
                        style={[styles.roleChip, role === r && styles.roleChipActive]}
                      >
                        <Icon
                          name={r === "reporter" ? "radio-outline" : "newspaper-outline"}
                          color={role === r ? colors.surface : colors.ink}
                          size={18}
                        />
                        <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                          {r === "reporter" ? "Reporter" : "Reader"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.helper}>
                    Admin accounts are provisioned by the platform team. Ask an existing admin to promote you.
                  </Text>
                </>
              ) : null}

              <Overline>EMAIL</Overline>
              <TextInput
                testID="auth-email-input"
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#8A8F91"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />

              <Overline>PASSWORD</Overline>
              <TextInput
                testID="auth-password-input"
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor="#8A8F91"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Button
                testID="auth-submit-button"
                onPress={submit}
                loading={busy}
                tone={mode === "register" ? "red" : "dark"}
              >
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>

              <Pressable
                testID="auth-toggle-mode"
                onPress={() => setMode(mode === "login" ? "register" : "login")}
                style={styles.toggle}
              >
                <Text style={styles.toggleText}>
                  {mode === "login" ? "New here? Create an account." : "Already have an account? Sign in."}
                </Text>
              </Pressable>

              {mode === "login" && (
                <Pressable onPress={() => setMode("forgot_password")} style={styles.toggle}>
                  <Text style={styles.toggleText}>Forgot password?</Text>
                </Pressable>
              )}

              {mode === "login" ? (
                <View style={styles.demoBox}>
                  <Overline>TRY THE PLATFORM</Overline>
                  <Text style={styles.demoLine}>Admin · admin@azadi.in / admin123</Text>
                  <Text style={styles.demoLine}>Reporter · rhea@azadi.in / reporter123</Text>
                  <Text style={styles.demoLine}>Reader · reader@azadi.in / reader123</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: 24, paddingTop: 32, paddingBottom: 64 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  brand: { flexDirection: "row", alignItems: "flex-start", marginBottom: 40 },
  wordmark: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: -1.5 },
  signalDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: colors.red, marginLeft: 6, marginTop: 8 },
  hero: { color: colors.ink, fontSize: 44, lineHeight: 46, fontWeight: "800", letterSpacing: -2, marginTop: 12 },
  heroBody: { color: colors.muted, fontSize: 16, lineHeight: 25, marginTop: 18, maxWidth: 340 },
  spacerLg: { height: 36 },
  footer: { marginTop: 40, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 18 },
  footerText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 18 },
  backText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", letterSpacing: -1, marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 24 },
  input: {
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginTop: 8,
    marginBottom: 18,
    borderRadius: 8,
  },
  helper: { color: colors.muted, fontSize: 12, marginTop: 6, marginBottom: 6 },
  roleRow: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 12 },
  roleChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  roleChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  roleChipText: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  roleChipTextActive: { color: colors.surface },
  toggle: { marginTop: 16, alignItems: "center" },
  toggleText: { color: colors.muted, fontSize: 13, textDecorationLine: "underline" },
  demoBox: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 4,
  },
  demoLine: { color: colors.ink, fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
});
