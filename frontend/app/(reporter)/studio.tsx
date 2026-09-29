// Reporter studio:
// - "Write" mode publishes text posts via POST /api/posts, with optional Mux
//   media attachments (image or video, uploaded via /api/media/upload-url).
// - "Go live" mode requests a LiveKit token from POST /api/live/token, then
//   connects to the room and publishes camera + mic tracks.
//
// Both flows fall back to a friendly "coming soon" message when the backend
// returns HTTP 503 (provider keys not yet configured).
import * as ImagePicker from "expo-image-picker";
import { stripImageMetadata, stripVideoMetadata } from "@/src/utils/strip-metadata";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { apiDelete, apiGet, apiPatch, apiPost, ApiError, API, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/auth";
import { LiveStage } from "@/src/live-stage";
import { publishLive, type LiveConnection } from "@/src/livekit";
import { MediaPlayer, type MediaAttachment } from "@/src/media-player";
import { uploadToMux } from "@/src/mux";
import { C } from "@/src/theme";
import { useTheme } from "@/src/hooks/use-theme";
import { Button, EmptyState, Icon, Toast } from "@/src/ui";
import { RichEditor, type RichEditorRef } from "@/src/rich-editor";

type MyPost = {
  id: string;
  title: string;
  body: string;
  kind: string;
  created_at: string;
  verified: boolean;
  media?: MediaAttachment[];
};

type Earnings = {
  lifetime: number;
  verified_count: number;
  pending_amount: number;
  pending_count: number;
  monthly_pledges: number;
  top_supporters: { supporter_id: string; name: string; total: number; count: number }[];
};

type Block = {
  id: string;
  type: "text" | "image" | "video";
  content?: string;
  local_uri?: string;
  playback_id?: string;
  status?: "uploading" | "processing" | "ready" | "error";
};

type Attachment = {
  kind: "image" | "video";
  local_uri: string;
  playback_id?: string;
  status: "uploading" | "processing" | "ready" | "error";
};

export default function Studio() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user, logout } = useAuth();
  const [mode, setMode] = useState<"story" | "live" | "earnings" | "analytics">("story");
  const [analytics, setAnalytics] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [editorHtml, setEditorHtml] = useState("");
  const editorRef = useRef<RichEditorRef>(null);
  const [blocks, setBlocks] = useState<Block[]>([{ id: Math.random().toString(), type: "text", content: "" }]);
  const [location, setLocation] = useState("On the ground");
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [topic, setTopic] = useState<string>("Uncategorized");
  const [scheduleHours, setScheduleHours] = useState<number>(0);
  const [kind, setKind] = useState<"field report" | "photo essay" | "dispatch" | "article">("dispatch");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [sessionMeta, setSessionMeta] = useState<{ room: string } | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<any>(null);
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const disconnectingRef = useRef(false);

  useEffect(() => {
    async function init() {
      if (editId) {
        setMode("story");
        try {
          const data = await apiGet<MyPost>(`/posts/${editId}`);
          setTitle(data.title);
          setKind(data.kind as any);
          const newBlocks: Block[] = [{ id: "1", type: "text", content: data.body }];
          if (data.media) {
            data.media.forEach((m, i) => {
              newBlocks.push({ id: `m${i}`, type: m.kind, playback_id: m.playback_id, status: "ready" });
            });
          }
          setBlocks(newBlocks);
        } catch {
          setToast({ message: "Could not load post for editing", tone: "error" });
        }
      } else {
        try {
          const draft = await AsyncStorage.getItem("studio_draft");
          if (draft) {
            const parsed = JSON.parse(draft);
            setTitle(parsed.title || "");
            setKind(parsed.kind || "dispatch");
            if (parsed.blocks && parsed.blocks.length > 0) {
              setBlocks(parsed.blocks);
            }
          }
        } catch {}
      }
    }
    init();

    async function fetchLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setLatitude(loc.coords.latitude);
          setLongitude(loc.coords.longitude);
          
          const reverse = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });
          if (reverse.length > 0) {
            const addr = reverse[0];
            const name = addr.city || addr.region || addr.country;
            if (name) setLocation(name);
          }
        }
      } catch (e) {
        // Fallback to "On the ground"
      }
    }
    fetchLocation();

  }, [editId]);

  useEffect(() => {
    if (editId || mode !== "story") return;
    const draft = { title, kind, blocks };
    AsyncStorage.setItem("studio_draft", JSON.stringify(draft)).catch(() => {});
  }, [title, kind, blocks, editId, mode]);

  const loadPosts = useCallback(async () => {
    try {
      const p = await apiGet<MyPost[]>("/posts/mine");
      setPosts(p);
    } catch {
      /* silent */
    }
  }, []);

  
  const loadAnalytics = useCallback(async () => {
    try {
      const a = await apiGet<any>("/reporter/analytics");
      setAnalytics(a);
    } catch {
    }
  }, []);

  const loadEarnings = useCallback(async () => {
    try {
      const e = await apiGet<Earnings>("/reporter/earnings");
      setEarnings(e);
    } catch {
      /* silent — earnings tab shows its own empty state */
    }
  }, []);

  useEffect(() => {
    loadPosts();
    loadEarnings();
    loadAnalytics();
  }, [loadPosts, loadEarnings, loadAnalytics]);

  // Clean up any live connection when the studio unmounts.
  useEffect(() => {
    return () => {
      if (connection) connection.disconnect().catch(() => {});
    };
  }, [connection]);

  const uploadDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*" });
      if (res.canceled || !res.assets?.length) return;
      const file = res.assets[0];
      
      setToast({ message: "Importing document...", tone: "info" });
      
      const currentContent = await editorRef.current?.getContent() || "";
      const loadingHtml = currentContent + "<p><i>Loading document...</i></p>";
      editorRef.current?.setContent(loadingHtml);
      setEditorHtml(loadingHtml);
      
      let content = "";
      try {
        const formData = new FormData();
        // Determine mime type if missing
        let mimeType = file.mimeType || "application/octet-stream";
        if (file.name.toLowerCase().endsWith(".pdf")) mimeType = "application/pdf";
        if (file.name.toLowerCase().endsWith(".docx")) mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        
        if (Platform.OS === "web") {
          const blobRes = await fetch(file.uri);
          const blob = await blobRes.blob();
          formData.append("file", blob, file.name);
        } else {
          formData.append("file", {
            uri: file.uri,
            name: file.name,
            type: mimeType,
          } as any);
        }

        const token = await storage.secureGet(TOKEN_KEY, "");
        const response = await fetch(`${API}/extract-text`, {
          method: "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Extraction failed: ${response.status}`);
        }
        
        const result = await response.json();
        content = result.html || result.text || "";
      } catch (err) {
        // Fallback: If backend fails or not set up, try local read for plain text
        let fallbackText = "";
        if (Platform.OS === "web") {
          const fallbackRes = await fetch(file.uri);
          fallbackText = await fallbackRes.text();
        } else {
          fallbackText = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
        }
        if (fallbackText) {
          const safeContent = fallbackText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          content = "<div>" + safeContent.replace(/\n/g, "<br>") + "</div><p><br></p>";
        }
      }

      if (content) {
        // Append to existing content or set if empty
        editorRef.current?.setContent(currentContent + content);
        setEditorHtml(currentContent + content);
        
        setToast({ message: "Document imported successfully.", tone: "success" });
      } else {
        // Revert loading text
        editorRef.current?.setContent(currentContent);
        setEditorHtml(currentContent);
        setToast({ message: "No text found in document.", tone: "error" });
      }
    } catch (e) {
      // Revert loading text
      const currentContent = await editorRef.current?.getContent() || "";
      const baseContent = currentContent.replace("<p><i>Loading document...</i></p>", "");
      editorRef.current?.setContent(baseContent);
      setEditorHtml(baseContent);
      setToast({ message: "Failed to read document.", tone: "error" });
    }
  };

  const attachMedia = async (variant: "image" | "video") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        setToast({ message: "Enable photo access in Settings to attach media.", tone: "error" });
        Linking.openSettings();
      } else {
        setToast({ message: "Photo access is needed to attach media.", tone: "info" });
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        variant === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    // For images, strip EXIF metadata then insert inline into the rich editor
    if (variant === "image") {
      const cleanUri = await stripImageMetadata(asset.uri);
      editorRef.current?.insertImage(cleanUri);
      return;
    }
    // For video, strip what we can then use the old block flow (Mux upload)
    const cleanVideoUri = await stripVideoMetadata(asset.uri);
    const blockId = Math.random().toString();
    const entry: Block = { id: blockId, type: variant, local_uri: cleanVideoUri, status: "uploading" };
    setBlocks((prev) => [...prev, entry]);
    try {
      const media = await uploadToMux(
        {
          uri: cleanVideoUri,
          fileName: asset.fileName || undefined,
          mimeType: asset.mimeType || undefined,
        },
        (phase) => {
          setBlocks((prev) =>
            prev.map((b) => (b.id === blockId ? { ...b, status: phase } : b)),
          );
        },
      );
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? { ...b, status: media.playback_id ? "ready" : "processing", playback_id: media.playback_id }
            : b,
        ),
      );
      if (!media.playback_id) {
        setToast({ message: "Mux is still processing — you can publish and it'll appear soon.", tone: "info" });
      }
    } catch (e) {
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, status: "error" } : b)));
      const message = e instanceof ApiError ? e.message : "Upload failed.";
      setToast({ message, tone: e instanceof ApiError && e.status === 503 ? "info" : "error" });
    }
  };

  const removeAttachment = (uri: string) =>
    setAttachments((prev) => prev.filter((a) => a.local_uri !== uri));

  const publish = async () => {
    if (user?.role === "reporter" && !user?.beat) {
      setToast({ message: "Welcome! Tell us your beat before publishing.", tone: "info" });
      router.push("/profile-edit");
      return;
    }
    if (title.trim().length < 4) {
      setToast({ message: "Give your post a clear headline.", tone: "error" });
      return;
    }
    // Get HTML body from rich editor
    const htmlBody = await editorRef.current?.getContent() || editorHtml;
    const plainText = await editorRef.current?.getPlainText() || "";
    if (plainText.trim().length < 10) {
      setToast({ message: "Write at least a sentence from the field.", tone: "error" });
      return;
    }
    const uploading = blocks.filter((b) => b.type !== "text" && b.status === "uploading");
    if (uploading.length) {
      setToast({ message: "Wait for uploads to finish before publishing.", tone: "info" });
      return;
    }
    setBusy(true);
    try {
      let scheduled_at = undefined;
      if (scheduleHours > 0) {
        const d = new Date();
        d.setHours(d.getHours() + scheduleHours);
        scheduled_at = d.toISOString();
      }
      const media = blocks
        .filter((b) => b.type !== "text" && (b.status === "ready" || b.status === "processing"))
        .map((b) => ({ kind: b.type, playback_id: b.playback_id }));
      const postPayload = {
        title: title.trim(),
        body: htmlBody,
        kind,
        location,
        latitude,
        longitude,
        media,
        blocks: [],
        scheduled_at,
        topic,
      };
      if (editId) {
        await apiPatch(`/posts/${editId}`, postPayload);
      } else {
        await apiPost("/posts", postPayload);
        AsyncStorage.removeItem("studio_draft").catch(() => {});
      }
      if (!editId) {
        setTitle("");
        setEditorHtml("");
        editorRef.current?.setContent("");
        setBlocks([{ id: Math.random().toString(), type: "text", content: "" }]);
        setAttachments([]);
      }
      setToast({ message: editId ? "Post updated." : "Post published to the wall.", tone: "success" });
      if (editId) { router.replace("/(reporter)/profile"); return; }
      
      await loadPosts();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not publish.";
      setToast({ message, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const goLive = async () => {
    setBusy(true);
    try {
      const res = await apiPost<{ token: string; url: string; room: string }>("/live/token", {
        title: title.trim() || "Live from the field",
      });
      const conn = await publishLive({ url: res.url, token: res.token });
      setConnection(conn);
      setSessionMeta({ room: res.room });
      // Grab the local video track once it's published so we can preview it.
      const attach = () => {
        const pub = conn.room.localParticipant.getTrackPublication?.((globalThis as any).LKKind?.Video || "video");
        if (pub?.track) setLocalVideoTrack(pub.track);
      };
      attach();
      setTimeout(attach, 500);
      setTimeout(attach, 1500);
      setToast({ message: `Live in room ${res.room.slice(-6)}. Readers can watch now.`, tone: "success" });
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? `Live could not start: ${e.message}`
            : "Live could not start.";
      const tone = e instanceof ApiError && e.status === 503 ? "info" : "error";
      setToast({ message, tone });
    } finally {
      setBusy(false);
    }
  };

  const endLive = async () => {
    if (disconnectingRef.current) return;
    disconnectingRef.current = true;
    try {
      if (connection) await connection.disconnect();
    } catch {
      /* ignore */
    }
    setConnection(null);
    setLocalVideoTrack(null);
    setSessionMeta(null);
    setToast({ message: "Broadcast ended.", tone: "info" });
    disconnectingRef.current = false;
  };

  const deletePost = async (id: string) => {
    try {
      await apiDelete(`/posts/${id}`);
      await loadPosts();
      setToast({ message: "Dispatch removed.", tone: "info" });
    } catch {
      setToast({ message: "Could not remove dispatch.", tone: "error" });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        {/* Left Side: Back button */}
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <Pressable onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(reader)/(tabs)");
            }
          }} style={{ padding: 8, marginLeft: -8 }}>
            <Icon name="chevron-back" color={colors.ink} size={24} />
          </Pressable>
        </View>

        {/* Middle: Logo */}
        <View style={{ alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Text style={styles.wordmark}>azadi</Text>
            <View style={styles.signalDot} />
          </View>
          <Text style={styles.kicker}>REPORTER STUDIO</Text>
        </View>

        {/* Right Side: Search and Notifications */}
        <View style={{ flex: 1, flexDirection: "row", gap: 16, alignItems: "center", justifyContent: "flex-end" }}>
          <Pressable onPress={() => router.push("/(reader)/search")}>
            <Icon name="search-outline" color={colors.ink} size={24} />
          </Pressable>
          <Pressable onPress={() => router.push("/(reader)/notifications")}>
            <View>
              <Icon name="notifications-outline" color={colors.ink} size={24} />
            </View>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadPosts();
                setRefreshing(false);
              }}
              tintColor={C.red}
            />
          }
        >
          <View style={styles.statusLine}>
            <View style={[styles.dot, { backgroundColor: user?.verified ? C.green : C.amber }]} />
            <Text style={styles.statusText}>
              {user?.verified ? "Verified reporter" : "Pending verification"} · {user?.name}
            </Text>
          </View>

          <View style={styles.segment}>
            {(["story", "live", "earnings", "analytics"] as const).map((m) => (
              <Pressable
                key={m}
                testID={`reporter-mode-${m}`}
                onPress={() => {
                  setMode(m);
                  if (m === "earnings") loadEarnings();
                  if (m === "analytics") loadAnalytics();
    loadAnalytics();
                }}
                style={[styles.segmentItem, mode === m && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                  {m === "story" ? "Write" : m === "live" ? "Go live" : m === "earnings" ? "Earnings" : "Analytics"}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === "story" ? (
            <>
              <Text style={styles.title}>{kind === "article" ? "Write an Article" : "What did you see?"}</Text>
              <TextInput
                testID="reporter-story-title"
                value={title}
                onChangeText={setTitle}
                placeholder={kind === "article" ? "Article Title" : "Headline your dispatch"}
                placeholderTextColor="#8A8F91"
                style={styles.inputTitle}
              />
              {/* Rich Text Editor */}
              <RichEditor
                ref={editorRef}
                placeholder={kind === "article" ? "Write your article here... Type text and insert images anywhere you want." : "Write from the field... Add images inline wherever you want."}
                initialContent={editorHtml}
                onChange={setEditorHtml}
                minHeight={300}
                colors={colors}
              />

              {/* Formatting Toolbar */}
              <View style={styles.formatToolbar}>
                <Pressable onPress={() => editorRef.current?.format("bold")} style={styles.formatBtn}>
                  <Text style={styles.formatBtnText}>B</Text>
                </Pressable>
                <Pressable onPress={() => editorRef.current?.format("italic")} style={styles.formatBtn}>
                  <Text style={[styles.formatBtnText, { fontStyle: "italic" }]}>I</Text>
                </Pressable>
                <Pressable onPress={() => editorRef.current?.format("heading")} style={styles.formatBtn}>
                  <Text style={styles.formatBtnText}>H</Text>
                </Pressable>
                <View style={styles.formatDivider} />
                <Pressable testID="reporter-attach-image" onPress={() => attachMedia("image")} style={styles.formatBtn}>
                  <Icon name="image-outline" color={C.red} size={20} />
                </Pressable>
                <Pressable testID="reporter-attach-video" onPress={() => attachMedia("video")} style={styles.formatBtn}>
                  <Icon name="videocam-outline" color={C.red} size={20} />
                </Pressable>
                <Pressable onPress={uploadDocument} style={styles.formatBtn}>
                  <Icon name="document-text-outline" color={C.red} size={20} />
                </Pressable>
              </View>

              {/* Video attachments (still block-based since videos need Mux upload) */}
              {blocks.filter(b => b.type === "video").map((block) => (
                <View key={block.id} style={[styles.attachTile, { marginTop: 8 }]}>
                  <View style={styles.attachThumb}>
                    <Icon name="film" color={colors.surface} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachTileName} numberOfLines={1}>{block.local_uri?.split("/").pop()}</Text>
                    <Text style={[styles.attachTileStatus, block.status === "error" && { color: C.red }, block.status === "ready" && { color: C.green }]}>
                      {block.status === "uploading" && "Uploading to Mux…"}
                      {block.status === "processing" && "Processing…"}
                      {block.status === "ready" && "Ready ✓"}
                      {block.status === "error" && "Failed"}
                    </Text>
                  </View>
                  <Pressable onPress={() => setBlocks(prev => prev.filter(b => b.id !== block.id))} style={styles.iconBtn}>
                    <Icon name="close" color={colors.muted} size={18} />
                  </Pressable>
                </View>
              ))}
              
              <Text style={styles.overline}>DISPATCH TYPE</Text>
              <View style={styles.kindRow}>
                {(["dispatch", "field report", "photo essay", "article"] as const).map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setKind(k)}
                    style={[styles.kindChip, kind === k && styles.kindChipActive]}
                  >
                    <Text style={[styles.kindChipText, kind === k && styles.kindChipTextActive]}>{k}</Text>
                  </Pressable>
                ))}
              </View>

              
              <Text style={[styles.overline, { marginTop: 24, marginBottom: 8 }]}>SCHEDULE</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
                {[0, 2, 12, 24].map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => setScheduleHours(h)}
                    style={[styles.kindChip, scheduleHours === h && styles.kindChipActive]}
                  >
                    <Text style={[styles.kindChipText, scheduleHours === h && styles.kindChipTextActive]}>
                      {h === 0 ? "Publish Now" : `In ${h} hours`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Button testID="reporter-publish-button"
 onPress={publish} loading={busy}>
                {editId ? "Update" : scheduleHours > 0 ? "Schedule " + kind : "Publish " + kind}
              </Button>

              <Text style={[styles.overline, { marginTop: 32, marginBottom: 12 }]}>MY DISPATCHES · {posts.length}</Text>
              {posts.length === 0 ? (
                <EmptyState title="No dispatches yet." body="Publish your first field report to see it here." icon="document-text-outline" />
              ) : (
                posts.map((p) => (
                  <View key={p.id} style={styles.postRow}>
                    <View style={{ flex: 1 }}>
                      
                      <Text style={styles.postRowKind}>
                        {p.kind.toUpperCase()}
                        {p.scheduled_at && new Date(p.scheduled_at) > new Date() ? ` · SCHEDULED` : ""}
                      </Text>

                      <Text style={styles.postRowTitle} numberOfLines={2}>{p.title}</Text>
                      {(() => {
                        let mediaArr = p.media;
                        if (typeof mediaArr === "string") {
                          try { mediaArr = JSON.parse(mediaArr); } catch { mediaArr = []; }
                        }
                        const isArray = Array.isArray(mediaArr) && mediaArr.length > 0;
                        if (!isArray) return null;
                        return (
                          <View style={{ marginTop: 10, gap: 8 }}>
                            {mediaArr.map((m: any, idx: number) => (
                              <MediaPlayer key={`${p.id}-m-${idx}`} media={m} radius={4} />
                            ))}
                          </View>
                        );
                      })()}
                    </View>
                    <View style={{ flexDirection: 'column', gap: 8 }}>
                      <Pressable testID={`reporter-edit-${p.id}`} onPress={() => router.push(`/(reporter)/studio?editId=${p.id}`)} style={styles.iconBtn}>
                        <Icon name="pencil-outline" color={colors.ink} size={17} />
                      </Pressable>
                      <Pressable testID={`reporter-delete-${p.id}`} onPress={() => deletePost(p.id)} style={styles.iconBtn}>
                        <Icon name="trash-outline" color={C.red} size={17} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </>
          ) : mode === "live" ? (
            <>
              <Text style={styles.title}>Go live, stay connected.</Text>

              {connection ? (
                <>
                  <LiveStage track={localVideoTrack} label={`LIVE · ${sessionMeta?.room?.slice(-6).toUpperCase() || ""}`} />
                  <Text style={styles.helperText}>
                    Your camera and mic are streaming to LiveKit. Share the room code with readers or check the Live tab.
                  </Text>
                  <Button testID="reporter-end-live-button" onPress={endLive} tone="outline">
                    End broadcast
                  </Button>
                </>
              ) : (
                <>
                  <View style={styles.cameraPlaceholder}>
                    <Icon name="radio-outline" color={colors.surface} size={38} />
                    <Text style={styles.previewText}>Ready to broadcast</Text>
                    <Text style={styles.previewSub}>
                      Tap Start to request camera + mic and open a LiveKit room. Readers see it instantly under Live now.
                    </Text>
                  </View>

                  <TextInput
                    testID="reporter-live-title"
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Stream title (e.g. Live from the factory gate)"
                    placeholderTextColor="#8A8F91"
                    style={styles.inputTitle}
                  />

                  <Button testID="reporter-go-live-button" onPress={goLive} tone="red" loading={busy}>
                    Start live stream
                  </Button>

                  <View style={styles.notice}>
                    <Icon name="shield-checkmark-outline" color={C.blue} size={17} />
                    <Text style={styles.noticeText}>
                      Broadcasting uses WebRTcolors. In the web preview it publishes from your browser. On a phone you'll need a dev build (Publish → Generate build) for native WebRTcolors.
                    </Text>
                  </View>
                </>
              )}
            </>
          ) : (
            <>
              <Text style={styles.title}>Your support wall.</Text>
              <View style={styles.earningsGrid}>
                <EarningTile label="LIFETIME ₹" value={earnings?.lifetime ?? "—"} tone={C.green} />
                <EarningTile label="SUPPORTERS" value={earnings?.verified_count ?? "—"} />
                <EarningTile label="MONTHLY PLEDGES" value={earnings?.monthly_pledges ?? "—"} tone={C.red} />
                <EarningTile label="PENDING ₹" value={earnings?.pending_amount ?? "—"} />
              </View>

              <Text style={[styles.overline, { marginTop: 22, marginBottom: 10 }]}>TOP SUPPORTERS</Text>
              {earnings?.top_supporters?.length ? (
                earnings.top_supporters.map((s, idx) => (
                  <View key={s.supporter_id} style={styles.supporterRow}>
                    <View style={styles.supporterRank}>
                      <Text style={styles.supporterRankText}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.supporterName}>{s.name}</Text>
                      <Text style={styles.postRowMeta}>{s.count} payment{s.count > 1 ? "s" : ""}</Text>
                    </View>
                    <Text style={styles.supporterTotal}>₹{s.total}</Text>
                  </View>
                ))
              ) : (
                <EmptyState
                  title="No supporters yet."
                  body="Once readers back you, you'll see them ranked here — and every ₹7 rolls up to your lifetime total."
                  icon="heart-outline"
                />
              )}

              <View style={styles.notice}>
                <Icon name="information-circle-outline" color={C.blue} size={17} />
                <Text style={styles.noticeText}>
                  Payouts run automatically through Razorpay once you add your bank details. Verified support totals update the moment a payment clears.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </SafeAreaView>
  );
}

function EarningTile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.earningTile}>
      <Text style={[styles.earningValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={styles.earningLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: { color: colors.ink, fontSize: 22, fontWeight: "800", letterSpacing: -1 },
  signalDot: { width: 6, height: 6, borderRadius: 8, backgroundColor: C.red, marginLeft: 4, marginTop: 6 },
  kicker: { fontSize: 9, letterSpacing: 2, color: colors.muted, marginTop: 4, fontWeight: "800" },
  avatar: { backgroundColor: colors.ink, borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 60 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 8 },
  statusText: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: "700" },
  segment: { flexDirection: "row", backgroundColor: colors.line, padding: 3, borderRadius: 8, marginBottom: 24 },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 8 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.muted, fontWeight: "800", fontSize: 13 },
  segmentTextActive: { color: colors.ink },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800", letterSpacing: -1, marginBottom: 16 },
  inputTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 8,
  },

  blockContainer: {
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  blockActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    gap: 8,
  },
  inputBody: {
    color: colors.ink,
    fontSize: 15,
    minHeight: 160,
    textAlignVertical: "top",
    lineHeight: 22,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
  },
  formatToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  formatBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  formatBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  formatDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.line,
    marginHorizontal: 4,
  },
  overline: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "800", marginBottom: 8 },
  kindRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  kindChip: {
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    height: 34,
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: colors.surface,
  },
  kindChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  kindChipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  kindChipTextActive: { color: colors.surface },
  attachRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  attachText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  attachTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginBottom: 8,
    borderRadius: 8,
  },
  attachThumb: {
    width: 42,
    height: 42,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  attachTileName: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  attachTileStatus: { color: colors.muted, fontSize: 11, marginTop: 3 },
  notice: {
    flexDirection: "row",
    gap: 9,
    backgroundColor: "#E7EEF2",
    padding: 12,
    marginVertical: 14,
    borderRadius: 8,
    alignItems: "flex-start",
  },
  noticeText: { color: C.blue, flex: 1, fontSize: 12, lineHeight: 18 },
  postRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
  },
  postRowKind: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 4 },
  postRowTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  postRowMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  iconBtn: { padding: 8 },
  cameraPlaceholder: {
    height: 220,
    backgroundColor: colors.dark,
    marginBottom: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 20,
  },
  previewText: { color: colors.surface, fontWeight: "800", fontSize: 17 },
  previewSub: { color: "#B7BEC5", fontSize: 12, textAlign: "center", lineHeight: 18 },
  helperText: { color: colors.muted, fontSize: 12, marginTop: 12, marginBottom: 8, lineHeight: 18 },
  earningsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  earningTile: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    borderRadius: 8,
  },
  earningValue: { color: colors.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  earningLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1, marginTop: 6, fontWeight: "800" },
  supporterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  supporterRank: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  supporterRankText: { color: colors.ink, fontWeight: "800", fontSize: 13 },
  supporterName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  supporterTotal: { color: C.green, fontSize: 15, fontWeight: "800" },
});
