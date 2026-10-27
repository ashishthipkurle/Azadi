import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export function AzadiAnimatedSplash({ onFinish }: { onFinish: () => void }) {
  // Fade & scale animations for the wordmark
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  // Dot pop & pulse
  const dotScale = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0.7)).current;

  // Tagline animation
  const tagFade = useRef(new Animated.Value(0)).current;
  const tagTranslate = useRef(new Animated.Value(10)).current;

  // Overall exit fade
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Hide static OS splash immediately so the animated logo is revealed
    SplashScreen.hideAsync().catch(() => {});

    // Start ripple loop around the red dot
    const rippleLoop = Animated.loop(
      Animated.parallel([
        Animated.timing(rippleScale, {
          toValue: 2.2,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rippleOpacity, {
          toValue: 0,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Main animation sequence
    Animated.sequence([
      // 1. Logo fades and gently scales in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      // 2. Red signal dot springs in with bounce
      Animated.spring(dotScale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
      // 3. Tagline slides up
      Animated.parallel([
        Animated.timing(tagFade, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(tagTranslate, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
      ]),
      // 4. Hold briefly so the user enjoys the brand mark
      Animated.delay(600),
      // 5. Smooth exit transition into main application
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      rippleLoop.stop();
      onFinish();
    });

    rippleLoop.start();

    // Fallback safety timeout
    const timeout = setTimeout(onFinish, 2800);
    return () => {
      clearTimeout(timeout);
      rippleLoop.stop();
    };
  }, [onFinish]);

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onFinish}>
      <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
        <View style={styles.centerBox}>
          {/* Logo Brand Mark */}
          <Animated.View
            style={[
              styles.logoRow,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Text style={styles.wordmark}>azadi</Text>

            {/* Red Live Signal Dot with animated pulse ripple */}
            <View style={styles.dotAnchor}>
              <Animated.View
                style={[
                  styles.dotRipple,
                  {
                    transform: [{ scale: rippleScale }],
                    opacity: rippleOpacity,
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.signalDot,
                  {
                    transform: [{ scale: dotScale }],
                  },
                ]}
              >
                <View style={styles.dotHighlight} />
              </Animated.View>
            </View>
          </Animated.View>

          {/* Editorial Tagline */}
          <Animated.View
            style={[
              styles.taglineContainer,
              {
                opacity: tagFade,
                transform: [{ translateY: tagTranslate }],
              },
            ]}
          >
            <View style={styles.divider} />
            <Text style={styles.tagline}>INDEPENDENT JOURNALISM</Text>
            <View style={styles.divider} />
          </Animated.View>
        </View>

        {/* Bottom micro-kicker */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>PEOPLE'S DISPATCH</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F4F0E8", // Signature vintage paper cream background
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  wordmark: {
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif-black",
    fontWeight: "900",
    fontSize: 68,
    color: "#18202A",
    letterSpacing: -2.5,
  },
  dotAnchor: {
    width: 24,
    height: 24,
    marginLeft: 6,
    marginTop: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  signalDot: {
    width: 18,
    height: 18,
    borderRadius: 18,
    backgroundColor: "#E63946",
    shadowColor: "#E63946",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    padding: 3,
  },
  dotHighlight: {
    width: 4,
    height: 4,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    opacity: 0.7,
  },
  dotRipple: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#E63946",
  },
  taglineContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    gap: 12,
  },
  divider: {
    width: 24,
    height: 1,
    backgroundColor: "rgba(24, 32, 42, 0.25)",
  },
  tagline: {
    fontSize: 10,
    fontWeight: "800",
    color: "#4A5568",
    letterSpacing: 3,
  },
  footer: {
    position: "absolute",
    bottom: 40,
    alignItems: "center",
  },
  footerText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#8B95A0",
    letterSpacing: 2,
  },
});
