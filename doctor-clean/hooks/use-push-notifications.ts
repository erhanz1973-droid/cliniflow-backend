import { useCallback, useEffect, useRef } from "react";
import type { EventSubscription } from "expo-modules-core";
import * as Clipboard from "expo-clipboard";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";

import { isDoctorForegroundPushResyncEnabled, isDoctorPushDeliveryLogEnabled } from "@/lib/env";
import { getPathFromNotificationData } from "@/lib/notificationRouting";
import { logDoctorCleanPushSyncResult } from "@/lib/logStartup";
import {
  getEasProjectIdForPush,
  getExpoPushTokenWithTimeout,
  isExpoNotificationsPluginInConfig,
  logPushRuntimeEnvironment,
} from "@/lib/expoPushEnvChecks";
import { updatePushDiag } from "@/lib/pushDiagnostics";
import {
  logAndroidDefaultChannelReadback,
  logIosNotificationPermissionSnapshot,
} from "@/lib/pushSoundRuntime";
import { syncDoctorExpoPushTokenWithBackend } from "@/lib/syncDoctorExpoPush";

const ANDROID_DEFAULT_CHANNEL_ID = "default";
const MAX_TRACKED_NOTIFICATION_IDS = 64;
const SAME_PATH_DEBOUNCE_MS = 700;
const DOCTOR_FOREGROUND_PUSH_RESYNC_MS = 6 * 60 * 1000;
let lastDoctorPushForegroundResyncAt = 0;

function bucketDoctorPushAppState(status: AppStateStatus): "foreground" | "background_or_inactive" {
  return status === "active" ? "foreground" : "background_or_inactive";
}

/** Log surface for APNS/FCM presentation (sound/badge may be null on some paths). */
function contentSummaryForDoctorPushLog(content: Notifications.NotificationContent) {
  const c = content as Notifications.NotificationContent & {
    sound?: string | null;
    badge?: number | null;
  };
  return {
    title: content.title ?? null,
    subtitle: content.subtitle ?? null,
    body: content.body ?? null,
    data: content.data ?? null,
    sound: c.sound ?? null,
    badge: c.badge ?? null,
    categoryIdentifier: content.categoryIdentifier ?? null,
  };
}

type DeliveryKind = "cold_start" | "listener" | "queued_flush";

type SourceBucket = "terminated" | "foreground" | "background" | "unknown";

function classifySourceForLog(
  delivery: DeliveryKind,
  appStateNow: AppStateStatus,
  enteredBackgroundAt: number | null
): SourceBucket {
  if (delivery === "cold_start") return "terminated";
  const now = Date.now();
  if (
    enteredBackgroundAt != null &&
    now - enteredBackgroundAt < 4000 &&
    appStateNow === "active"
  ) {
    return "background";
  }
  if (appStateNow === "active") return "foreground";
  return "unknown";
}

function pushDebug(
  message: string,
  payload: Record<string, unknown> | undefined
): void {
  if (!__DEV__) return;
  console.log(`[push:nav] ${message}`, payload);
}

function getRequestId(response: Notifications.NotificationResponse): string {
  return response.notification.request.identifier;
}

