import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useAuth } from '../context/auth';
import { apiPost } from '../api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    async function registerForPushNotificationsAsync() {
      let token;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          console.log('Failed to get push token for push notification!');
          return;
        }
        
        try {
            token = (await Notifications.getExpoPushTokenAsync({
                projectId: process.env.EXPO_PUBLIC_PROJECT_ID || 'your-project-id'
            })).data;
        } catch (e) {
            console.error("Failed to get Expo push token", e);
        }
      } else {
        console.log('Must use physical device for Push Notifications');
      }

      if (token) {
        try {
          await apiPost('/users/push-token', { token });
        } catch (e) {
          console.error("Failed to register push token with backend", e);
        }
      }
    }

    registerForPushNotificationsAsync();
  }, [user]);
}
