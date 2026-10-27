// AuthContext: single source of truth for the logged-in user + JWT.
// - On boot, restores the cached user profile instantly from AsyncStorage,
//   then validates the token with /auth/me in the background.
// - Exposes login/register/logout that all screens can call.
// - After login, expo-router's index.tsx decides which role stack to send them to.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError, apiGet, apiPost, TOKEN_KEY } from "@/src/api";
import { storage } from "@/src/utils/storage";

export type Role = "client" | "reporter" | "admin";
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  verified?: boolean;
  disabled?: boolean;
  beat?: string;
  location?: string;
  bio?: string;
  avatar_url?: string;
};

type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  loginAnonymous: () => Promise<AuthUser>;
  register: (name: string, email: string, password: string, role: Role) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Key for caching the full user profile in AsyncStorage. */
const USER_CACHE_KEY = "azadi.user_profile";

/** Save user profile to AsyncStorage so the session restores instantly on reboot. */
async function cacheUser(u: AuthUser | null) {
  if (u) {
    await storage.setItem(USER_CACHE_KEY, JSON.stringify(u));
  } else {
    await storage.removeItem(USER_CACHE_KEY);
  }
}

/** Read the cached user profile from AsyncStorage. */
async function getCachedUser(): Promise<AuthUser | null> {
  const raw = await storage.getItem<string>(USER_CACHE_KEY, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (token) {
        // Step 1: Restore cached user profile instantly — no network needed.
        const cached = await getCachedUser();
        if (cached) setUser(cached);

        // Step 2: Validate the token with the backend in the background.
        try {
          const me = await apiGet<AuthUser>("/auth/me");
          setUser(me);
          await cacheUser(me); // refresh the cache with latest data
        } catch (e) {
          // Only clear the token+cache if the server explicitly rejected it (401/403).
          // For network errors or server outages (5xx), keep everything so the
          // session survives temporary backend downtime.
          const isAuthRejection = e instanceof ApiError && (e.status === 401 || e.status === 403);
          if (isAuthRejection) {
            await storage.secureRemove(TOKEN_KEY);
            await cacheUser(null);
            setUser(null);
          }
          // Otherwise: cached user stays active — the app works offline / during outages.
        }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiPost<{ access_token: string; user: AuthUser }>("/auth/login", { email, password });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    await cacheUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const loginAnonymous = useCallback(async () => {
    const res = await apiPost<{ access_token: string; user: AuthUser }>("/auth/anonymous", {});
    await storage.secureSet(TOKEN_KEY, res.access_token);
    await cacheUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, role: Role) => {
    const res = await apiPost<{ access_token: string; user: AuthUser }>("/auth/register", { name, email, password, role });
    await storage.secureSet(TOKEN_KEY, res.access_token);
    await cacheUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    await cacheUser(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await apiGet<AuthUser>("/auth/me");
      setUser(me);
      await cacheUser(me);
    } catch (e) {
      // Only log out if the server explicitly rejected the token.
      const isAuthRejection = e instanceof ApiError && (e.status === 401 || e.status === 403);
      if (isAuthRejection) {
        setUser(null);
        await storage.secureRemove(TOKEN_KEY);
        await cacheUser(null);
      }
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ ready, user, login, loginAnonymous, register, logout, refresh }),
    [ready, user, login, loginAnonymous, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

