import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { getDoctorJwt } from "@/lib/session";

void SplashScreen.preventAutoHideAsync();

export default function Index() {
  const [target, setTarget] = useState<"/login" | "/doctor/dashboard" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const jwt = await getDoctorJwt();
        if (!cancelled) setTarget(jwt ? "/doctor/dashboard" : "/login");
      } finally {
        if (!cancelled) await SplashScreen.hideAsync();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) return null;
  return <Redirect href={target} />;
}