async function ensureAndroidDefaultChannel() {
  if (Platform.OS !== "android") return;
  const channelBase = {
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  };
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL_ID, {
    ...channelBase,
    name: "default",
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync("chat_alerts", {
    ...channelBase,
    name: "Messages",
    sound: "default",
  });
  __DEV__ &&
    console.log("[PUSH_SOUND] android_channel_set", {
      ids: [ANDROID_DEFAULT_CHANNEL_ID, "chat_alerts"],
      sound: "default",
    });
  await logAndroidDefaultChannelReadback(ANDROID_DEFAULT_CHANNEL_ID);
}

/**
 * Registers for push, requests permissions, wires listeners, and resolves cold-start opens.
 * Queues notification responses until root navigation is ready; dedupes by request id and rapid same-path pushes.
 */
export function usePushNotifications() {
  const rootNav = useRootNavigationState();
  const responseListener = useRef<EventSubscription | null>(null);
  const receivedListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[PUSH_INIT] usePushNotifications hook initialized (mount)");
    updatePushDiag({ step: "hook_usePushNotifications_mount" });
  }, []);

  const pendingResponseRef = useRef<Notifications.NotificationResponse | null>(null);
  const processedNotificationIdsRef = useRef<string[]>([]);
  const lastPathPushRef = useRef<{ path: string; at: number } | null>(null);
  /** Ensures `getLastNotificationResponseAsync` cold path runs at most once per mount (Strict Mode safe). */
  const coldStartLastFetchDoneRef = useRef(false);
  const navigationReadyRef = useRef(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const enteredBackgroundAtRef = useRef<number | null>(null);
  const expoTokenPreviewRef = useRef<string | null>(null);

  navigationReadyRef.current = !!rootNav?.key;

  const rememberProcessedId = useCallback((id: string) => {
    const list = processedNotificationIdsRef.current;
    list.push(id);
    if (list.length > MAX_TRACKED_NOTIFICATION_IDS) {
      list.splice(0, list.length - MAX_TRACKED_NOTIFICATION_IDS);
    }
  }, []);

  const wasAlreadyProcessed = useCallback((id: string) => {
    return processedNotificationIdsRef.current.includes(id);
  }, []);

  const tryNavigateFromResponse = useCallback(
    (response: Notifications.NotificationResponse, delivery: DeliveryKind) => {
      const navReady = navigationReadyRef.current;
      const id = getRequestId(response);
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;

      const appStateNow = appStateRef.current;
      const sourceBucket = classifySourceForLog(
        delivery,
        appStateNow,
        enteredBackgroundAtRef.current
      );

      if (!navReady) {
        pendingResponseRef.current = response;
        pushDebug("queue: navigation not ready; stored pending response", {
          delivery,
          requestId: id,
          appState: appStateNow,
          sourceBucket: "unknown",
        });
        return;
      }

      if (wasAlreadyProcessed(id)) {
        pushDebug("skip: duplicate notification request (already navigated)", {
          delivery,
          requestId: id,
          appState: appStateNow,
          sourceBucket,
        });
        return;
      }

      if (__DEV__) {
        console.log("[push:nav] received notification data", {
          delivery,
          requestId: id,
          data: data ?? null,
          appState: appStateNow,
          sourceBucket,
        });
      }

      const path = getPathFromNotificationData(data);
      if (__DEV__) {
        console.log("[push:nav] parsed deep link path", {
          path,
          delivery,
          requestId: id,
          sourceBucket,
        });
      }

      if (!path) {
        pushDebug("skip: no route from payload (malformed or unsupported)", {
          delivery,
          requestId: id,
          sourceBucket,
        });
        rememberProcessedId(id);
        return;
      }

      const now = Date.now();
      const prevPush = lastPathPushRef.current;
      if (prevPush && prevPush.path === path && now - prevPush.at < SAME_PATH_DEBOUNCE_MS) {
        pushDebug("skip: rapid duplicate path (debounced)", {
          path,
          delivery,
          requestId: id,
          sourceBucket,
          debounceMs: SAME_PATH_DEBOUNCE_MS,
        });
        rememberProcessedId(id);
        return;
      }

      lastPathPushRef.current = { path, at: now };
      rememberProcessedId(id);

      if (__DEV__) {
        console.log("[push:nav] navigating", {
          path,
          delivery,
          requestId: id,
          sourceBucket,
        });
      }

      requestAnimationFrame(() => {
        router.push(path as Parameters<typeof router.push>[0]);
      });
    },
    [rememberProcessedId, wasAlreadyProcessed]
  );

  const devPushAlert = useCallback((title: string, body?: string) => {
    if (!__DEV__) return;
    requestAnimationFrame(() => {
      Alert.alert(title, body ?? "", [{ text: "OK", style: "default" }]);
    });
  }, []);

  const registerPushToken = useCallback(async () => {
    try {
      devPushAlert("PUSH INIT START", "registerPushToken running (see Metro [PUSH_INIT])");
      updatePushDiag({ step: "registerPushToken_start" });
      console.log("[PUSH_INIT] registerPushToken_start");
      logPushRuntimeEnvironment("[PUSH_INIT]");

      if (!Device.isDevice) {
        console.warn("[PUSH_INIT] skip: not a physical device (simulator)");
        updatePushDiag({ step: "skipped_simulator", isDevice: false });
        devPushAlert("PUSH STOP", "Simulator — no native Expo push token.");
        return null;
      }
      updatePushDiag({ isDevice: true });

      const projectId = getEasProjectIdForPush();
      const pluginOk = isExpoNotificationsPluginInConfig();
      console.log("[PUSH_INIT] config_checks", {
        easProjectIdPresent: !!projectId,
        expoNotificationsPluginInExpoConfig: pluginOk,
      });
      updatePushDiag({
        projectIdPresent: !!projectId,
        projectIdPreview: projectId ? `${projectId.slice(0, 8)}…` : null,
        notificationsPluginActive: pluginOk,
      });
      if (!projectId) {
        console.warn(
          "[PUSH_INIT] extra.eas.projectId missing — getExpoPushToken may fail; check app.json / app.config merge"
        );
      }

      console.log("[PUSH_TOKEN] getExpoPushTokenWithTimeout_start", {
        hasProjectId: !!projectId,
      });
      updatePushDiag({ step: "getExpoPushTokenWithTimeout_start" });

      const resolved = await getExpoPushTokenWithTimeout(projectId);
      if (!resolved.ok) {
        const msg = resolved.detail;
        console.error("[PUSH_TOKEN] getExpoPushToken_failed", resolved);
        updatePushDiag({ step: "token_resolve_failed", lastError: msg });
        devPushAlert("TOKEN SYNC FAILED", `${resolved.reason}\n${msg}`);
        return null;
      }

      const tokenStr = resolved.token;
      expoTokenPreviewRef.current =
        tokenStr.length > 56 ? `${tokenStr.slice(0, 28)}…${tokenStr.slice(-20)}` : tokenStr;
      console.log("[PUSH_TOKEN] token_resolved", {
        length: tokenStr.length,
        exponentPrefix: tokenStr.startsWith("ExponentPushToken["),
      });
      updatePushDiag({
        step: "token_resolved",
        expoTokenPreview:
          tokenStr.length > 48 ? `${tokenStr.slice(0, 32)}…${tokenStr.slice(-12)}` : tokenStr,
      });
      devPushAlert(
        "TOKEN RECEIVED",
        tokenStr.length > 180
          ? `${tokenStr.slice(0, 80)}…\n(${tokenStr.length} chars)`
          : tokenStr
      );

      if (__DEV__ && tokenStr) {
        console.log("[PUSH_TOKEN] full_token_dev_log", tokenStr);
        const preview =
          tokenStr.length > 96 ? `${tokenStr.slice(0, 48)}…${tokenStr.slice(-40)}` : tokenStr;
        Alert.alert(
          "Expo push token (DEV) — copy",
          `${preview}\n\nTap Copy for clipboard.`,
          [
            {
              text: "Copy token",
              onPress: () => {
                void Clipboard.setStringAsync(tokenStr).then(() => {
                  Alert.alert("Copied (DEV)", "Full Expo push token copied to clipboard.");
                });
              },
            },
            { text: "OK", style: "cancel" },
          ]
        );
      }

      const syncWithRetry = async () => {
        const max = 5;
        for (let i = 0; i < max; i++) {
          console.log(`[PUSH_SYNC] sync_attempt ${i + 1}/${max} (with token override)`);
          updatePushDiag({ step: `sync_attempt_${i + 1}` });
          const r = await syncDoctorExpoPushTokenWithBackend({
            expoPushTokenOverride: tokenStr,
          });
          logDoctorCleanPushSyncResult(r);
          if (r.ok) {
            devPushAlert("TOKEN SYNC SUCCESS", `Attempt ${i + 1}/${max}`);
            return r;
          }
          if (r.reason !== "no_jwt") {
            devPushAlert(
              "TOKEN SYNC FAILED",
              `${r.reason}\n${"detail" in r && r.detail ? r.detail : ""}`.trim()
            );
            return r;
          }
          console.log(
            `[PUSH_SYNC] no_jwt on attempt ${i + 1} — waiting 1500ms for session (root layout / login)`
          );
          await new Promise((res) => setTimeout(res, 1500));
        }
        const last = await syncDoctorExpoPushTokenWithBackend({
          expoPushTokenOverride: tokenStr,
        });
        logDoctorCleanPushSyncResult(last);
        if (!last.ok) {
          devPushAlert(
            "TOKEN SYNC FAILED",
            `${last.reason}\n${"detail" in last && last.detail ? last.detail : ""}`.trim()
          );
        } else {
          devPushAlert("TOKEN SYNC SUCCESS", "After JWT retry window");
        }
        return last;
      };

      await syncWithRetry();
      return tokenStr || null;
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      console.error("[PUSH_INIT] registerPushToken_uncaught", e);
      updatePushDiag({ step: "registerPushToken_throw", lastError: msg });
      devPushAlert("TOKEN SYNC FAILED", `Uncaught: ${msg}`);
      return null;
    }
  }, [devPushAlert]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (next === "background" || next === "inactive") {
        enteredBackgroundAtRef.current = Date.now();
      }
      if (__DEV__) {
        console.log("[push:nav] AppState change", { from: prev, to: next });
      }
      if (
        next === "active" &&
        Device.isDevice &&
        isDoctorForegroundPushResyncEnabled() &&
        Date.now() - lastDoctorPushForegroundResyncAt >= DOCTOR_FOREGROUND_PUSH_RESYNC_MS
      ) {
        lastDoctorPushForegroundResyncAt = Date.now();
        void syncDoctorExpoPushTokenWithBackend({}).then((r) => {
          const res = r;
          if (!res.ok || __DEV__) {
            console.log("[DOCTOR_PUSH] foreground_token_resync", {
              ok: res.ok,
              ...(!res.ok && "reason" in res ? { reason: res.reason } : {}),
            });
          }
          if (__DEV__) {
            logDoctorCleanPushSyncResult(res);
          }
        });
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        console.log("[PUSH_INIT] push_registration_effect_start");
        updatePushDiag({ step: "push_registration_effect_start" });
        await ensureAndroidDefaultChannel();

        console.log("[PUSH_INIT] permission_check_start");
        const { status: existing } = await Notifications.getPermissionsAsync();
        console.log("[PUSH_INIT] permission_existing", { status: existing });
        let finalStatus = existing;
        if (existing !== "granted") {
          console.log("[PUSH_INIT] permission_request_prompt");
          const req = await Notifications.requestPermissionsAsync({
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          });
          finalStatus = req.status;
        }
        console.log("[PUSH_INIT] permission_check_result", { finalStatus });
        updatePushDiag({ permissionStatus: finalStatus });
        await logIosNotificationPermissionSnapshot();

        if (cancelled) {
          console.log("[PUSH_INIT] cancelled_after_permission");
          return;
        }
        if (finalStatus !== "granted") {
          console.warn("[PUSH_INIT] permission_not_granted_abort", { finalStatus });
          if (__DEV__) {
            Alert.alert(
              "PUSH STOP",
              `Notifications permission not granted (status=${finalStatus}). Token registration skipped.`
            );
          }
          updatePushDiag({ step: "permission_not_granted", lastError: String(finalStatus) });
          return;
        }

        await registerPushToken();
      } catch (e) {
        console.error("[PUSH_INIT] push_registration_effect_throw", e);
        updatePushDiag({
          step: "push_registration_effect_throw",
          lastError: (e as Error)?.message || String(e),
        });
        if (__DEV__) {
          Alert.alert(
            "TOKEN SYNC FAILED",
            `push_registration_effect: ${(e as Error)?.message || String(e)}`
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [registerPushToken]);

  useEffect(() => {
    if (!rootNav?.key) return;

    let cancelled = false;

    const run = async () => {
      const pending = pendingResponseRef.current;
      if (pending) {
        pendingResponseRef.current = null;
        if (__DEV__) {
          console.log("[push:nav] flushing pending notification after nav ready", {
            requestId: getRequestId(pending),
          });
        }
        tryNavigateFromResponse(pending, "queued_flush");
      }

      if (coldStartLastFetchDoneRef.current) return;

      const last = await Notifications.getLastNotificationResponseAsync();
      if (cancelled) return;

      coldStartLastFetchDoneRef.current = true;

      if (!last?.notification?.request?.content?.data) return;

      const data = last.notification.request.content.data as Record<string, unknown>;
      if (!getPathFromNotificationData(data)) {
        await Notifications.clearLastNotificationResponseAsync();
        return;
      }

      tryNavigateFromResponse(last, "cold_start");
      await Notifications.clearLastNotificationResponseAsync();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [rootNav?.key, tryNavigateFromResponse]);

  useEffect(() => {
    receivedListener.current = Notifications.addNotificationReceivedListener((notification) => {
      if (!isDoctorPushDeliveryLogEnabled()) return;
      const trigger = notification.request.trigger;
      const isPush = trigger && typeof trigger === "object" && "type" in trigger && trigger.type === "push";
      const data = (notification.request.content.data ?? null) as Record<string, unknown> | null;
      const messageComposerRole =
        data && typeof data.messageComposerRole === "string" ? data.messageComposerRole : null;
      const routingPath =
        data && typeof data.routingPath === "string" ? data.routingPath : null;
      const appBucket = bucketDoctorPushAppState(appStateRef.current);
      console.log("[DOCTOR_PUSH] notification_received", {
        requestId: notification.request.identifier,
        appState: appStateRef.current,
        appStateBucket: appBucket,
        isPush,
        routingPath,
        messageComposerRole,
        dataType: data && typeof data.type === "string" ? data.type : null,
        expoTokenPreview: expoTokenPreviewRef.current,
        content: contentSummaryForDoctorPushLog(notification.request.content),
      });
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (isDoctorPushDeliveryLogEnabled()) {
          const d = response.notification.request.content.data as Record<string, unknown> | undefined;
          const appBucket = bucketDoctorPushAppState(appStateRef.current);
          const routingPath =
            d && typeof d.routingPath === "string" ? d.routingPath : null;
          console.log("[DOCTOR_PUSH] notification_response_received", {
            requestId: getRequestId(response),
            appState: appStateRef.current,
            appStateBucket: appBucket,
            actionIdentifier: response.actionIdentifier,
            routingPath,
            messageComposerRole:
              d && typeof d.messageComposerRole === "string" ? d.messageComposerRole : null,
            dataType: d && typeof d.type === "string" ? d.type : null,
            expoTokenPreview: expoTokenPreviewRef.current,
            content: contentSummaryForDoctorPushLog(response.notification.request.content),
          });
        }

        if (!navigationReadyRef.current) {
          pendingResponseRef.current = response;
          pushDebug("queue: response before root nav key; stored pending", {
            requestId: getRequestId(response),
            appState: appStateRef.current,
          });
          return;
        }

        tryNavigateFromResponse(response, "listener");
      },
    );

    return () => {
      receivedListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [tryNavigateFromResponse]);
}
