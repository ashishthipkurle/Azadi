import type { RemoteVideoTrack, TrackPublication, Participant } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiGet, apiPost, ApiError } from "@/src/api";
import { LiveStage } from "@/src/live-stage";
import {
  subscribeLive,
  decodeLivePayload,
  encodeLivePayload,
  getActivePublisher,
  getActiveLocalTrack,
  toggleCameraFacing,
  type LiveConnection,
} from "@/src/livekit";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

export type LiveSession = {
  id?: string;
  room: string;
  reporter_id: string;
  reporter_name: string;
  title: string;
};

export type PollOption = {
  label: "A" | "B" | "C" | "D";
  text: string;
  votes: number;
};

export type LivePoll = {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  active: boolean;
};

type ChatItem = {
  id: string;
  sender: string;
  text: string;
  avatarColor: string;
  badge?: string;
  timestamp: number;
};

type FloatingReaction = {
  id: string;
  anim: Animated.Value;
  xOffset: number;
  emoji?: string;
  color: string;
  size: number;
};

const AVATAR_COLORS = ["#FF5722", "#4CAF50", "#2196F3", "#9C27B0", "#E91E63", "#00BCD4", "#FF9800"];
const HEART_COLORS = ["#FF2D55", "#FF3B30", "#FF6482", "#FF9500", "#FF2D55"];

