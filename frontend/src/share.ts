import { Share, Platform } from "react-native";
import * as Linking from "expo-linking";

export type ShareResult = {
  success: boolean;
  method?: "share" | "clipboard";
  error?: any;
};

export async function sharePost(post: { id: string; title: string; reporter_name?: string }): Promise<ShareResult> {
  const url = Linking.createURL(`post/${post.id}`, { scheme: "azadi" });
  const reporter = post.reporter_name ? ` — by ${post.reporter_name}` : "";
  const message = `Check out this dispatch on Azadi: ${post.title}${reporter}\n\n${url}`;

  try {
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: post.title,
          text: message,
          url: url,
        });
        return { success: true, method: "share" };
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        return { success: true, method: "clipboard" };
      }
    }

    const result = await Share.share({
      message,
      url,
      title: post.title,
    });
    if (result.action === Share.sharedAction) {
      return { success: true, method: "share" };
    }
    return { success: false };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { success: false };
    }
    console.error("Error sharing post:", error);
    return { success: false, error };
  }
}

export async function shareProfile(message: string, url: string): Promise<ShareResult> {
  try {
    if (Platform.OS === "web") {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          text: message,
          url: url,
        });
        return { success: true, method: "share" };
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${message}\n\n${url}`);
        return { success: true, method: "clipboard" };
      }
    }

    const result = await Share.share({
      message,
      url,
    });
    if (result.action === Share.sharedAction) {
      return { success: true, method: "share" };
    }
    return { success: false };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return { success: false };
    }
    console.error("Error sharing profile:", error);
    return { success: false, error };
  }
}

