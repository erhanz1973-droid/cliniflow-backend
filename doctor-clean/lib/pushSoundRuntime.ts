import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

let expoGoSoundNoticeLogged = false;

/**
 * Expo Go (`appOwnership === "expo"`) does not replicate full push + sound behavior.
 * Use a development build (`expo-dev-client`) for APNs-accurate audio.
 */
export function logExpoGoVsDevClientPushSoundOnce(): void {
  if (!__DEV__ || expoGoSoundNoticeLogged) return;
  expoGoSoundNoticeLogged = true;

  const appOwnership = Constants.appOwnership;
  const executionEnvironment = Constants.executionEnvironment;
  console.log("[PUSH_SOUND] runtime", { appOwnership, executionEnvironment });

  if (appOwnership === "expo") {
    console.warn(
      "[PUSH_SOUND] Running in Expo Go: notification UI may work but sound / background delivery " +
        "often does not match native builds (SDK 53+). For reliable push sound, use a development build: " +
        "`eas build --profile development --platform ios` then `npx expo start --dev-client`."
    );
  }
}

/** DEV: confirm Android channel `default` exists and carries default sound. */
export async function logAndroidDefaultChannelReadback(channelId: string): Promise<void> {
  if (!__DEV__ || Platform.OS !== "android") return;
  try {
    const ch = await Notifications.getNotificationChannelAsync(channelId);
    console.log("[PUSH_SOUND] android_channel_readback", {
      channelId,
      found: !!ch,
      importance: ch?.importance,
      sound: (ch as { sound?: string } | null)?.sound ?? null,
      name: ch?.name,
    });
  } catch (e) {
    console.warn("[PUSH_SOUND] android_channel_readback_failed", e);
  }
}

/** DEV: iOS permission snapshot (includes sound bit when available). */
export async function logIosNotificationPermissionSnapshot(): Promise<void> {
  if (!__DEV__ || Platform.OS !== "ios") return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    const ios = (perm as { ios?: Record<string, unknown> }).ios;
    console.log("[PUSH_SOUND] ios_permissions_snapshot", {
      status: perm.status,
      ios: ios ?? null,
    });
  } catch (e) {
    console.warn("[PUSH_SOUND] ios_permissions_snapshot_failed", e);
  }
}