export function LiveReelItem({
  session,
  height,
  isActive,
  onEndStream,
}: {
  session: LiveSession;
  height: number;
  isActive: boolean;
  onEndStream?: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const activePub = getActivePublisher();
  const isBroadcastingThisRoom = Boolean(activePub && activePub.room.name === session.room);
  const isOwner = Boolean(
    isBroadcastingThisRoom ||
      (user &&
        (user.id === session.reporter_id ||
          user.name === session.reporter_name ||
          user.email === session.reporter_id ||
          user.role === "admin"))
  );

  const [track, setTrack] = useState<RemoteVideoTrack | null>(null);
  const [status, setStatus] = useState<"connecting" | "waiting" | "live" | "ended" | "error">("connecting");
  const [viewers, setViewers] = useState<number>(0);
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [ending, setEnding] = useState(false);

  // Reporter profile & expandable description
  const [reporterAvatar, setReporterAvatar] = useState<string | null>(() => {
    if (user && user.id === session.reporter_id && (user as any).avatar_url) {
      return (user as any).avatar_url;
    }
    return null;
  });
  const [descExpanded, setDescExpanded] = useState(false);
  const [showCommentBar, setShowCommentBar] = useState(false);
  const commentInputRef = useRef<TextInput>(null);

  useEffect(() => {
    let cancelled = false;
    if (session.reporter_id) {
      apiGet<{ name?: string; avatar_url?: string }>(`/users/${session.reporter_id}/basic`)
        .then((data) => {
          if (!cancelled && data?.avatar_url) {
            setReporterAvatar(data.avatar_url);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [session.reporter_id]);

  // Streamer tools & Live Poll state
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">("user");
  const [micMuted, setMicMuted] = useState(false);
  const [activePoll, setActivePoll] = useState<LivePoll | null>(null);
  const [userVotedIndex, setUserVotedIndex] = useState<number | null>(null);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionA, setPollOptionA] = useState("");
  const [pollOptionB, setPollOptionB] = useState("");
  const [pollOptionC, setPollOptionC] = useState("");
  const [pollOptionD, setPollOptionD] = useState("");

  const disconnectRef = useRef<null | (() => Promise<void>)>(null);
  const chatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!isActive) {
      if (disconnectRef.current) {
        disconnectRef.current().catch(() => {});
        disconnectRef.current = null;
      }
      setConnection(null);
      setTrack(null);
      setStatus("connecting");
      return;
    }

    // If current user is already publishing to this room, reuse that live connection
    const currentActivePub = getActivePublisher();
    if (currentActivePub && currentActivePub.room.name === session.room) {
      setConnection(currentActivePub);
      setStatus("live");
      const localTrack = getActiveLocalTrack();
      if (localTrack) {
        setTrack(localTrack);
      } else {
        try {
          const pubs = currentActivePub.room.localParticipant.videoTrackPublications;
          if (pubs && pubs.size > 0) {
            const first = pubs.values().next().value;
            if (first?.track) setTrack(first.track as any);
          }
        } catch {}
      }

      // Broadcaster's viewers = remote participants (excludes the reporter themselves)
      setViewers(currentActivePub.room?.remoteParticipants?.size || 0);

      const onPart = () => {
        if (currentActivePub.room) {
          setViewers(currentActivePub.room.remoteParticipants?.size || 0);
        }
      };
      const onData = (payload: Uint8Array, participant?: Participant) => {
        try {
          const text = decodeLivePayload(payload);
          if (!text) return;
          const data = JSON.parse(text);
          if (data.type === "chat") {
            const senderName = participant?.name || participant?.identity || "Viewer";
            const newMsg: ChatItem = {
              id: Math.random().toString(36).substring(7),
              sender: senderName,
              text: data.text,
              avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev.slice(-25), newMsg]);
          } else if (data.type === "stream_ended") {
            setStatus("ended");
          } else if (data.type === "like") {
            spawnFloatingReaction("❤️");
            setLikeCount((c) => c + 1);
          } else if (data.type === "reaction") {
            spawnFloatingReaction(data.emoji || "❤️");
          } else if (data.type === "poll_start") {
            setActivePoll(data.poll);
            setUserVotedIndex(null);
          } else if (data.type === "poll_vote") {
            setActivePoll((prev) => {
              if (!prev || prev.id !== data.pollId) return prev;
              const newOptions = prev.options.map((opt, idx) =>
                idx === data.optionIndex ? { ...opt, votes: opt.votes + 1 } : opt
              );
              return {
                ...prev,
                options: newOptions,
                totalVotes: prev.totalVotes + 1,
              };
            });
          } else if (data.type === "poll_end") {
            setActivePoll((prev) => (prev ? { ...prev, active: false } : null));
          }
        } catch {}
      };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const lk = require("livekit-client");
      currentActivePub.room
        .on(lk.RoomEvent.ParticipantConnected, onPart)
        .on(lk.RoomEvent.ParticipantDisconnected, onPart)
        .on(lk.RoomEvent.DataReceived, onData);

      return () => {
        try {
          currentActivePub.room
            .off(lk.RoomEvent.ParticipantConnected, onPart)
            .off(lk.RoomEvent.ParticipantDisconnected, onPart)
            .off(lk.RoomEvent.DataReceived, onData);
        } catch {}
      };
    }

    let cancelled = false;
    const start = async () => {
      try {
        setStatus("connecting");
        const tokenResp = await apiPost<{ token: string; url: string }>("/live/viewer-token", {
          room: session.room,
        });
        if (cancelled) return;

        const conn = await subscribeLive({ url: tokenResp.url, token: tokenResp.token });
        if (cancelled) {
          await conn.disconnect();
          return;
        }

        setConnection(conn);
        setStatus("waiting");
        if (conn.room.numParticipants > 0) {
          setViewers(Math.max(0, conn.room.numParticipants - 1));
        }

        const onTrackSubscribed = (t: any) => {
          if (t.kind === "video") {
            setTrack(t);
            setStatus("live");
          }
        };

        const onTrackUnsubscribed = (t: any) => {
          if (t.kind === "video") {
            setTrack(null);
            setStatus("waiting");
          }
        };

        const onParticipant = () => {
          if (conn.room?.numParticipants) {
            setViewers(Math.max(0, conn.room.numParticipants - 1));
          }
        };

        const onParticipantDisconnected = (p?: Participant) => {
          if (conn.room?.numParticipants) {
            setViewers(Math.max(0, conn.room.numParticipants - 1));
          }
          // If the broadcaster disconnected or no remote broadcaster remains
          if (
            p?.identity === session.reporter_id ||
            p?.name === session.reporter_name ||
            !conn.room?.remoteParticipants ||
            conn.room.remoteParticipants.size === 0
          ) {
            setStatus("ended");
          }
        };

        const onDisconnected = () => setStatus("ended");

        const onDataReceived = (payload: Uint8Array, participant?: Participant) => {
          try {
            const text = decodeLivePayload(payload);
            if (!text) return;
            const data = JSON.parse(text);
            if (data.type === "chat") {
              const senderName = participant?.name || participant?.identity || "Viewer";
              const newMsg: ChatItem = {
                id: Math.random().toString(36).substring(7),
                sender: senderName,
                text: data.text,
                avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
                timestamp: Date.now(),
              };
              setMessages((prev) => [...prev.slice(-25), newMsg]);
            } else if (data.type === "stream_ended") {
              setStatus("ended");
            } else if (data.type === "like") {
              spawnFloatingReaction("❤️");
              setLikeCount((c) => c + 1);
            } else if (data.type === "reaction") {
              spawnFloatingReaction(data.emoji || "❤️");
            } else if (data.type === "poll_start") {
              setActivePoll(data.poll);
              setUserVotedIndex(null);
            } else if (data.type === "poll_vote") {
              setActivePoll((prev) => {
                if (!prev || prev.id !== data.pollId) return prev;
                const newOptions = prev.options.map((opt, idx) =>
                  idx === data.optionIndex ? { ...opt, votes: opt.votes + 1 } : opt
                );
                return {
                  ...prev,
                  options: newOptions,
                  totalVotes: prev.totalVotes + 1,
                };
              });
            } else if (data.type === "poll_end") {
              setActivePoll((prev) => (prev ? { ...prev, active: false } : null));
            }
          } catch (e) {
            console.error("Live event parse error", e);
          }
        };

        // Attach existing track
        try {
          conn.room.remoteParticipants.forEach((rp) => {
            rp.videoTrackPublications.forEach((pub) => {
              if (pub.track) {
                setTrack(pub.track as RemoteVideoTrack);
                setStatus("live");
              }
            });
          });
        } catch {}

        // If broadcaster is not present when joining, verify backend state
        if (!conn.room.remoteParticipants || conn.room.remoteParticipants.size === 0) {
          setTimeout(async () => {
            if (cancelled) return;
            if (!conn.room?.remoteParticipants || conn.room.remoteParticipants.size === 0) {
              try {
                const sessions = await apiGet<LiveSession[]>("/live/sessions");
                const stillLive = sessions.some((s) => s.room === session.room);
                if (!stillLive) {
                  setStatus("ended");
                }
              } catch {
                setStatus("ended");
              }
            }
          }, 3500);
        }

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const lk = require("livekit-client");
        conn.room
          .on(lk.RoomEvent.TrackSubscribed, onTrackSubscribed)
          .on(lk.RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
          .on(lk.RoomEvent.ParticipantConnected, onParticipant)
          .on(lk.RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
          .on(lk.RoomEvent.Disconnected, onDisconnected)
          .on(lk.RoomEvent.DataReceived, onDataReceived);

        disconnectRef.current = conn.disconnect;
      } catch (e: any) {
        if (cancelled) return;
        if (e?.status === 410 || (typeof e?.message === "string" && e.message.toLowerCase().includes("ended"))) {
          setStatus("ended");
        } else {
          setStatus("error");
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      if (disconnectRef.current) {
        disconnectRef.current().catch(() => {});
        disconnectRef.current = null;
      }
    };
  }, [isActive, session.room]);

  const handleEndStream = async () => {
    setEnding(true);
    try {
      // 1. Broadcast stream_ended to all connected viewers in real time
      const activeRoom = connection?.room || getActivePublisher()?.room;
      if (activeRoom) {
        try {
          const payload = encodeLivePayload(JSON.stringify({ type: "stream_ended" }));
          await activeRoom.localParticipant.publishData(payload as any, { reliable: true });
        } catch {}
      }

      // 2. Mark stream ended in database for both target ID and room
      const targetId = session.id || session.room;
      await Promise.allSettled([
        apiPost(`/live/${targetId}/end`, {}),
        apiPost(`/live/${session.room}/end`, {}),
      ]);

      // 3. Disconnect broadcaster and tear down tracks
      const activePub = getActivePublisher();
      if (activePub && activePub.room.name === session.room) {
        await activePub.disconnect();
      }
      if (disconnectRef.current) await disconnectRef.current();
      setStatus("ended");
      onEndStream?.();
    } catch {
      onEndStream?.();
    } finally {
      setEnding(false);
    }
  };

  const spawnFloatingReaction = (emoji?: string) => {
    const anim = new Animated.Value(0);
    const id = Math.random().toString(36).substring(7);
    const reaction: FloatingReaction = {
      id,
      anim,
      xOffset: (Math.random() - 0.5) * 50,
      emoji,
      color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
      size: emoji ? 28 : 24 + Math.random() * 12,
    };

    setFloatingReactions((prev) => [...prev, reaction]);

    Animated.timing(anim, {
      toValue: 1,
      duration: 1800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setFloatingReactions((prev) => prev.filter((h) => h.id !== id));
    });
  };

  const handleSendReaction = async (emoji: string) => {
    spawnFloatingReaction(emoji);

    const activeRoom = connection?.room || getActivePublisher()?.room;
    if (activeRoom) {
      try {
        const payload = encodeLivePayload(JSON.stringify({ type: "reaction", emoji }));
        await activeRoom.localParticipant.publishData(payload as any, { reliable: false });
      } catch {}
    }
  };

  const handleLike = () => {
    if (liked) return;
    setLiked(true);
    setLikeCount((c) => c + 1);
    spawnFloatingReaction("❤️");

    const activeRoom = connection?.room || getActivePublisher()?.room;
    if (activeRoom) {
      try {
        const payload = encodeLivePayload(JSON.stringify({ type: "like" }));
        activeRoom.localParticipant.publishData(payload as any, { reliable: true });
      } catch {}
    }
  };

  const handleSwitchCamera = async () => {
    try {
      const nextFacing = cameraFacing === "user" ? "environment" : "user";
      const room = connection?.room || getActivePublisher()?.room;
      if (room) {
        let pubTrack = track;
        if (!pubTrack && room.localParticipant?.videoTrackPublications) {
          const pubs = Array.from(room.localParticipant.videoTrackPublications.values()) as any[];
          pubTrack = pubs[0]?.track || null;
        }
        const resolvedFacing = await toggleCameraFacing(room, pubTrack, nextFacing);
        setCameraFacing(resolvedFacing);
        // Refresh local track reference if swapped
        const pubs = room.localParticipant?.videoTrackPublications;
        if (pubs && pubs.size > 0) {
          const first = pubs.values().next().value;
          if (first?.track) setTrack(first.track as any);
        }
      }
    } catch (e) {
      console.warn("Failed to switch camera:", e);
    }
  };

  const handleToggleMic = async () => {
    try {
      const room = connection?.room || getActivePublisher()?.room;
      if (room?.localParticipant) {
        const nextMuted = !micMuted;
        await room.localParticipant.setMicrophoneEnabled(!nextMuted);
        setMicMuted(nextMuted);
      }
    } catch (e) {
      console.warn("Failed to toggle mic:", e);
    }
  };

  const handleStartPoll = async () => {
    if (!pollQuestion.trim() || !pollOptionA.trim() || !pollOptionB.trim()) return;

    const rawOptions: PollOption[] = [
      { label: "A", text: pollOptionA.trim(), votes: 0 },
      { label: "B", text: pollOptionB.trim(), votes: 0 },
    ];
    if (pollOptionC.trim()) {
      rawOptions.push({ label: "C", text: pollOptionC.trim(), votes: 0 });
    }
    if (pollOptionD.trim()) {
      rawOptions.push({ label: "D", text: pollOptionD.trim(), votes: 0 });
    }

    const newPoll: LivePoll = {
      id: Math.random().toString(36).substring(7),
      question: pollQuestion.trim(),
      options: rawOptions,
      totalVotes: 0,
      active: true,
    };

    setActivePoll(newPoll);
    setUserVotedIndex(null);
    setShowPollCreator(false);
    setPollQuestion("");
    setPollOptionA("");
    setPollOptionB("");
    setPollOptionC("");
    setPollOptionD("");

    const activeRoom = connection?.room || getActivePublisher()?.room;
    if (activeRoom) {
      try {
        const payload = encodeLivePayload(JSON.stringify({ type: "poll_start", poll: newPoll }));
        await activeRoom.localParticipant.publishData(payload as any, { reliable: true });
      } catch {}
    }
  };

  const handleEndPoll = async () => {
    if (!activePoll) return;
    const pollId = activePoll.id;
    setActivePoll((prev) => (prev ? { ...prev, active: false } : null));

    const activeRoom = connection?.room || getActivePublisher()?.room;
    if (activeRoom) {
      try {
        const payload = encodeLivePayload(JSON.stringify({ type: "poll_end", pollId }));
        await activeRoom.localParticipant.publishData(payload as any, { reliable: true });
      } catch {}
    }
  };

  const handleVoteOption = async (optionIndex: number) => {
    if (!activePoll || !activePoll.active || userVotedIndex !== null) return;
    setUserVotedIndex(optionIndex);

    setActivePoll((prev) => {
      if (!prev) return prev;
      const newOptions = prev.options.map((opt, idx) =>
        idx === optionIndex ? { ...opt, votes: opt.votes + 1 } : opt
      );
      return { ...prev, options: newOptions, totalVotes: prev.totalVotes + 1 };
    });

    const activeRoom = connection?.room || getActivePublisher()?.room;
    if (activeRoom) {
      try {
        const payload = encodeLivePayload(
          JSON.stringify({ type: "poll_vote", pollId: activePoll.id, optionIndex })
        );
        await activeRoom.localParticipant.publishData(payload as any, { reliable: true });
      } catch {}
    }
  };

  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    setCommentText("");

    const newMsg: ChatItem = {
      id: Math.random().toString(36).substring(7),
      sender: user?.name || "Me",
      text,
      avatarColor: colors.red,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMsg]);

    if (connection?.room) {
      try {
        const payload = encodeLivePayload(JSON.stringify({ type: "chat", text }));
        await connection.room.localParticipant.publishData(payload as any, { reliable: true });
      } catch (e) {
        console.error("Failed to broadcast chat", e);
      }
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Watch ${session.reporter_name}'s live broadcast "${session.title}" on Azadi!`,
        title: session.title,
      });
    } catch {}
  };

  const formatViewers = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <View style={[styles.container, { height, width: "100%" }]}>
      {/* 1. Main Live Stage Video */}
      <View style={StyleSheet.absoluteFillObject}>
        {status === "connecting" ? (
          <View style={styles.centerStatus}>
            <ActivityIndicator color={colors.red} size="large" />
            <Text style={styles.centerStatusText}>Connecting to field broadcast…</Text>
          </View>
        ) : status === "waiting" ? (
          <View style={styles.centerStatus}>
            <View style={styles.pulseRadio}>
              <Icon name="radio" color={colors.red} size={36} />
            </View>
            <Text style={styles.centerStatusTitle}>{session.title}</Text>
            <Text style={styles.centerStatusText}>
              Waiting for {session.reporter_name} to broadcast video.
            </Text>
            {isOwner && (
              <Pressable
                onPress={handleEndStream}
                disabled={ending}
                style={[styles.endStreamBtn, { marginTop: 14 }]}
              >
                <Text style={styles.endStreamBtnText}>
                  {ending ? "Ending broadcast..." : "End & remove broadcast"}
                </Text>
              </Pressable>
            )}
          </View>
        ) : status === "ended" || status === "error" ? (
          <View style={styles.centerStatus}>
            <Icon name="close-circle-outline" color={colors.red} size={48} />
            <Text style={styles.centerStatusTitle}>
              {status === "ended" ? "Broadcast has ended" : "Unable to reach stream"}
            </Text>
            {isOwner && (
              <Pressable
                onPress={handleEndStream}
                disabled={ending}
                style={[styles.endStreamBtn, { marginTop: 14 }]}
              >
                <Text style={styles.endStreamBtnText}>
                  {ending ? "Ending..." : "End & remove from feed"}
                </Text>
              </Pressable>
            )}
          </View>
        ) : (
          <LiveStage track={track} fill showBadge={false} />
        )}
      </View>

      {/* 2. Top Stream Overlay (Live badge + Viewer count) */}
      <View style={[styles.streamTopOverlay, { top: insets.top + 72 }]} pointerEvents="box-none">
        <View style={styles.badgesGroup}>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
          <View style={styles.viewerBadge}>
            <Icon name="eye-outline" color="#FFFFFF" size={13} />
            <Text style={styles.viewerBadgeText}>{formatViewers(viewers)}</Text>
          </View>
        </View>
      </View>

      {/* 2b. Interactive Live Poll Overlay (ABCD options) */}
      {activePoll && activePoll.active && (
        <View style={[styles.pollOverlay, { top: insets.top + 120 }]} pointerEvents="box-none">
          <View style={styles.pollCard}>
            <View style={styles.pollHeader}>
              <View style={styles.pollBadge}>
                <Icon name="stats-chart" color="#4CAF50" size={13} />
                <Text style={styles.pollBadgeText}>LIVE POLL</Text>
              </View>
              <Text style={styles.pollVotesCount}>
                {activePoll.totalVotes} {activePoll.totalVotes === 1 ? "vote" : "votes"}
              </Text>
              {isOwner && (
                <Pressable onPress={handleEndPoll} style={styles.pollEndBtn}>
                  <Text style={styles.pollEndBtnText}>End Poll</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.pollQuestion}>{activePoll.question}</Text>

            <View style={styles.pollOptionsWrap}>
              {activePoll.options.map((opt, idx) => {
                const percent =
                  activePoll.totalVotes > 0
                    ? Math.round((opt.votes / activePoll.totalVotes) * 100)
                    : 0;
                const isSelected = userVotedIndex === idx;
                const hasVoted = userVotedIndex !== null || isOwner;

                return (
                  <Pressable
                    key={opt.label}
                    disabled={hasVoted}
                    onPress={() => handleVoteOption(idx)}
                    style={[styles.pollOptionBtn, isSelected && styles.pollOptionBtnSelected]}
                  >
                    {/* Background animated progress bar */}
                    {hasVoted && (
                      <View
                        style={[
                          styles.pollOptionProgress,
                          {
                            width: `${percent}%`,
                            backgroundColor: isSelected
                              ? "rgba(76, 175, 80, 0.45)"
                              : "rgba(255, 255, 255, 0.15)",
                          },
                        ]}
                      />
                    )}

                    <View style={styles.pollOptionContent}>
                      <View style={[styles.pollLetterBox, isSelected && styles.pollLetterBoxSelected]}>
                        <Text style={styles.pollLetterText}>{opt.label}</Text>
                      </View>
                      <Text
                        style={[styles.pollOptionText, isSelected && styles.pollOptionTextSelected]}
                        numberOfLines={1}
                      >
                        {opt.text}
                      </Text>
                      {hasVoted && (
                        <Text style={styles.pollPercentText}>{percent}%</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* 3. Reporter details & Expandable Description (Bottom left) */}
      <View
        style={[
          styles.streamDetailsOverlay,
          isOwner
            ? styles.streamDetailsOwner
            : [
                styles.streamDetailsViewer,
                { bottom: showCommentBar ? 68 : 20, maxWidth: showCommentBar ? "74%" : "60%" },
              ],
        ]}
        pointerEvents="box-none"
      >
        {/* Reporter profile avatar + name */}
        <View style={styles.reporterProfileRow}>
          {reporterAvatar ? (
            <Image source={{ uri: reporterAvatar }} style={styles.reporterAvatar} />
          ) : (
            <View style={[styles.reporterAvatarFallback, { backgroundColor: colors.red }]}>
              <Text style={styles.reporterAvatarLetter}>
                {(session.reporter_name || "R").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.reporterNameWrap}>
            <View style={styles.reporterNameBadgeRow}>
              <Text style={styles.reporterNameText} numberOfLines={1}>
                @{session.reporter_name}
              </Text>
              <Icon name="checkmark-circle" color="#2196F3" size={14} />
            </View>
            <Text style={styles.reporterLiveTag}>REPORTER</Text>
          </View>
        </View>

        {/* Expandable description section below the name */}
        {session.title ? (
          <Pressable
            onPress={() => setDescExpanded((prev) => !prev)}
            style={styles.descriptionContainer}
            hitSlop={6}
          >
            <Text
              style={styles.descriptionText}
              numberOfLines={descExpanded ? undefined : 2}
            >
              {session.title}
            </Text>
            <Text style={styles.descriptionToggleText}>
              {descExpanded ? "Show less" : "…more"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* 4. Floating Live Chat Overlay */}
      <View
        style={[
          styles.chatOverlay,
          isOwner
            ? styles.chatOverlayBroadcaster
            : [styles.chatOverlayViewer, { bottom: showCommentBar ? 154 : 110 }],
        ]}
        pointerEvents="box-none"
      >
        {messages.length > 0 ? (
          <FlatList
            ref={chatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <View style={styles.chatBubble}>
                <View style={[styles.chatAvatar, { backgroundColor: item.avatarColor }]}>
                  <Text style={styles.chatAvatarLetter}>{item.sender.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.chatTextWrap}>
                  <Text style={styles.chatSender}>@{item.sender}</Text>
                  <Text style={styles.chatMessage}>{item.text}</Text>
                </View>
              </View>
            )}
          />
        ) : isOwner ? (
          <View style={styles.chatBroadcasterPlaceholder}>
            <Icon name="chatbubbles-outline" color="rgba(255,255,255,0.7)" size={16} />
            <Text style={styles.chatBroadcasterPlaceholderText}>
              Live chat active · Viewer comments and reactions appear here in real time
            </Text>
          </View>
        ) : null}
      </View>

      {/* 5. Right Action Rail (Bookmark, Comment, Heart, Share) - ONLY for viewers */}
      {!isOwner && (
        <View
          style={[styles.actionRail, { bottom: 72 }]}
          pointerEvents="box-none"
        >
          <Pressable onPress={() => setBookmarked((b) => !b)} style={styles.railBtn}>
            <View style={styles.actionIconCircle}>
              <Icon name={bookmarked ? "bookmark" : "bookmark-outline"} color="#FFFFFF" size={24} />
            </View>
          </Pressable>

          {/* Comment button -> Toggles bottom comment input bar */}
          <Pressable
            onPress={() => {
              setShowCommentBar((prev) => !prev);
              setTimeout(() => {
                chatListRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }}
            style={styles.railBtn}
          >
            <View style={[styles.actionIconCircle, showCommentBar && styles.actionIconCircleActive]}>
              <Icon
                name={showCommentBar ? "chatbubble" : "chatbubble-outline"}
                color={showCommentBar ? colors.red : "#FFFFFF"}
                size={24}
              />
            </View>
            <Text style={styles.railCountText}>{messages.length}</Text>
          </Pressable>

          {/* Single-use Like Heart */}
          <Pressable onPress={handleLike} style={styles.railBtn}>
            <View style={[styles.actionIconCircle, liked && styles.actionIconCircleLiked]}>
              <Icon
                name={liked ? "heart" : "heart-outline"}
                color={liked ? "#FF2D55" : "#FFFFFF"}
                size={26}
              />
            </View>
            <Text style={[styles.railCountText, liked && { color: "#FF2D55" }]}>
              {likeCount >= 1000 ? `${(likeCount / 1000).toFixed(1)}k` : likeCount}
            </Text>
          </Pressable>

          {/* Share */}
          <Pressable onPress={handleShare} style={styles.railBtn}>
            <View style={styles.actionIconCircle}>
              <Icon name="arrow-redo-outline" color="#FFFFFF" size={26} />
            </View>
            <Text style={styles.railCountText}>Share</Text>
          </Pressable>
        </View>
      )}

      {/* 5b. Right Action Rail - Broadcaster controls (Vertically on the right edge) */}
      {isOwner && (
        <View style={[styles.actionRail, { bottom: 72 }]} pointerEvents="box-none">
          {/* Flip Camera */}
          <Pressable onPress={handleSwitchCamera} style={styles.railBtn} hitSlop={8}>
            <View style={styles.actionIconCircle}>
              <Icon name="camera-reverse-outline" color="#FFFFFF" size={24} />
            </View>
            <Text style={styles.railCountText}>Flip</Text>
          </Pressable>

          {/* Mute/Unmute Mic */}
          <Pressable onPress={handleToggleMic} style={styles.railBtn} hitSlop={8}>
            <View style={[styles.actionIconCircle, micMuted && styles.actionIconCircleActive]}>
              <Icon
                name={micMuted ? "mic-off-outline" : "mic-outline"}
                color={micMuted ? "#FF3B30" : "#FFFFFF"}
                size={24}
              />
            </View>
            <Text style={[styles.railCountText, micMuted && { color: "#FF3B30" }]}>
              {micMuted ? "Muted" : "Mic"}
            </Text>
          </Pressable>

          {/* Live Poll button */}
          <Pressable
            onPress={() => setShowPollCreator(true)}
            style={styles.railBtn}
            hitSlop={8}
          >
            <View style={[styles.actionIconCircle, activePoll?.active && styles.actionIconCirclePoll]}>
              <Icon
                name="stats-chart"
                color={activePoll?.active ? "#4CAF50" : "#FFFFFF"}
                size={22}
              />
            </View>
            <Text style={[styles.railCountText, activePoll?.active && { color: "#4CAF50" }]}>
              Poll
            </Text>
          </Pressable>

          {/* End Stream */}
          <Pressable
            onPress={handleEndStream}
            disabled={ending}
            style={styles.railBtn}
            hitSlop={8}
          >
            <View style={[styles.actionIconCircle, styles.actionIconCircleEnd]}>
              <Icon name="power" color="#FFFFFF" size={22} />
            </View>
            <Text style={[styles.railCountText, { color: "#FF3B30" }]}>
              {ending ? "Ending" : "End"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* 6. Floating Reactions (Hearts & Emojis) */}
      <View style={styles.floatingHeartsCanvas} pointerEvents="none">
        {floatingReactions.map((reaction) => {
          const translateY = reaction.anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -280],
          });
          const opacity = reaction.anim.interpolate({
            inputRange: [0, 0.15, 0.8, 1],
            outputRange: [0, 1, 0.9, 0],
          });
          const scale = reaction.anim.interpolate({
            inputRange: [0, 0.25, 1],
            outputRange: [0.6, 1.25, 1],
          });

          return (
            <Animated.View
              key={reaction.id}
              style={[
                styles.floatingHeartItem,
                {
                  transform: [{ translateY }, { translateX: reaction.xOffset }, { scale }],
                  opacity,
                },
              ]}
            >
              {reaction.emoji ? (
                <Text style={{ fontSize: reaction.size }}>{reaction.emoji}</Text>
              ) : (
                <Icon name="heart" color={reaction.color} size={reaction.size} />
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* 7. Bottom Bar: Emojis horizontally, plus Comment Input Bar when toggled */}
      {!isOwner && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.bottomBarWrap}
          pointerEvents="box-none"
        >
          <View
            style={[styles.bottomBar, !showCommentBar && { justifyContent: "flex-end" }]}
            pointerEvents="box-none"
          >
            {showCommentBar && (
              <View style={styles.commentInputWrap}>
                <TextInput
                  ref={commentInputRef}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Add a comment…"
                  placeholderTextColor="#A0A0A0"
                  style={styles.commentInput}
                  onSubmitEditing={handleSendComment}
                  returnKeyType="send"
                  autoFocus
                />
                {commentText.trim().length > 0 && (
                  <Pressable onPress={handleSendComment} style={styles.sendBtn} hitSlop={8}>
                    <Icon name="arrow-up-circle" color={colors.red} size={28} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setShowCommentBar(false)}
                  style={styles.closeCommentInputBtn}
                  hitSlop={8}
                >
                  <Icon name="close" color="#FFFFFF" size={18} />
                </Pressable>
              </View>
            )}

            {/* Horizontal Quick Reactions: ❤️, 🔥, 👏 */}
            <View style={styles.quickReactions} pointerEvents="auto">
              {["❤️", "🔥", "👏"].map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => handleSendReaction(emoji)}
                  style={styles.quickReactionBtn}
                  hitSlop={8}
                >
                  <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* 8. Streamer Poll Creator Modal */}
      <Modal
        visible={showPollCreator}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPollCreator(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.pollModalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="stats-chart" color={colors.red} size={22} />
                <Text style={styles.modalTitle}>Launch a Live Poll</Text>
              </View>
              <Pressable onPress={() => setShowPollCreator(false)} style={styles.modalCloseBtn}>
                <Icon name="close" color="#FFFFFF" size={20} />
              </Pressable>
            </View>

            <Text style={styles.modalInputLabel}>QUESTION</Text>
            <TextInput
              value={pollQuestion}
              onChangeText={setPollQuestion}
              placeholder="e.g. Should the government intervene?"
              placeholderTextColor="#888"
              style={styles.modalInput}
            />

            <Text style={[styles.modalInputLabel, { marginTop: 12 }]}>OPTIONS (A & B REQUIRED)</Text>
            <TextInput
              value={pollOptionA}
              onChangeText={setPollOptionA}
              placeholder="Option A (e.g. Yes, immediately)"
              placeholderTextColor="#888"
              style={styles.modalInput}
            />
            <TextInput
              value={pollOptionB}
              onChangeText={setPollOptionB}
              placeholder="Option B (e.g. No, not needed)"
              placeholderTextColor="#888"
              style={[styles.modalInput, { marginTop: 8 }]}
            />
            <TextInput
              value={pollOptionC}
              onChangeText={setPollOptionC}
              placeholder="Option C (Optional)"
              placeholderTextColor="#888"
              style={[styles.modalInput, { marginTop: 8 }]}
            />
            <TextInput
              value={pollOptionD}
              onChangeText={setPollOptionD}
              placeholder="Option D (Optional)"
              placeholderTextColor="#888"
              style={[styles.modalInput, { marginTop: 8 }]}
            />

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShowPollCreator(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleStartPoll}
                disabled={!pollQuestion.trim() || !pollOptionA.trim() || !pollOptionB.trim()}
                style={[
                  styles.modalLaunchBtn,
                  (!pollQuestion.trim() || !pollOptionA.trim() || !pollOptionB.trim()) && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.modalLaunchBtnText}>Launch Poll</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: "#000000",
      position: "relative",
      overflow: "hidden",
    },
    centerStatus: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 12,
    },
    pulseRadio: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(229, 9, 20, 0.15)",
      borderWidth: 1.5,
      borderColor: "rgba(229, 9, 20, 0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    centerStatusTitle: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
    },
    centerStatusText: {
      color: "#8E9AA0",
      fontSize: 13,
      textAlign: "center",
      lineHeight: 18,
      maxWidth: 280,
    },
    endStreamBtn: {
      backgroundColor: "#E50914",
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
    },
    endStreamBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    streamTopOverlay: {
      position: "absolute",
      left: 14,
      right: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      zIndex: 20,
    },
    badgesGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    liveBadge: {
      backgroundColor: "#E50914",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    liveBadgeText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    viewerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: "rgba(255, 255, 255, 0.15)",
    },
    viewerBadgeText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
    },
    ownerEndPill: {
      backgroundColor: "#E50914",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
    },
    ownerEndPillText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    ownerControlsGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    streamerToolBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.25)",
    },
    streamerToolBtnActive: {
      backgroundColor: "rgba(229, 9, 20, 0.35)",
      borderColor: "#FF3B30",
    },
    streamDetailsOverlay: {
      position: "absolute",
      left: 14,
      zIndex: 18,
      gap: 6,
      maxWidth: "74%",
    },
    streamDetailsOwner: {
      bottom: 24,
    },
    streamDetailsViewer: {
      bottom: 28,
    },
    reporterProfileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    reporterAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1.5,
      borderColor: "#FFFFFF",
      backgroundColor: "#222",
    },
    reporterAvatarFallback: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: "#FFFFFF",
    },
    reporterAvatarLetter: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
    },
    reporterNameWrap: {
      justifyContent: "center",
      gap: 2,
    },
    reporterNameBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    reporterNameText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
      textShadowColor: "rgba(0,0,0,0.85)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    reporterLiveTag: {
      color: "rgba(255, 255, 255, 0.75)",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    descriptionContainer: {
      marginTop: 2,
      backgroundColor: "rgba(0, 0, 0, 0.4)",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    descriptionText: {
      color: "#F0F0F0",
      fontSize: 13,
      lineHeight: 18,
      textShadowColor: "rgba(0,0,0,0.85)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    descriptionToggleText: {
      color: "#64B5F6",
      fontSize: 12,
      fontWeight: "700",
      marginTop: 2,
    },
    chatOverlay: {
      position: "absolute",
      left: 14,
      zIndex: 15,
    },
    chatOverlayBroadcaster: {
      bottom: 18,
      right: 68,
      maxHeight: 130,
    },
    chatOverlayViewer: {
      bottom: 110,
      right: 80,
      maxHeight: 160,
    },
    chatBroadcasterPlaceholder: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      alignSelf: "flex-start",
      borderWidth: 0.5,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    chatBroadcasterPlaceholderText: {
      color: "rgba(255, 255, 255, 0.8)",
      fontSize: 12,
      fontWeight: "500",
    },
    chatBubble: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginBottom: 6,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      alignSelf: "flex-start",
      maxWidth: "92%",
    },
    chatAvatar: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    chatAvatarLetter: {
      color: "#FFFFFF",
      fontSize: 9,
      fontWeight: "900",
    },
    chatTextWrap: {
      flexShrink: 1,
    },
    chatSender: {
      color: "#64B5F6",
      fontSize: 11,
      fontWeight: "700",
    },
    chatMessage: {
      color: "#FFFFFF",
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500",
    },
    actionRail: {
      position: "absolute",
      right: 12,
      bottom: 28,
      alignItems: "center",
      gap: 14,
      zIndex: 25,
    },
    railBtn: {
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    actionIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    actionIconCircleActive: {
      backgroundColor: "rgba(229, 9, 20, 0.4)",
      borderWidth: 1.5,
      borderColor: "#E50914",
    },
    actionIconCircleLiked: {
      backgroundColor: "rgba(255, 45, 85, 0.25)",
      borderWidth: 1.5,
      borderColor: "#FF2D55",
    },
    actionIconCircleEnd: {
      backgroundColor: "rgba(229, 9, 20, 0.75)",
      borderWidth: 1.5,
      borderColor: "#E50914",
    },
    actionIconCirclePoll: {
      backgroundColor: "rgba(76, 175, 80, 0.35)",
      borderWidth: 1.5,
      borderColor: "#4CAF50",
    },
    railCountText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },
    floatingHeartsCanvas: {
      position: "absolute",
      right: 16,
      bottom: 70,
      width: 60,
      height: 280,
      zIndex: 30,
    },
    floatingHeartItem: {
      position: "absolute",
      bottom: 0,
      right: 10,
    },
    bottomBarWrap: {
      position: "absolute",
      left: 12,
      right: 12,
      bottom: 12,
      zIndex: 35,
    },
    bottomBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    commentInputWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.25)",
      paddingHorizontal: 12,
      height: 42,
    },
    commentInput: {
      flex: 1,
      color: "#FFFFFF",
      fontSize: 13,
      paddingVertical: 6,
    },
    sendBtn: {
      paddingHorizontal: 4,
    },
    closeCommentInputBtn: {
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    quickReactions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    quickReactionBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    quickReactionEmoji: {
      fontSize: 18,
    },
    // Poll Styles
    pollOverlay: {
      position: "absolute",
      left: 14,
      right: 14,
      zIndex: 22,
    },
    pollCard: {
      backgroundColor: "rgba(18, 20, 24, 0.9)",
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.18)",
      maxWidth: 380,
      alignSelf: "center",
      width: "100%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 6,
    },
    pollHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    pollBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(76, 175, 80, 0.2)",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 0.5,
      borderColor: "rgba(76, 175, 80, 0.4)",
    },
    pollBadgeText: {
      color: "#4CAF50",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    pollVotesCount: {
      color: "rgba(255, 255, 255, 0.65)",
      fontSize: 11,
      fontWeight: "600",
    },
    pollEndBtn: {
      backgroundColor: "rgba(229, 9, 20, 0.2)",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 0.5,
      borderColor: "rgba(229, 9, 20, 0.4)",
    },
    pollEndBtnText: {
      color: "#FF5252",
      fontSize: 10,
      fontWeight: "700",
    },
    pollQuestion: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 18,
      marginBottom: 8,
    },
    pollOptionsWrap: {
      gap: 6,
    },
    pollOptionBtn: {
      position: "relative",
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderRadius: 8,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.12)",
      minHeight: 34,
      justifyContent: "center",
    },
    pollOptionBtnSelected: {
      borderColor: "#4CAF50",
    },
    pollOptionProgress: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
    },
    pollOptionContent: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 8,
      zIndex: 2,
    },
    pollLetterBox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      backgroundColor: "rgba(255, 255, 255, 0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    pollLetterBoxSelected: {
      backgroundColor: "#4CAF50",
    },
    pollLetterText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "800",
    },
    pollOptionText: {
      flex: 1,
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "600",
    },
    pollOptionTextSelected: {
      fontWeight: "800",
      color: "#FFFFFF",
    },
    pollPercentText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "800",
    },
    // Modal Styles
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.65)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    pollModalCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: "#16181D",
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.18)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.5,
      shadowRadius: 12,
      elevation: 8,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    modalTitle: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "800",
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalInputLabel: {
      color: "rgba(255, 255, 255, 0.6)",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    modalInput: {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      color: "#FFFFFF",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.12)",
    },
    modalActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 18,
    },
    modalCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    modalCancelBtnText: {
      color: "rgba(255, 255, 255, 0.7)",
      fontSize: 13,
      fontWeight: "600",
    },
    modalLaunchBtn: {
      backgroundColor: "#E50914",
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 8,
    },
    modalLaunchBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "800",
    },
  });
