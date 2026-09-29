import { Share, Platform } from "react-native";
import * as Linking from "expo-linking";

export async function sharePost(post: { id: string; title: string; reporter_name: string }) {
  const url = Linking.createURL(`post/${post.id}`, { scheme: "azadi" });
  const message = `Check out this dispatch on Azadi: ${post.title} — by ${post.reporter_name}\n\n${url}`;

  try {
    if (Platform.OS === "web" && navigator.share) {
      await navigator.share({
        title: post.title,
        text: message,
        url: url,
      });
    } else {
      await Share.share({
        message,
        url,
        title: post.title,
      });
    }
  } catch (error) {
    console.error("Error sharing post:", error);
  }
}

export async function shareProfile(message: string, url: string) {
  try {
    if (Platform.OS === "web" && navigator.share) {
      await navigator.share({
        text: message,
        url: url,
      });
    } else {
      await Share.share({
        message,
        url,
      });
    }
  } catch (error) {
    console.error("Error sharing profile:", error);
  }
}
