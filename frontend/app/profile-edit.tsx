import { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";

import * as ImagePicker from "expo-image-picker";
import { stripImageMetadata } from "@/src/utils/strip-metadata";
import { Image } from "expo-image";
import { apiPatch, ApiError, API, TOKEN_KEY } from "@/src/api";
import { useAuth } from "@/src/auth";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, Icon } from "@/src/ui";

export default function ProfileEdit() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user, mutate } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [beat, setBeat] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setBeat(user.beat || "");
      setLocation(user.location || "");
      setBio(user.bio || "");
      setAvatar(user.avatar_url || "");
    }
  }, [user]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setBusy(true);
      setError("");
      try {
        const asset = result.assets[0];
        // Strip EXIF metadata (GPS, camera info) before upload
        const cleanUri = await stripImageMetadata(asset.uri);
        const formData = new FormData();
        formData.append("file", {
          uri: cleanUri,
          name: asset.fileName || "avatar.jpg",
          type: asset.mimeType || "image/jpeg",
        } as any);

        const token = await storage.secureGet(TOKEN_KEY, "");
        const res = await fetch(`${API}/profile/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        
        setAvatar(data.avatar_url);
        if (user) {
          await mutate({ ...user, avatar_url: data.avatar_url });
        }
      } catch (e) {
        setError("Failed to upload avatar");
      } finally {
        setBusy(false);
      }
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(reporter)/(tabs)/articles");
    }
  };

  const saveProfile = async () => {
    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updatedUser = await apiPatch("/profile", {
        name: name.trim(),
        beat: beat.trim() || undefined,
        location: location.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      await mutate(updatedUser);
      handleBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Icon name="arrow-back" color={colors.ink} size={28} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Update your profile.</Text>
        <Text style={styles.helperText}>This is what others see on your public page.</Text>

        <View style={styles.avatarRow}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarImage, { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ color: colors.muted, fontWeight: "800", fontSize: 24 }}>{user?.name?.[0]}</Text>
            </View>
          )}
          <Button onPress={pickAvatar} tone="outline" size="sm" loading={busy}>
            Change photo
          </Button>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.input}
          placeholder="Your full name"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Beat (120 chars max)</Text>
        <TextInput
          value={beat}
          onChangeText={setBeat}
          style={styles.input}
          placeholder="e.g. Climate & civic life"
          placeholderTextColor={colors.muted}
          maxLength={120}
        />

        <Text style={styles.label}>Location</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          style={styles.input}
          placeholder="e.g. Bihar, India"
          placeholderTextColor={colors.muted}
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          style={[styles.input, { height: 100, textAlignVertical: "top" }]}
          placeholder="Tell readers about your work and why they should support you."
          placeholderTextColor={colors.muted}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button onPress={saveProfile} loading={busy} style={{ marginTop: 20 }}>
          Save profile
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -1,
    marginBottom: 8,
  },
  helperText: { color: colors.muted, fontSize: 14, marginBottom: 24 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24 },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  error: { color: colors.red, fontSize: 13, marginBottom: 12, fontWeight: "700" },
});
