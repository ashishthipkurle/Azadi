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
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) return data.detail.map((d: any) => d.msg).join(", ");
    return res.statusText || "Something went wrong";
  } catch {
    return res.statusText || "Something went wrong";
  }
}

async function getUrl(path: string): Promise<string> {
  const useProxy = await storage.secureGet("use_proxy", "false");
  const targetUrl = `${API}${path}`;
  if (useProxy === "true") {
    return `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
  }
  return targetUrl;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(await getUrl(path), {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiGetPaginated<T>(path: string, cursorKey: string, cursorValue?: string): Promise<T> {
  const base = await getUrl(path);
  const url = new URL(base);
  
  let finalUrl = base;
  if (cursorValue) {
    if (base.includes("corsproxy.io")) {
      finalUrl = `https://corsproxy.io/?url=${encodeURIComponent(`${API}${path}?${cursorKey}=${cursorValue}`)}`;
    } else {
      url.searchParams.append(cursorKey, cursorValue);
      finalUrl = url.toString();
    }
  }
    
  const res = await fetch(finalUrl, {
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(await getUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiPatch<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(await getUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(await getUrl(path), {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json();
}
