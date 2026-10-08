// Welcome screen — full-screen carousel with images, shown before auth.
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";

import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Use require for static images so Metro bundles them
const heroImg = require("@/assets/images/welcome_hero.jpg");
const supportImg = require("@/assets/images/welcome_support.jpg");
const communityImg = require("@/assets/images/welcome_community.jpg");
const welcomeVideo = require("@/assets/videos/welcome_video_one.mp4");

const SLIDES = [
  {
    key: "1",
    image: heroImg,
    video: welcomeVideo,
    overline: "INDEPENDENT JOURNALISM",
    title: "Your story.\nYour signal.",
    body: "A place for field reporters and the people who choose to listen — without editorial gatekeeping.",
  },
  {
    key: "2",
    image: supportImg,
    video: null,
    overline: "DIRECT SUPPORT",
    title: "Back the reporters\nyou trust.",
    body: "100% of your support reaches the reporter after platform fees. No middlemen, fully transparent.",
  },
  {
    key: "3",
    image: communityImg,
    video: null,
    overline: "ACCOUNTABLE MODERATION",
    title: "No silent\ntakedowns.",
    body: "Every moderation action is evidence-based, transparent, and always appealable.",
  },
];

function WelcomeSlide({ item, isActive }: { item: (typeof SLIDES)[0]; isActive: boolean }) {
  const player = useVideoPlayer(item.video, player => {
    player.loop = true;
    // Browsers block autoplay of unmuted videos; mute on web for initial autoplay.
    player.muted = Platform.OS === "web";
  });

  useEffect(() => {
    if (item.video && player) {
      if (isActive) {
        player.play();
      } else {
        player.pause();
      }
    }
  }, [isActive, item.video, player]);

  return (
    <View style={styles.slide}>
      <View style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        aspectRatio: 9 / 16,
        overflow: "hidden",
      }}>
        {item.video ? (
          <VideoView 
            player={player} 
            style={{ width: "100%", height: "100%", transform: [{ scale: 1.015 }] }} 
            contentFit="fill" 
            nativeControls={false} 
          />
        ) : (
          <Image 
            source={item.image} 
            style={{ width: "100%", height: "100%" }} 
            resizeMode="stretch" 
          />
        )}
      </View>
      <LinearGradient
        colors={["transparent", "rgba(24,32,42,0.75)", "rgba(24,32,42,0.95)"]}
        locations={[0.25, 0.55, 1]}
        style={styles.gradient}
      />
      <View style={styles.slideContent}>
        <Text style={styles.overline}>{item.overline}</Text>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideBody}>{item.body}</Text>
      </View>
    </View>
  );
}

export function WelcomeScreen({ onSignIn, onCreateAccount }: { onSignIn: () => void; onCreateAccount: () => void }) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_W);
    if (index >= 0 && index < SLIDES.length && index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      const nextIndex = activeIndex + 1;
      flatListRef.current?.scrollToOffset({ offset: nextIndex * SCREEN_W, animated: true });
      setActiveIndex(nextIndex);
    }
  };

  const renderSlide = ({ item, index }: { item: (typeof SLIDES)[0]; index: number }) => (
    <WelcomeSlide item={item} isActive={index === activeIndex} />
  );

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.key}
        bounces={false}
      />

      {/* Brand watermark */}
      <View style={styles.brandOverlay}>
        <Text style={styles.brandText}>azadi</Text>
        <View style={styles.brandDot} />
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        {/* Action buttons */}
        {isLast ? (
          <>
            <Pressable
              testID="welcome-signin"
              onPress={onSignIn}
              style={styles.nextButton}
            >
              <Text style={styles.nextButtonText}>Sign in</Text>
            </Pressable>
            <Pressable onPress={onCreateAccount} style={styles.skipButton}>
              <Text style={styles.createText}>New here? <Text style={styles.createLink}>Create an account</Text></Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              testID="welcome-next"
              onPress={goNext}
              style={styles.nextButton}
            >
              <Text style={styles.nextButtonText}>Next</Text>
              <Icon name="chevron-forward" color="#FFFDF8" size={18} />
            </Pressable>
            <Pressable onPress={onSignIn} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </>
        )}

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#18202A" },
  slide: { width: SCREEN_W, height: SCREEN_H },
  slideImage: { width: SCREEN_W, height: SCREEN_H, position: "absolute" },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_H * 0.65,
  },
  slideContent: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 200,
  },
  overline: {
    color: "#F4F0E8",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "800",
    opacity: 0.7,
    marginBottom: 12,
  },
  slideTitle: {
    color: "#FFFDF8",
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: -1.5,
    marginBottom: 14,
  },
  slideBody: {
    color: "#D7D1C6",
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 320,
  },
  brandOverlay: {
    position: "absolute",
    top: 54,
    left: 24,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  brandText: {
    color: "#FFFDF8",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -1,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 8,
    backgroundColor: "#B42318",
    marginLeft: 4,
    marginTop: 5,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 50,
    gap: 16,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,253,248,0.3)",
  },
  dotActive: {
    backgroundColor: "#FFFDF8",
    width: 24,
  },
  nextButton: {
    backgroundColor: "#B42318",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 8,
  },
  nextButtonText: {
    color: "#FFFDF8",
    fontSize: 16,
    fontWeight: "800",
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    color: "rgba(255,253,248,0.5)",
    fontSize: 14,
    fontWeight: "700",
  },
  createText: {
    color: "rgba(255,253,248,0.6)",
    fontSize: 14,
    fontWeight: "600",
  },
  createLink: {
    color: "#FFFDF8",
    fontWeight: "800",
    textDecorationLine: "underline" as const,
  },
});

// Expo Router requires every file in the `app` directory to have a default export.
// We export a dummy component here to satisfy the router, while the actual WelcomeScreen 
// is used as a named export in `app/index.tsx`.
export default function WelcomeRoute() {
  return null;
}
