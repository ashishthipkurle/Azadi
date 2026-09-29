import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiPost, apiDelete } from "./api";

// Configure how notifications behave when the app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "web") return null;

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
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    
    // Register token with our backend
    await apiPost("/push-tokens", {
      token: token,
      platform: Platform.OS,
    });
    
    return token;
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
