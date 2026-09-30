import { useRouter } from "expo-router";
import { StyleSheet, Text, View, Pressable, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon } from "@/src/ui";
import { storage } from "@/src/utils/storage";

export default function Settings() {
  const { colors, mode, toggle } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Icon name="arrow-back" color={colors.ink} size={24} />
          <Text style={styles.headerTitle}>Settings</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LIBRARY</Text>
          <Pressable style={styles.row} onPress={() => router.push("/(reader)/saved")}>
            <Icon name="bookmark-outline" color={colors.ink} size={22} />
            <Text style={styles.rowText}>Reading List</Text>
            <Icon name="chevron-forward" color={colors.muted} size={20} />
          </Pressable>
          <Pressable style={styles.row} onPress={() => router.push("/(reader)/pledges")}>
            <Icon name="heart-outline" color={colors.ink} size={22} />
            <Text style={styles.rowText}>My Pledges</Text>
            <Icon name="chevron-forward" color={colors.muted} size={20} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PREFERENCES</Text>
          <Pressable style={styles.row} onPress={toggle}>
            <Icon name={mode === "dark" ? "moon-outline" : "sunny-outline"} color={colors.ink} size={22} />
            <Text style={styles.rowText}>Theme</Text>
            <Text style={styles.rowValue}>{mode === "dark" ? "Dark" : "Light"}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SECURITY</Text>
          <Pressable style={styles.row} onPress={async () => {
            const current = await storage.secureGet("use_proxy", "false");
            const next = current === "true" ? "false" : "true";
            await storage.secureSet("use_proxy", next);
            Alert.alert("Proxy Changed", `Secure Relay Mode is now ${next === "true" ? "ON" : "OFF"}. Please restart the app.`, [
                { text: "OK" }
            ]);
          }}>
            <Icon name="shield-checkmark-outline" color={colors.ink} size={22} />
            <Text style={styles.rowText}>🧅 Secure Relay Proxy</Text>
            <Icon name="swap-horizontal-outline" color={colors.muted} size={20} />
          </Pressable>
        </View>

        {user?.role === "reporter" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>REPORTER</Text>
            <Pressable style={styles.row} onPress={() => router.push("/(reporter)/studio")}>
              <Icon name="mic-outline" color={colors.ink} size={22} />
              <Text style={styles.rowText}>Switch to Studio</Text>
              <Icon name="chevron-forward" color={colors.muted} size={20} />
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <Button onPress={logout} tone="outline">
            Sign out
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  scroll: { padding: 20 },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    marginLeft: 12,
  },
  rowValue: {
    fontSize: 14,
    color: colors.muted,
  },
  footer: {
    marginTop: 20,
    paddingHorizontal: 4,
  },
});
