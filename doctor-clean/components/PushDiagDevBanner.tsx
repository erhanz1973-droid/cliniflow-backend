import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { getPushDiagState, subscribePushDiag } from "@/lib/pushDiagnostics";

/**
 * DEV-only on-screen push pipeline state (search logs: [PUSH_INIT] [PUSH_TOKEN] [PUSH_SYNC]).
 */
export function PushDiagDevBanner() {
  const [snap, setSnap] = useState(getPushDiagState);

  useEffect(() => subscribePushDiag(() => setSnap(getPushDiagState())), []);

  if (!__DEV__) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Text style={styles.title}>[PUSH] DEV banner</Text>
      <ScrollView style={styles.scroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        <Text style={styles.mono} selectable>
          {`step: ${snap.step}\n`}
          {`isDevice: ${String(snap.isDevice)}\n`}
          {`projectId: ${snap.projectIdPresent ? snap.projectIdPreview ?? "yes" : "MISSING"}\n`}
          {`expo-notifications plugin: ${
            snap.notificationsPluginActive == null ? "?" : String(snap.notificationsPluginActive)
          }\n`}
          {`permission: ${snap.permissionStatus ?? "—"}\n`}
          {`token: ${snap.expoTokenPreview ?? "—"}\n`}
          {`syncOk: ${snap.lastSyncOk == null ? "—" : String(snap.lastSyncOk)}\n`}
          {`syncReason: ${snap.lastSyncReason ?? "—"}\n`}
          {snap.lastError ? `err: ${snap.lastError}\n` : ""}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 28,
    maxHeight: 140,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.78)",
    zIndex: 9999,
  },
  title: { color: "#fbbf24", fontSize: 11, fontWeight: "700", marginBottom: 4 },
  scroll: { maxHeight: 110 },
  mono: { color: "#e5e7eb", fontSize: 10 },
});
