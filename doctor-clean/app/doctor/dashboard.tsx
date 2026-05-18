import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { apiFetchJson } from "@/lib/api";
import { useScreenResource } from "@/hooks/use-screen-resource";

type MeResponse = {
  ok?: boolean;
  error?: string;
  doctor?: { email?: string; name?: string; clinic_code?: string };
};

export default function Dashboard() {
  const fetchMe = useCallback(
    () => apiFetchJson<MeResponse>("/api/doctor/me", { timeoutMs: 35_000 }),
    []
  );

  const { data: me, error, loading, refreshing, refresh } = useScreenResource(
    "doctor:me",
    fetchMe,
    { focusRefreshAfterMs: 90_000 }
  );

  const apiErr = me && !me.ok ? me.error || "Profil alınamadı" : null;
  const displayErr = error || apiErr;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Doctor Dashboard</Text>
      {loading && !me ? <ActivityIndicator color="#2563eb" /> : null}
      {displayErr ? <Text style={styles.error}>{displayErr}</Text> : null}
      {refreshing ? <Text style={styles.muted}>Arka planda güncelleniyor…</Text> : null}
      {me?.ok && me.doctor ? (
        <View style={styles.box}>
          <Text style={styles.row}>E-posta: {me.doctor.email ?? "—"}</Text>
          <Text style={styles.row}>Ad: {me.doctor.name ?? "—"}</Text>
          <Text style={styles.row}>Klinik kodu: {me.doctor.clinic_code ?? "—"}</Text>
        </View>
      ) : null}
      <Pressable style={styles.btn} onPress={refresh}>
        <Text style={styles.btnText}>Yenile (/api/doctor/me)</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.push("/doctor/patients")}>
        <Text style={styles.linkText}>Hastalar →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12, color: "#111827" },
  muted: { color: "#6b7280", marginBottom: 8, fontSize: 13 },
  error: { color: "#b91c1c", marginBottom: 8 },
  box: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  row: { fontSize: 15, color: "#374151", marginBottom: 6 },
  btn: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  btnText: { color: "#fff", fontWeight: "600" },
  link: { paddingVertical: 8 },
  linkText: { color: "#2563eb", fontWeight: "600" },
});
