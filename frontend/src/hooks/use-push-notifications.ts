import { useEffect } from "react";
import { useAuth } from "@/src/auth";
import { registerForPushNotificationsAsync } from "@/src/notifications";

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    registerForPushNotificationsAsync().catch(console.error);
  }, [user]);
}
