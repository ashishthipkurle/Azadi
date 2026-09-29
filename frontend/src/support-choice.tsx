// Support-choice bottom sheet — lets the reader pick between a one-time ₹7 tip
// and a recurring monthly ₹7 pledge before Razorpay Checkout opens.
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon } from "@/src/ui";

export type SupportInterval = "once" | "monthly";

export function SupportChoiceSheet({
  visible,
  reporterName,
  onDismiss,
  onChoose,
}: {
  visible: boolean;
  reporterName: string;
  onDismiss: () => void;
  onChoose: (amount: number, interval: SupportInterval) => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [amount, setAmount] = useState<number>(7);
  const tiers = [7, 21, 70];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.overline}>SUPPORT · ₹7</Text>
          <Text style={styles.title}>Back {reporterName}.</Text>
          <Text style={styles.body}>
            Reporters keep 100% of your support after Razorpay&apos;s platform fee.
          </Text>

          <View style={styles.segment}>
            {tiers.map((tier) => (
              <Pressable
                key={tier}
                onPress={() => setAmount(tier)}
                style={[styles.segmentItem, amount === tier && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, amount === tier && styles.segmentTextActive]}>
                  ₹{tier}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable testID="support-once-option" onPress={() => onChoose(amount, "once")} style={styles.option}>
            <View style={styles.optionIcon}>
              <Icon name="heart-outline" color={colors.red} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>One-time ₹{amount}</Text>
              <Text style={styles.optionBody}>A quick tip to say thanks for this dispatch.</Text>
            </View>
            <Icon name="chevron-forward" color={colors.muted} />
          </Pressable>

          <Pressable testID="support-monthly-option" onPress={() => onChoose(amount, "monthly")} style={[styles.option, styles.optionRed]}>
            <View style={[styles.optionIcon, { backgroundColor: "#F5E5E2" }]}>
              <Icon name="repeat" color={colors.red} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: colors.surface }]}>Monthly ₹{amount} pledge</Text>
              <Text style={[styles.optionBody, { color: "#F5C7C2" }]}>
                Auto-renews every month · cancel anytime.
              </Text>
            </View>
            <Icon name="chevron-forward" color={colors.surface} />
          </Pressable>

          <Button onPress={onDismiss} tone="outline">
            Cancel
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(24,32,42,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    padding: 22,
    paddingBottom: 32,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    gap: 8,
  },
  overline: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  segment: { flexDirection: "row", backgroundColor: colors.line, padding: 3, borderRadius: 8, marginBottom: 18 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontWeight: "800", fontSize: 14 },
  segmentTextActive: { color: colors.ink },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.paper,
    marginBottom: 10,
  },
  optionRed: { backgroundColor: colors.red, borderColor: colors.red },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  optionBody: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
