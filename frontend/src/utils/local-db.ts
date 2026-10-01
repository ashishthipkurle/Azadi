import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system";

// Open (or create) the local database
const db = SQLite.openDatabaseSync("azadi_local_v1.db");

// Initialize tables if they don't exist
export function initLocalDB() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      body TEXT NOT NULL,
      encrypted INTEGER NOT NULL,
      read INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      chat_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_id ON messages (chat_id);
    
    CREATE TABLE IF NOT EXISTS media_cache (
      url TEXT PRIMARY KEY,
      local_uri TEXT NOT NULL
    );
  `);
}

// Automatically init on import
try {
  initLocalDB();
} catch (e) {
  console.error("Failed to init local DB", e);
}

export type LocalMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  encrypted: boolean;
  read: boolean;
  created_at: string;
};

// Insert a single message (e.g. from polling or websocket)
export function saveLocalMessage(msg: LocalMessage, currentUserId: string) {
  const chatId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
  db.runSync(
    `INSERT OR IGNORE INTO messages (id, sender_id, receiver_id, body, encrypted, read, created_at, chat_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      msg.id,
      msg.sender_id,
      msg.receiver_id,
      msg.body,
      msg.encrypted ? 1 : 0,
      msg.read ? 1 : 0,
      msg.created_at,
      chatId,
    ]
  );
}

// Bulk insert messages from the server
export function saveLocalMessages(messages: LocalMessage[], currentUserId: string) {
  for (const msg of messages) {
    saveLocalMessage(msg, currentUserId);
  }
}

// Get messages for a specific chat (e.g. when loading the chat screen offline)
export function getLocalMessages(chatId: string, limit = 50, offset = 0): LocalMessage[] {
  const rows = db.getAllSync(
    `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [chatId, limit, offset]
  );
  
  return rows.map((r: any) => ({
    id: r.id,
    sender_id: r.sender_id,
    receiver_id: r.receiver_id,
    body: r.body,
    encrypted: r.encrypted === 1,
    read: r.read === 1,
    created_at: r.created_at,
  }));
}

// Media Caching Logic
export async function getCachedMedia(url: string): Promise<string> {
  const row: any = db.getFirstSync(`SELECT local_uri FROM media_cache WHERE url = ?`, [url]);
  if (row) {
    // Check if file still exists on disk
    const info = await FileSystem.getInfoAsync(row.local_uri);
    if (info.exists) {
      return row.local_uri;
    } else {
      db.runSync(`DELETE FROM media_cache WHERE url = ?`, [url]);
    }
  }

  // Not cached, download it
  const filename = url.split("/").pop() || `media-${Date.now()}`;
  const fileUri = `${FileSystem.documentDirectory}${filename}`;
  
  try {
    const { uri } = await FileSystem.downloadAsync(url, fileUri);
    db.runSync(`INSERT OR REPLACE INTO media_cache (url, local_uri) VALUES (?, ?)`, [url, uri]);
    return uri;
  } catch (e) {
    console.error("Failed to cache media", e);
    return url; // fallback to online url
  }
}
