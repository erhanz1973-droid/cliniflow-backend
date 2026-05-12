import Constants from "expo-constants";

/** Metro __DEV__ or EAS-built extra from EXPO_PUBLIC_DOCTOR_PUSH_DELIVERY_LOG=1 */
export function isDoctorPushDeliveryLogEnabled(): boolean {
  if (typeof __DEV__ !== "undefined" && __DEV__) return true;
  const extra = Constants.expoConfig?.extra as { doctorPushDeliveryLog?: boolean } | undefined;
  return extra?.doctorPushDeliveryLog === true;
}

/**
 * Throttled Expo token re-sync when app returns foreground (after prune, new dev build, etc.).
 * Defaults to on in production; set extra.doctorPushResyncOnActive false via app config if you need to disable.
 */
export function isDoctorForegroundPushResyncEnabled(): boolean {
  const extra = Constants.expoConfig?.extra as { doctorPushResyncOnActive?: boolean } | undefined;
  if (extra && extra.doctorPushResyncOnActive === false) return false;
  return true;
}

/**
 * Same production API origin as `cliniflow-app/lib/api.ts` (Railway).
 * Override with `EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_API_BASE` at build time.
 */
export const DEFAULT_PUBLIC_API_URL = "https://cliniflow-backend-clean-production.up.railway.app";

/**
 * Supabase project URL used by production backend (public; not a secret).
 * Anon key must come from `EXPO_PUBLIC_SUPABASE_ANON_KEY` — never commit keys.
 */
export const DEFAULT_PUBLIC_SUPABASE_URL = "https://swxinrwbylygoqdcbwbt.supabase.co";

function normalizeOrigin(raw: string | undefined | null): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s.replace(/\/+$/, "");
}

/** Supabase REST origin (no trailing slash). */
export function getPublicSupabaseUrl(): string {
  const fromEnv =
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) || "";
  const extra = Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined;
  const fromExtra = typeof extra?.supabaseUrl === "string" ? extra.supabaseUrl.trim() : "";
  return (
    normalizeOrigin(fromEnv) ||
    normalizeOrigin(fromExtra || null) ||
    DEFAULT_PUBLIC_SUPABASE_URL
  );
}

/** Public anon key for direct Supabase (RLS). Empty until set via env / EAS. */
export function getPublicSupabaseAnonKey(): string {
  const fromEnv =
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) || "";
  const extra = Constants.expoConfig?.extra as { supabaseAnonKey?: string } | undefined;
  const fromExtra = typeof extra?.supabaseAnonKey === "string" ? extra.supabaseAnonKey.trim() : "";
  return (fromEnv || fromExtra || "").trim();
}

/**
 * DEV-only: where the anon key was resolved from (no key material).
 * In release builds `process.env` values are inlined at bundle time.
 */
export function getPublicSupabaseAnonKeyResolution(): {
  loaded: boolean;
  length: number;
  fromProcessEnv: boolean;
  fromExtra: boolean;
} {
  const envTrim =
    typeof process !== "undefined"
      ? String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim()
      : "";
  const extra = Constants.expoConfig?.extra as { supabaseAnonKey?: string } | undefined;
  const extraTrim = typeof extra?.supabaseAnonKey === "string" ? extra.supabaseAnonKey.trim() : "";
  const key = envTrim || extraTrim;
  return {
    loaded: key.length > 0,
    length: key.length,
    fromProcessEnv: envTrim.length > 0,
    fromExtra: envTrim.length === 0 && extraTrim.length > 0,
  };
}
