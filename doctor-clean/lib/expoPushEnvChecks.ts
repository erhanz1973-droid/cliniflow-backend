import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

const GET_EXPO_PUSH_TOKEN_MS = 45_000;

/** Resolved EAS project id for getExpoPushTokenAsync (extra or legacy easConfig). */
export function getEasProjectIdForPush(): string | null {
  const fromExtra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const a = fromExtra?.eas?.projectId;
  if (typeof a === "string" && a.trim()) return a.trim();
  const b = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (typeof b === "string" && b.trim()) return b.trim();
  return null;
}

/** Best-effort: true if expo-notifications appears in the resolved config plugins list. */
export function isExpoNotificationsPluginInConfig(): boolean | null {
  const plugins = Constants.expoConfig?.plugins;
  if (!Array.isArray(plugins)) return null;
  return plugins.some((p) => {
    if (p === "expo-notifications") return true;
    if (Array.isArray(p) && p[0] === "expo-notifications") return true;
    return false;
  });
}

export function logPushRuntimeEnvironment(prefix: "[PUSH_INIT]" | "[PUSH_TOKEN]" | "[PUSH_SYNC]"): void {
  if (!__DEV__) return;
  const projectId = getEasProjectIdForPush();
  const plugin = isExpoNotificationsPluginInConfig();
  console.log(`${prefix} runtime_env`, {
    isDevice: Device.isDevice,
    executionEnvironment: Constants.executionEnvironment,
    appOwnership: Constants.appOwnership,
    easProjectIdPresent: !!projectId,
    easProjectIdPreview: projectId ? `${projectId.slice(0, 8)}…` : null,
    expoNotificationsPluginInExpoConfig: plugin,
    expoConfigSdkVersion: Constants.expoConfig?.sdkVersion ?? null,
  });
}

export type ExpoPushTokenResolveResult =
  | { ok: true; token: string }
  | { ok: false; reason: "token_timeout" | "network_error"; detail: string };

/**
 * Wraps `getExpoPushTokenAsync` with a hard timeout so a native hang surfaces as diagnostics
 * instead of a silent stall.
 */
export async function getExpoPushTokenWithTimeout(
  projectId: string | null,
  ms: number = GET_EXPO_PUSH_TOKEN_MS
): Promise<ExpoPushTokenResolveResult> {
  const args = projectId ? { projectId } : undefined;
  const tokenPromise = Notifications.getExpoPushTokenAsync(args);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`getExpoPushTokenAsync exceeded ${ms}ms`)),
      ms
    );
  });
  try {
    const tk = await Promise.race([tokenPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    const tokenStr = typeof tk.data === "string" ? tk.data.trim() : "";
    return { ok: true, token: tokenStr };
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    const msg = (e as Error)?.message || String(e);
    const isTimeout = msg.includes("exceeded");
    return {
      ok: false,
      reason: isTimeout ? "token_timeout" : "network_error",
      detail: msg,
    };
  }
}
