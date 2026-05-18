import { usePushNotifications } from "@/hooks/use-push-notifications";

/** Isolates push registration/listeners from root layout re-renders. */
export function PushNotificationBootstrap() {
  usePushNotifications();
  return null;
}
