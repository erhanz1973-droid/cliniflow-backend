import * as Linking from "expo-linking";

/**
 * Expo Push / FCM `data` for message notifications.
 * Contract: every value in `data` MUST be a string (Expo Push + APNs userInfo).
 * Sound: set `sound: "default"` on the Expo Push message root, or APNs `aps.sound` = `"default"`.
 * Android: send `channelId: "default"` on the Expo Push root for Android 8+.
 */
export type MessageNotificationData = Record<string, string>;

/** Must match `expo.scheme` in app.json. */
const SCHEME = "doctorclean";

function firstStringField(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const v = data[key];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) return t;
  }
  return "";
}

function queryStringFromParams(params: Record<string, unknown> | null | undefined): string {
  if (!params || typeof params !== "object") return "";
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.length > 0) flat[k] = v;
  }
  const qs = new URLSearchParams(flat).toString();
  return qs ? `?${qs}` : "";
}

/**
 * Parses push `data` into an in-app path for expo-router.
 * - `threadId` (or legacy `thread_id`) → `/doctor/chat/<threadId>`
 * - `url` → `doctorclean://...` path, or other URLs with string-only query params
 * - `caseId` (or legacy `case_id`) → `/doctor/case/<caseId>`
 *
 * Non-string values for these keys are ignored (backend should send strings only).
 */
export function getPathFromNotificationData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data || typeof data !== "object") return null;

  const url = firstStringField(data, ["url"]);
  if (url) {
    try {
      if (url.startsWith(`${SCHEME}://`)) {
        const rest = url.slice(`${SCHEME}://`.length);
        if (rest.length > 2048) return null;
        const pathPart = rest.includes("/") ? rest.slice(rest.indexOf("/")) : `/${rest}`;
        return pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
      }
      const parsed = Linking.parse(url);
      if (parsed.path) {
        const path = parsed.path.startsWith("/") ? parsed.path : `/${parsed.path}`;
        const qs = queryStringFromParams(
          parsed.queryParams as Record<string, unknown> | null | undefined
        );
        return `${path}${qs}` || null;
      }
    } catch {
      return null;
    }
  }

  const threadId = firstStringField(data, ["threadId", "thread_id"]);
  if (threadId) return `/doctor/chat/${encodeURIComponent(threadId)}`;

  const caseId = firstStringField(data, ["caseId", "case_id"]);
  if (caseId) return `/doctor/case/${encodeURIComponent(caseId)}`;

  return null;
}
