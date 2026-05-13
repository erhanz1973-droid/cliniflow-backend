import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { API_BASE, getAuthHeaders, getAuthToken } from "@/lib/api";
import {
  getEasProjectIdForPush,
  getExpoPushTokenWithTimeout,
  isExpoNotificationsPluginInConfig,
  logPushRuntimeEnvironment,
} from "@/lib/expoPushEnvChecks";
import { updatePushDiag } from "@/lib/pushDiagnostics";

export type DoctorPushSyncResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "simulator"
        | "no_jwt"
        | "notifications_not_granted"
        | "no_expo_push_token"
        | "missing_project_id"
        | "token_timeout"
        | "http_error"
        | "network_error";
      httpStatus?: number;
      detail?: string;
    };

function pushSyncLog(message: string, data?: Record<string, unknown>): void {
  console.log(`[PUSH_SYNC] ${message}`, data ?? "");
}

export type SyncDoctorExpoPushOptions = {
  /** When already obtained in the hook, avoids a second native round-trip. */
  expoPushTokenOverride?: string | null;
};

/**
 * Registers the device Expo push token with the production API when a doctor JWT exists.
 * Safe to call multiple times (idempotent on server side per token row).
 */
export async function syncDoctorExpoPushTokenWithBackend(
  options?: SyncDoctorExpoPushOptions
): Promise<DoctorPushSyncResult> {
  logPushRuntimeEnvironment("[PUSH_SYNC]");
  pushSyncLog("enter", {
    hasTokenOverride: !!(options?.expoPushTokenOverride && String(options.expoPushTokenOverride).trim()),
    hasJwt: !!getAuthToken(),
  });
  updatePushDiag({ step: "sync_enter", lastSyncOk: null, lastSyncReason: null, lastError: null });

  if (!Device.isDevice) {
    pushSyncLog("exit_simulator");
    updatePushDiag({
      step: "sync_simulator",
      isDevice: false,
      lastSyncOk: false,
      lastSyncReason: "simulator",
    });
    return { ok: false, reason: "simulator" };
  }
  updatePushDiag({ isDevice: true });

  if (!getAuthToken()) {
    pushSyncLog("exit_no_jwt");
    updatePushDiag({ step: "sync_no_jwt", lastSyncOk: false, lastSyncReason: "no_jwt" });
    return { ok: false, reason: "no_jwt" };
  }

  const { status } = await Notifications.getPermissionsAsync();
  pushSyncLog("permission_status", { status });
  updatePushDiag({ permissionStatus: status });
  if (status !== "granted") {
    pushSyncLog("exit_notifications_not_granted");
    updatePushDiag({
      step: "sync_not_granted",
      lastSyncOk: false,
      lastSyncReason: "notifications_not_granted",
    });
    return { ok: false, reason: "notifications_not_granted" };
  }

  const projectId = getEasProjectIdForPush();
  const projectIdPresent = !!projectId;
  const pluginActive = isExpoNotificationsPluginInConfig();
  updatePushDiag({
    projectIdPresent,
    projectIdPreview: projectId ? `${projectId.slice(0, 8)}…` : null,
    notificationsPluginActive: pluginActive,
  });
  pushSyncLog("projectId", { present: projectIdPresent, notificationsPluginInConfig: pluginActive });

  let tokenStr = String(options?.expoPushTokenOverride ?? "").trim();
  if (tokenStr) {
    pushSyncLog("using_token_override", { length: tokenStr.length });
  } else {
    if (!projectIdPresent) {
      pushSyncLog("exit_missing_project_id");
      updatePushDiag({
        step: "sync_missing_project_id",
        lastSyncOk: false,
        lastSyncReason: "missing_project_id",
        lastError: "Constants.expoConfig.extra.eas.projectId missing",
      });
      return {
        ok: false,
        reason: "missing_project_id",
        detail: "Set extra.eas.projectId in app.json / app.config.",
      };
    }
    pushSyncLog("getExpoPushTokenAsync_start", { deadlineMs: 45_000 });
    updatePushDiag({ step: "getExpoPushTokenAsync_start" });
    const resolved = await getExpoPushTokenWithTimeout(projectId);
    if (!resolved.ok) {
      console.error("[PUSH_SYNC] getExpoPushTokenAsync_failed", resolved.detail);
      updatePushDiag({
        step: "sync_token_resolve_failed",
        lastSyncOk: false,
        lastSyncReason: resolved.reason,
        lastError: resolved.detail,
      });
      return { ok: false, reason: resolved.reason, detail: resolved.detail };
    }
    tokenStr = resolved.token;
    pushSyncLog("getExpoPushTokenAsync_resolved", {
      length: tokenStr.length,
      looksLikeExponent: tokenStr.startsWith("ExponentPushToken["),
    });
    updatePushDiag({
      step: "getExpoPushTokenAsync_resolved",
      expoTokenPreview: tokenStr
        ? tokenStr.length > 40
          ? `${tokenStr.slice(0, 28)}…`
          : tokenStr
        : null,
    });
  }

  if (!tokenStr.startsWith("ExponentPushToken[")) {
    pushSyncLog("exit_bad_token_shape", { prefix: tokenStr.slice(0, 24) });
    updatePushDiag({
      step: "sync_bad_token",
      lastSyncOk: false,
      lastSyncReason: "no_expo_push_token",
      lastError: "Token does not start with ExponentPushToken[",
    });
    return { ok: false, reason: "no_expo_push_token", detail: tokenStr ? "unexpected_shape" : "empty" };
  }

  const url = `${API_BASE}/api/doctor/me/expo-push-token`;
  pushSyncLog("fetch_start", { method: "POST", path: "/api/doctor/me/expo-push-token" });
  updatePushDiag({ step: "sync_fetch_start" });

  const expoExperienceId = String(Constants.expoConfig?.originalFullName ?? "").trim();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        expoPushToken: tokenStr,
        token: tokenStr,
        /** Must match patient app: server omits Expo `sound` when false → iOS banner without chime. */
        messageSound: true,
        platform: Platform.OS,
        /** `@owner/slug` — backend filters / batches Expo sends so doctor vs patient apps never mix. */
        ...(expoExperienceId ? { expoExperienceId } : {}),
      }),
    });
    const bodyText = await res.text().catch(() => "");
    pushSyncLog("fetch_done", { httpStatus: res.status, bodyLen: bodyText.length });
    if (!res.ok) {
      console.error("[PUSH_SYNC] http_error_body_preview", bodyText.slice(0, 400));
      updatePushDiag({
        step: "sync_http_error",
        lastSyncOk: false,
        lastSyncReason: "http_error",
        lastError: `${res.status} ${bodyText.slice(0, 120)}`,
      });
      return {
        ok: false,
        reason: "http_error",
        httpStatus: res.status,
        detail: bodyText.slice(0, 200),
      };
    }
    pushSyncLog("success");
    updatePushDiag({
      step: "sync_success",
      lastSyncOk: true,
      lastSyncReason: null,
      lastError: null,
      expoTokenPreview:
        tokenStr.length > 40 ? `${tokenStr.slice(0, 28)}…${tokenStr.slice(-8)}` : tokenStr,
    });
    return { ok: true };
  } catch (e) {
    const detail = (e as Error)?.message || String(e);
    console.error("[PUSH_SYNC] fetch_throw", e);
    updatePushDiag({
      step: "sync_network_throw",
      lastSyncOk: false,
      lastSyncReason: "network_error",
      lastError: detail,
    });
    return {
      ok: false,
      reason: "network_error",
      detail,
    };
  }
}
