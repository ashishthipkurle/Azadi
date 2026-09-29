import { storage } from "@/src/utils/storage";

export interface Draft {
  title: string;
  body: string;
  kind: string;
  attachments: {
    kind: "image" | "video";
    local_uri: string;
    playback_id?: string;
    asset_id?: string;
    status: string;
  }[];
  savedAt: number;
}

export const DraftStore = {
  async save(draft: Omit<Draft, "savedAt">) {
    await storage.setItem("azadi.draft", { ...draft, savedAt: Date.now() });
  },
  async load(): Promise<Draft | null> {
    return storage.getItem<Draft>("azadi.draft", null);
  },
  async clear() {
    await storage.removeItem("azadi.draft");
  },
};
