import { useEffect } from "react";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";

import { PushDiagDevBanner } from "@/components/PushDiagDevBanner";
import { PushNotificationBootstrap } from "@/components/PushNotificationBootstrap";
import { setAuthToken } from "@/lib/api";
import { logDoctorCleanStartupEnv } from "@/lib/logStartup";
import { getDoctorJwt } from "@/lib/session";
import { logExpoGoVsDevClientPushSoundOnce } from "@/lib/pushSoundRuntime";

logExpoGoVsDevClientPushSoundOnce();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

if (__DEV__) {
  console.log("[PUSH_SOUND] setNotificationHandler", {
    shouldPlaySound: true,
    shouldShowBanner: true,
    shouldShowAlert: true,
  });
}

export default function RootLayout() {
  useEffect(() => {
    void (async () => {
      try {
        __DEV__ && console.log("[PUSH_INIT] root_layout_session_restore_start");
        const jwt = await getDoctorJwt();
        setAuthToken(jwt);
        logDoctorCleanStartupEnv();
        __DEV__ &&
          console.log(
            "[PUSH_INIT] root_layout_skip_early_push_sync",
            "Token sync runs after notification permission in usePushNotifications (avoids no_expo_tokens from premature sync).",
          );
      } catch (e) {
        console.error("[PUSH_INIT] root_layout_session_restore_throw", e);
      }
    })();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <PushNotificationBootstrap />
      <PushDiagDevBanner />
    </>
  );
}
