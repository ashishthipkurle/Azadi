import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { type Room, type Participant } from "livekit-client";
import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/hooks/use-theme";
import { Icon } from "@/src/ui";

type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
};

export function LiveChat({ room }: { room: Room | null }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!room) return;
    
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lk = require("livekit-client");
    
    const onDataReceived = (payload: Uint8Array, participant?: Participant) => {
      try {
        // Decode
        const decoder = new TextDecoder();
        const text = decoder.decode(payload);
        const data = JSON.parse(text);
        if (data.type === "chat") {
          setMessages(prev => [...prev, {
            id: Math.random().toString(36).substring(7),
            sender: participant?.name || participant?.identity || "Unknown",
            text: data.text,
            timestamp: Date.now()
          }]);
        }
      } catch (e) {
        console.error("Failed to parse chat message", e);
      }
    };

    room.on(lk.RoomEvent.DataReceived, onDataReceived);
    return () => {
      room.off(lk.RoomEvent.DataReceived, onDataReceived);
    };
  }, [room]);

  const send = async () => {
    if (!room || !input.trim()) return;
    const text = input.trim();
    setInput("");
    
    const msg = { type: "chat", text };
    const encoder = new TextEncoder();
    const payload = encoder.encode(JSON.stringify(msg));
    
    try {
      await room.localParticipant.publishData(payload, { reliable: true });
      
      // Also add to local state
      setMessages(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        sender: user?.name || "Me",
        text,
        timestamp: Date.now()
      }]);
    } catch (e) {
      console.error("Failed to send message", e);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={styles.messageRow}>
            <Text style={styles.sender}>{item.sender}</Text>
            <Text style={styles.messageText}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Send a message..."
          placeholderTextColor={colors.muted}
          style={styles.input}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable onPress={send} style={styles.sendButton} disabled={!input.trim()}>
          <Icon name="paper-plane" size={16} color={input.trim() ? colors.surface : colors.muted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line, maxHeight: 300 },
  list: { padding: 16, gap: 10 },
  messageRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  sender: { color: colors.muted, fontSize: 13, fontWeight: "800", marginTop: 2 },
  messageText: { color: colors.ink, fontSize: 15, flex: 1, lineHeight: 20 },
  inputRow: { flexDirection: "row", alignItems: "center", padding: 10, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  input: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, color: colors.ink, fontSize: 15 },
  sendButton: { backgroundColor: colors.ink, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }
});
