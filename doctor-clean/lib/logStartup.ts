import { API_BASE, getAuthToken } from "@/lib/api";
import {
  getPublicSupabaseAnonKey,
  getPublicSupabaseAnonKeyResolution,
  getPublicSupabaseUrl,
} from "@/lib/env";
import { getSupabaseClient } from "@/lib/supabase";
import type { DoctorPushSyncResult } from "@/lib/syncDoctorExpoPush";

/** DEV-only: resolved API + Supabase + push sync (no secrets). */
export function logDoctorCleanStartupEnv(): void {
  if (!__DEV__) return;
  console.log("[doctor-clean:env] API_BASE:", API_BASE);
  console.log("[doctor-clean:env] SUPABASE_URL:", getPublicSupabaseUrl());
  const anon = getPublicSupabaseAnonKey();
  const res = getPublicSupabaseAnonKeyResolution();
  console.log("[doctor-clean:env] SUPABASE_ANON_KEY loaded:", res.loaded ? "yes" : "no", {
    length: res.length,
    fromProcessEnv: res.fromProcessEnv,
    fromExtra: res.fromExtra,
    preview: anon ? `${anon.slice(0, 8)}…` : null,
  });
  console.log(
    "[doctor-clean:env] supabase_js_client:",
    getSupabaseClient() ? "initialized (anon + URL)" : "skipped (set EXPO_PUBLIC_SUPABASE_ANON_KEY in .env or EAS)"
  );
  console.log("[doctor-clean:env] doctor JWT in memory:", getAuthToken() ? "present" : "absent");
}

export function logDoctorCleanPushSyncResult(result: DoctorPushSyncResult): void {
  if (!__DEV__) return;
  if (result.ok) {
    console.log("[PUSH_SYNC] doctor_clean_startup_log: success");
    return;
  }
  console.warn("[PUSH_SYNC] doctor_clean_startup_log: failure", {
    reason: result.reason,
    httpStatus: "httpStatus" in result ? result.httpStatus : undefined,
    detail: "detail" in result ? result.detail : undefined,
  });
}
