// Mirrors `cliniflow-app/lib/api.ts` — same production API resolution.

import Constants from "expo-constants";

import { DEFAULT_PUBLIC_API_URL } from "@/lib/env";

function normalizeBaseUrl(raw: string | undefined | null): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s.replace(/\/+$/, "");
}

function resolvePublicApiUrl(): string {
  const envUrl =
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL?.trim()) ||
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_BASE?.trim()) ||
    "";

  const extra = Constants.expoConfig?.extra as
    | { API_URL?: string; api_url?: string }
    | undefined;
  const fromExtra =
    typeof extra?.API_URL === "string"
      ? extra.API_URL.trim()
      : typeof extra?.api_url === "string"
        ? extra.api_url.trim()
        : "";

  return (
    normalizeBaseUrl(envUrl) ||
    normalizeBaseUrl(fromExtra || null) ||
    DEFAULT_PUBLIC_API_URL
  );
}

export const API_BASE = resolvePublicApiUrl();

let AUTH_TOKEN: string | null = null;

export function setAuthToken(token: string | null) {
  AUTH_TOKEN = token;
}

export function getAuthToken(): string | null {
  return AUTH_TOKEN;
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  return headers;
}

/** Public alias for callers that attach auth to non-`apiFetchJson` requests. */
export function getAuthHeaders(): Record<string, string> {
  return authHeaders();
}

export async function apiFetchJson<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const ms = timeoutMs ?? 25_000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  const baseHeaders: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(),
  };
  const extra = (rest.headers as Record<string, string> | undefined) ?? {};
  try {
    const res = await fetch(url, {
      ...rest,
      headers: {
        ...baseHeaders,
        ...extra,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const errPayload =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as { error?: string; message?: string })
          : {};
      const detail =
        errPayload.message || errPayload.error || text.slice(0, 200) || res.statusText;
      const err = new Error(`HTTP ${res.status}: ${detail}`) as Error & {
        status?: number;
        code?: string;
        body?: unknown;
      };
      err.status = res.status;
      err.code = errPayload.error;
      err.body = body;
      throw err;
    }
    return body as T;
  } finally {
    clearTimeout(id);
  }
}
