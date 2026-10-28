/**
 * Shared App Header component.
 * Used across reader and reporter screens.
 * Features:
 * - Guaranteed mathematically dead-centered "azadi" logo across all displays using absolute centering.
 * - Dynamic responsive layout: on smaller displays, moves the search icon to the left side to balance
 *   left & right icon groups and ensure maximum clearance for the centered logo.
 */
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

type HeaderProps = {
  /** Route prefix: "/(reporter)" or "/(reader)" */
  routePrefix: string;
  /** Optional subtitle under the logo (default: "THE DISPATCH WALL") */
  subtitle?: string;
  /** Whether to show a back button instead of mic icon */
  showBack?: boolean;
  /** Whether to show the unread notification dot */
  hasUnread?: boolean;
  /** Whether to show the settings (menu) icon */
  showMenu?: boolean;
  /** Custom left icon press handler (overrides default mic/studio action) */
  onLeftPress?: () => void;
};

export function AppHeader({
  routePrefix,
  subtitle = "THE DISPATCH WALL",
  showBack = false,
  hasUnread = false,
  showMenu = false,
  onLeftPress,
}: HeaderProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const router = useRouter();
  const { width } = useWindowDimensions();

  // If display is small (mobile width < 420), move search button to left side
  // so both left and right have balanced icon count and logo is always 100% centered without crowding.
  const isSmallDisplay = width < 420;

  const defaultLeftPress = () => {
    if (onLeftPress) {
      onLeftPress();
      return;
    }
    if (showBack) {
      if (router.canGoBack()) {
        router.back();
      } else {
        const homeRoute = routePrefix === "/(reporter)" ? "/(reporter)/(tabs)" : "/(reader)/(tabs)";
        router.replace(homeRoute as any);
      }
    } else {
      router.push(`${routePrefix}/studio` as any);
    }
  };

  const searchBtn = (
    <Pressable
      testID="header-search-btn"
      onPress={() => router.push(`${routePrefix}/search` as any)}
      style={styles.iconBtn}
      hitSlop={8}
    >
      <Icon name="search-outline" color={colors.ink} size={22} />
    </Pressable>
  );

  return (
    <View style={styles.header}>
      {/* 1. Left Side Icons */}
      <View style={styles.sideLeft} pointerEvents="box-none">
        <Pressable
          testID="header-left-btn"
          onPress={onLeftPress || defaultLeftPress}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Icon
            name={showBack ? "chevron-back" : "mic"}
            color={colors.ink}
            size={22}
          />
        </Pressable>

        {/* On small displays, place search on the left to keep balance */}
        {isSmallDisplay && searchBtn}
      </View>

      {/* 2. Absolute Dead-Centered Brand Logo */}
      <View style={styles.centerAbsolute} pointerEvents="none">
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Text style={styles.wordmark}>azadi</Text>
          <View style={styles.signalDot} />
        </View>
        <Text style={styles.kicker} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {/* 3. Right Side Icons */}
      <View style={styles.sideRight} pointerEvents="box-none">
        {/* On larger displays, search button sits on the right */}
        {!isSmallDisplay && searchBtn}

        <Pressable
          testID="header-notifications-btn"
          onPress={() => router.push(`${routePrefix}/notifications` as any)}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <View>
            <Icon name="notifications-outline" color={colors.ink} size={22} />
            {hasUnread && <View style={styles.unreadDot} />}
          </View>
        </Pressable>

        {showMenu && (
          <Pressable
            testID="header-menu-btn"
            onPress={() => router.push("/settings")}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Icon name="menu-outline" color={colors.ink} size={24} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    header: {
      position: "relative",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 52,
      backgroundColor: colors.paper,
    },
    sideLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      zIndex: 2,
    },
    centerAbsolute: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    sideRight: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 12,
      zIndex: 2,
    },
    iconBtn: {
      width: 36,
      height: 36,
      justifyContent: "center",
      alignItems: "center",
    },
    wordmark: {
      color: colors.ink,
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    signalDot: {
      width: 5,
      height: 5,
      borderRadius: 5,
      backgroundColor: colors.red,
      marginLeft: 3,
      marginTop: 5,
    },
    kicker: {
      fontSize: 8,
      letterSpacing: 1.2,
      color: colors.muted,
      marginTop: 2,
      fontWeight: "800",
    },
    unreadDot: {
      position: "absolute",
      top: -2,
      right: -2,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.red,
      borderWidth: 1.5,
      borderColor: colors.paper,
    },
  });
