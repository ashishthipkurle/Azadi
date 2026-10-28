import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/src/api";

export type FollowedReporter = {
  id: string;
  name: string;
  avatar_url?: string;
  verified?: boolean;
};

type Listener = () => void;
const listeners = new Set<Listener>();

let followedReporters: FollowedReporter[] = [];
let hasLoaded = false;

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
}

export const followStore = {
  getFollowedReporters(): FollowedReporter[] {
    return followedReporters;
  },

  isFollowing(id: string): boolean {
    return followedReporters.some((r) => r.id === id);
  },

  setFollowedReporters(list: FollowedReporter[]) {
    followedReporters = list;
    hasLoaded = true;
    notify();
  },

  async follow(reporter: FollowedReporter, onCountChange?: (delta: number) => void) {
    // 1. Optimistic addition immediately
    if (!followedReporters.some((r) => r.id === reporter.id)) {
      followedReporters = [reporter, ...followedReporters];
      notify();
    }
    onCountChange?.(1);

    // 2. Call backend
    try {
      const res = await apiPost<{ ok: boolean; following: boolean; followers: number }>(
        `/reporters/${reporter.id}/follow`
      );
      return res;
    } catch (e) {
      // Revert if error
      followedReporters = followedReporters.filter((r) => r.id !== reporter.id);
      notify();
      onCountChange?.(-1);
      throw e;
    }
  },

  async unfollow(reporterId: string, onCountChange?: (delta: number) => void) {
    // 1. Optimistic removal immediately
    const prev = [...followedReporters];
    followedReporters = followedReporters.filter((r) => r.id !== reporterId);
    notify();
    onCountChange?.(-1);

    // 2. Call backend
    try {
      const res = await apiDelete<{ ok: boolean; following: boolean; followers: number }>(
        `/reporters/${reporterId}/follow`
      );
      return res;
    } catch (e) {
      // Revert if error
      followedReporters = prev;
      notify();
      onCountChange?.(1);
      throw e;
    }
  },

  async sync(): Promise<FollowedReporter[]> {
    try {
      const reps = await apiGet<FollowedReporter[]>("/reporters/following");
      followedReporters = reps;
      hasLoaded = true;
      notify();
      return reps;
    } catch {
      return followedReporters;
    }
  },
};

export function useFollowStore() {
  const [reporters, setReporters] = useState<FollowedReporter[]>(() => followStore.getFollowedReporters());

  useEffect(() => {
    const handleChange = () => {
      setReporters([...followStore.getFollowedReporters()]);
    };
    listeners.add(handleChange);
    // Initial sync if not loaded yet
    if (!hasLoaded) {
      followStore.sync();
    }
    return () => {
      listeners.delete(handleChange);
    };
  }, []);

  return {
    followedReporters: reporters,
    isFollowing: (id: string) => followStore.isFollowing(id),
    follow: followStore.follow,
    unfollow: followStore.unfollow,
    setFollowedReporters: followStore.setFollowedReporters,
    syncFollowed: followStore.sync,
  };
}
