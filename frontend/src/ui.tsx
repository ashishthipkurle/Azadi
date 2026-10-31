// Shared UI primitives used across the reader/reporter/admin routes.
// Kept small and dependency-free so the design tokens in theme.ts stay
// the single source of truth.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import {   } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";

export function Icon({
  name,
  color = "#18202A",
  size = 20,
  style,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color?: string;
  size?: number;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <Ionicons name={name} color={color} size={size} style={style} />;
}

type ButtonTone = "dark" | "red" | "paper" | "outline" | "ghost";

export function Button({
  children,
  onPress,
  tone = "dark",
  testID,
  disabled,
  loading,
  icon,
  accessibilityLabel,
  accessibilityHint,
  style,
}: {
  children: string;
  onPress: () => void | Promise<void>;
  tone?: ButtonTone;
  testID?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: any;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => Promise.resolve(onPress()).catch(() => {})}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        style,
        tone === "red" && styles.redButton,
        tone === "paper" && styles.paperButton,
        tone === "outline" && styles.outlineButton,
        tone === "ghost" && styles.ghostButton,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {icon ? (
        <Icon
          name={icon}
          color={tone === "paper" || tone === "outline" || tone === "ghost" ? colors.ink : colors.surface}
          size={17}
        />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          (tone === "paper" || tone === "outline" || tone === "ghost") && styles.paperButtonText,
        ]}
      >
        {loading ? "Working…" : children}
      </Text>
    </Pressable>
  );
}

export function Toast({
  message,
  tone = "info",
  onDismiss,
  testID = "toast",
}: {
  message: string;
  tone?: "info" | "success" | "error";
  onDismiss?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
        onDismiss?.(),
      );
    }, 3200);
    return () => clearTimeout(t);
  }, [message, opacity, onDismiss]);

  const palette =
    tone === "success"
      ? { bg: "#E4EFE8", text: colors.green, icon: "checkmark-circle" as const }
      : tone === "error"
        ? { bg: "#F5E5E2", text: colors.red, icon: "alert-circle" as const }
        : { bg: "#E7EEF2", text: colors.blue, icon: "information-circle" as const };

  return (
    <Animated.View
      testID={testID}
      style={[styles.toast, { backgroundColor: palette.bg, opacity }]}
      pointerEvents="none"
    >
      <Icon name={palette.icon} color={palette.text} size={18} />
      <Text style={[styles.toastText, { color: palette.text }]}>{message}</Text>
    </Animated.View>
  );
}

export function Overline({ children, tone }: { children: string; tone?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <Text style={[styles.overline, tone ? { color: tone } : null]}>{children}</Text>;
}

export function Rule() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={styles.rule} />;
}


export function ConfirmModal({ visible, title, body, onConfirm, onCancel, confirmText = "Confirm" }: { visible: boolean, title: string, body: string, onConfirm: () => void, onCancel: () => void, confirmText?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
        <View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 8, width: "100%", maxWidth: 400 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: 12 }}>{title}</Text>
          <Text style={{ fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 24 }}>{body}</Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
            <Button onPress={onCancel} tone="outline" style={{ minHeight: 40, paddingHorizontal: 16 }}>Cancel</Button>
            <Button onPress={onConfirm} tone="red" style={{ minHeight: 40, paddingHorizontal: 16 }}>{confirmText}</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.empty}>
      {icon ? <Icon name={icon} color={colors.muted} size={28} /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}


export function ReelSkeleton({ style }: { style?: any }) {
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.85,
          duration: 850,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 850,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim]);

  return (
    <View style={[skeletonStyles.container, style]} pointerEvents="none">
      {/* Animated shimmer pulse background */}
      <Animated.View style={[skeletonStyles.shimmerBg, { opacity: pulseAnim }]} />

      {/* Center media loader badge */}
      <View style={skeletonStyles.centerBadge}>
        <Animated.View style={[skeletonStyles.centerIconCircle, { opacity: pulseAnim }]}>
          <View style={skeletonStyles.playIconTriangle} />
        </Animated.View>
      </View>

      {/* Bottom Skeleton Overlays (matching reporter and text placement) */}
      <View style={skeletonStyles.bottomOverlay} pointerEvents="none">
        <View style={skeletonStyles.reporterRow}>
          <Animated.View style={[skeletonStyles.avatarSkeleton, { opacity: pulseAnim }]} />
          <View style={skeletonStyles.nameBlock}>
            <Animated.View style={[skeletonStyles.namePill, { opacity: pulseAnim }]} />
            <Animated.View style={[skeletonStyles.badgePill, { opacity: pulseAnim }]} />
          </View>
        </View>
        <Animated.View style={[skeletonStyles.textLineLong, { opacity: pulseAnim }]} />
        <Animated.View style={[skeletonStyles.textLineShort, { opacity: pulseAnim }]} />
      </View>

      {/* Right Action Icons Skeleton */}
      <View style={skeletonStyles.rightOverlay} pointerEvents="none">
        <Animated.View style={[skeletonStyles.actionCircle, { opacity: pulseAnim }]} />
        <Animated.View style={[skeletonStyles.actionCircle, { opacity: pulseAnim }]} />
        <Animated.View style={[skeletonStyles.actionCircle, { opacity: pulseAnim }]} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0d0d0d",
    overflow: "hidden",
  },
  shimmerBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1c1c1f",
  },
  centerBadge: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  centerIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  playIconTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderTopColor: "transparent",
    borderBottomWidth: 10,
    borderBottomColor: "transparent",
    borderLeftWidth: 16,
    borderLeftColor: "rgba(255,255,255,0.4)",
    marginLeft: 4,
  },
  bottomOverlay: {
    position: "absolute",
    left: 16,
    bottom: 24,
    width: "70%",
    gap: 10,
  },
  reporterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarSkeleton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  nameBlock: {
    gap: 4,
  },
  namePill: {
    width: 110,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  badgePill: {
    width: 55,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  textLineLong: {
    width: "90%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  textLineShort: {
    width: "55%",
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  rightOverlay: {
    position: "absolute",
    right: 14,
    bottom: 40,
    alignItems: "center",
    gap: 18,
  },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
});

const createStyles = (colors: any) => StyleSheet.create({
  button: {
    backgroundColor: colors.ink,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 10,
  },
  redButton: { backgroundColor: colors.red },
  paperButton: { backgroundColor: colors.paper },
  outlineButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  ghostButton: { backgroundColor: "transparent" },
  buttonText: { color: colors.surface, fontWeight: "800", fontSize: 14 },
  paperButtonText: { color: colors.ink },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 100,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    zIndex: 999,
  },
  toastText: { flex: 1, fontSize: 13, fontWeight: "700" },
  overline: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "800" },
  rule: { height: 1, backgroundColor: colors.line, marginVertical: 24 },
  empty: {
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    backgroundColor: colors.surface,
  },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", textAlign: "center" },
  emptyBody: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
