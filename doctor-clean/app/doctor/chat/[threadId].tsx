import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { apiFetchJson } from "@/lib/api";
import { useScreenResource } from "@/hooks/use-screen-resource";

type ThreadSummaryResponse = {
  ok?: boolean;
  threads?: unknown[];
  error?: string;
};

export default function DoctorChatThread() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const id = Array.isArray(threadId) ? threadId[0] : threadId;

  const fetchSummary = useCallback(async () => {
    return apiFetchJson<ThreadSummaryResponse>(
      "/api/doctor/messages/thread-summary",
      { timeoutMs: 55_000 }
    );
  }, []);

  const { data, error, loading } = useScreenResource("doctor:thread-summary", fetchSummary, {
    focusRefreshAfterMs: 30_000,
  });

  const summary = useMemo(() => {
    if (!data) return null;
    if (!data.ok) return { n: 0, err: data.error || "Özet alınamadı" };
    const n = Array.isArray(data.threads) ? data.threads.length : 0;
    return { n };
  }, [data]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sohbet</Text>
      <Text style={styles.row}>Thread ID: {id ?? "—"}</Text>
      <Text style={styles.hint}>
        Üretim: bildirimdeki `threadId` = `patient_chat_threads.id`. Özet arka planda yenilenir;
        geri dönüşte önbellek anında gösterilir.
      </Text>
      {loading && !summary ? <Text style={styles.muted}>Yükleniyor…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {summary?.err ? <Text style={styles.error}>{summary.err}</Text> : null}
      {summary && !summary.err ? (
        <Text style={styles.row}>Görünür sohbet satırları: {summary.n}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 10, color: "#111827" },
  row: { fontSize: 16, color: "#374151", marginBottom: 8 },
  hint: { fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 18 },
  muted: { color: "#6b7280", marginBottom: 8 },
  error: { color: "#b91c1c" },
});
