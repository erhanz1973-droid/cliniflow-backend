import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Injects public env into `Constants.expoConfig.extra` (same pattern as Clinifly / EAS secrets).
 * Expo CLI loads `doctor-clean/.env` when present; use `EXPO_PUBLIC_*` only (never service_role).
 * For EAS builds, mirror these keys in EAS Secrets so `extra` is populated at build time.
 */
export default ({ config }: ConfigContext): ExpoConfig =>
  ({
    ...config,
    extra: {
      ...config.extra,
      API_URL: process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE || "",
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
      /** Preserve `app.json` extra.eas; allow EAS_PROJECT_ID env override for push. */
      eas: (() => {
        const raw = config.extra as { eas?: { projectId?: string } } | undefined;
        const base =
          raw?.eas && typeof raw.eas === "object" ? { ...raw.eas } : ({} as { projectId?: string });
        const fromEnv = (process.env.EAS_PROJECT_ID || "").trim();
        if (fromEnv) base.projectId = fromEnv;
        return base;
      })(),
      /** Set EXPO_PUBLIC_DOCTOR_PUSH_DELIVERY_LOG=1 for release builds: logs notification receive/tap + app state. */
      doctorPushDeliveryLog:
        String(process.env.EXPO_PUBLIC_DOCTOR_PUSH_DELIVERY_LOG || "").trim() === "1",
      /**
       * Foreground token re-sync is on by default (throttled in use-push-notifications).
       * EXPO_PUBLIC_DOCTOR_PUSH_RESYNC_ON_ACTIVE=0 disables it at build time.
       */
      doctorPushResyncOnActive:
        String(process.env.EXPO_PUBLIC_DOCTOR_PUSH_RESYNC_ON_ACTIVE || "").trim() !== "0",
    },
  }) as ExpoConfig;
