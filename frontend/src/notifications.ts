import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiPost, apiDelete } from "./api";

// Configure how notifications behave when the app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "web") return null;

  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#E50914",
        sound: "default",
      });
    } catch (e) {
      console.warn("Android notification channel setup warning:", e);
    }
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Failed to get push token for push notification!");
    return null;
  }

  try {
    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync();
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Constants = require("expo-constants").default;
        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ||
          Constants?.easConfig?.projectId ||
          process.env.EXPO_PUBLIC_PROJECT_ID;
        tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      } catch {}
    }

    const token = tokenData?.data;
    if (token) {
      // Register token with our backend across both endpoints
      await Promise.allSettled([
        apiPost("/push-tokens", { token, platform: Platform.OS }),
        apiPost("/users/push-token", { token, platform: Platform.OS }),
      ]);
      return token;
    }
    return null;
  } catch (e) {
    console.error("Error getting or registering push token:", e);
    return null;
  }
}

export async function unregisterPushTokenAsync(token: string) {
  if (!token || Platform.OS === "web") return;
  try {
    await apiDelete(`/push-tokens?token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error("Error unregistering push token:", e);
  }
}
