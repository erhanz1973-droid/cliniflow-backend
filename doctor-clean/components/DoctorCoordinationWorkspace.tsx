import { useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { DoctorIntentPanel } from "@/components/DoctorIntentPanel";
import { InterventionControls } from "@/components/InterventionControls";
import { LiveConversationFeed } from "@/components/LiveConversationFeed";
import { PatientContextPanel } from "@/components/PatientContextPanel";
import { useCoordinationWorkspace } from "@/hooks/useCoordinationWorkspace";

type Props = {
  patientId: string;
};

export function DoctorCoordinationWorkspace({ patientId }: Props) {
  const intentRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 880;
  const { data, loading, error, refresh } = useCoordinationWorkspace(patientId);

  const scrollToIntent = () => {
    intentRef.current?.scrollToEnd({ animated: true });
  };

  if (loading && !data?.profile) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Canlı denetim alanı yükleniyor…</Text>
      </View>
    );
  }

  if (!data?.profile) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>AI Coordinator profili yok</Text>
        <Text style={styles.emptyBody}>
          Bu hasta henüz koordinasyon hattında değil. İlk mesaj veya başvuru sonrası canlı süpervizyon
          akışı burada görünür.
        </Text>
      </View>
    );
  }

  const feed =
    data.supervisionFeed || data.conversation || data.messages || [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Canlı süpervizyon</Text>
        <Pressable onPress={refresh} hitSlop={8}>
          <Text style={styles.refresh}>Yenile</Text>
        </Pressable>
      </View>

      <View style={[styles.columns, !isWide && styles.columnsStacked]}>
        <View style={[styles.leftColumn, !isWide && styles.leftColumnStacked]}>
          <PatientContextPanel
            profile={data.profile}
            aiState={data.aiState}
            leadHeat={data.leadHeat}
            strategy={data.currentStrategy}
          />
          {data.nextStep ? (
            <Text style={styles.nextStep}>→ {data.nextStep}</Text>
          ) : null}
        </View>

        <View style={[styles.centerColumn, !isWide && styles.centerColumnStacked]}>
          <View style={styles.feedCard}>
            <Text style={styles.feedTitle}>Canlı konuşma akışı</Text>
            <Text style={styles.feedSub}>
              Hasta · AI · doktor · taslaklar · sistem olayları — tek zaman çizelgesi
            </Text>
            <LiveConversationFeed
              turns={feed}
              patientName={data.profile.patientName}
              flex
            />
          </View>
        </View>

        <View style={[styles.rightColumn, !isWide && styles.rightColumnStacked]}>
          <InterventionControls
            patientId={patientId}
            aiState={data.aiState}
            onRefresh={refresh}
            onGuideAi={scrollToIntent}
          />
          <ScrollView
            ref={intentRef}
            style={styles.intentScroll}
            nestedScrollEnabled
            contentContainerStyle={styles.intentScrollContent}
          >
            <Text style={styles.intentTitle}>Klinik rehberlik</Text>
            <Text style={styles.intentSub}>
              İç not → AI genişletme → onay → hastaya gönder. Taslaklar akışta görünür.
            </Text>
            <DoctorIntentPanel patientId={patientId} />
          </ScrollView>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 12, paddingBottom: 12 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  refresh: { fontSize: 13, color: "#2563eb", fontWeight: "600" },
  columns: { flex: 1, flexDirection: "row", gap: 10, minHeight: 0 },
  columnsStacked: { flexDirection: "column" },
  leftColumn: { width: 200, gap: 8 },
  leftColumnStacked: { width: "100%" },
  centerColumn: { flex: 1, minWidth: 0 },
  centerColumnStacked: { flex: 0, minHeight: 440 },
  rightColumn: { width: 280, gap: 10, minHeight: 0 },
  rightColumnStacked: { width: "100%", flex: 0 },
  feedCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    minHeight: 420,
  },
  feedTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  feedSub: { fontSize: 11, color: "#6b7280", marginBottom: 8, marginTop: 2 },
  intentScroll: { flex: 1, maxHeight: 360 },
  intentScrollContent: { paddingBottom: 24 },
  intentTitle: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 4 },
  intentSub: { fontSize: 11, color: "#6b7280", marginBottom: 10, lineHeight: 16 },
  nextStep: { fontSize: 11, color: "#0369a1", marginTop: 4 },
  loading: { padding: 32, alignItems: "center", flex: 1 },
  loadingText: { marginTop: 12, color: "#6b7280", fontSize: 13 },
  emptyCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    margin: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 6 },
  emptyBody: { fontSize: 13, color: "#6b7280", lineHeight: 19 },
  error: { fontSize: 12, color: "#b91c1c", padding: 8 },
});
