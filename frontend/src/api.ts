// API client: attaches JWT token from secure storage to every request and
// surfaces friendly error messages (including the 503 "coming soon" ones
// the backend returns when integrations aren't configured yet).
import Constants from "expo-constants";

import { storage } from "@/src/utils/storage";

const RAW =
  process.env.EXPO_PUBLIC_RELAY_URL ||
  (Constants.expoConfig?.extra as any)?.backendUrl ||
  "";

export const API = `${RAW}/api`;

export const TOKEN_KEY = "azadi.jwt";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  const headers: Record<string, string> = {
    "Bypass-Tunnel-Reminder": "true"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (typeof data?.detail === "string") return data.detail;
      if (Array.isArray(data?.detail)) return data.detail.map((d: any) => d.msg).join(", ");
      if (typeof data?.message === "string") return data.message;
      if (typeof data?.error === "string") return data.error;
    } catch {
      // Not JSON — might be a plain text or HTML error from a tunnel/proxy
      if (text && text.length < 200 && !text.includes("<html")) return text;
    }
    // Fallback: use status code for a more helpful message
    if (res.status === 401) return "Invalid email or password";
    if (res.status === 409) return "An account with this email already exists";
    if (res.status === 422) return "Please check your input and try again";
    if (res.status === 503) return "Server is temporarily unavailable. Try again later.";
    return res.statusText || `Server error (${res.status})`;
  } catch {
    return res.statusText || `Server error (${res.status})`;
  }
}



export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiGetPaginated<T>(path: string, cursorKey: string, cursorValue?: string): Promise<T> {
  const base = `${API}${path}`;
  const url = new URL(base);
  
  if (cursorValue) {
    url.searchParams.append(cursorKey, cursorValue);
  }
    
  const res = await fetch(cursorValue ? url.toString() : base, {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiPatch<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}
