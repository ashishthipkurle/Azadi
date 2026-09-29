import { useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon } from "@/src/ui";
import { storage } from "@/src/utils/storage";

const { width } = Dimensions.get("window");

export default function Onboarding() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);

  const slides = [
    {
      icon: "earth-outline",
      title: "Follow reporters",
      body: "Discover independent field reporters covering stories that matter, directly from the source.",
    },
    {
      icon: "heart-outline",
      title: "Support ₹7",
      body: "Skip the paywalls and corporate ads. Support your favorite reporters with a simple ₹7 micro-pledge.",
    },
    {
      icon: "shield-checkmark-outline",
      title: "Transparent moderation",
      body: "No silent takedowns. We believe in open, accountable, and community-driven content standards.",
    },
    {
      icon: "rocket-outline",
      title: "You're in",
      body: "Your signal is clear. Welcome to Azadi.",
    },
  ];

  const finish = async () => {
    await storage.setItem("azadi.onboarded", true);
    // Reload routing by replacing the entire navigation tree
    router.replace("/");
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={["top", "bottom"]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / width);
          setStep(page);
        }}
      >
        {slides.map((slide, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <Icon name={slide.icon as any} color={colors.red} size={80} />
            <Text style={[styles.title, { color: colors.ink }]}>{slide.title}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{slide.body}</Text>
            
            {i === slides.length - 1 ? (
              <Button onPress={finish} style={{ marginTop: 40, paddingHorizontal: 40 }}>
                Get started
              </Button>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.pagination}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === step ? colors.ink : colors.line },
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -1,
    marginTop: 30,
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
  },
});
