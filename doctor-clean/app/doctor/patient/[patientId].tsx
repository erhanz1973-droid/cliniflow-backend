import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { AiCoordinationBar } from "@/components/AiCoordinationBar";

export default function DoctorPatientWorkspace() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const id = Array.isArray(patientId) ? patientId[0] : patientId;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hasta çalışma alanı</Text>
      <Text style={styles.sub}>Canlı YZ koordinasyonu — klinik politikası üst sınırı aşmaz.</Text>
      {id ? (
        <AiCoordinationBar patientId={id} />
      ) : (
        <Text style={styles.muted}>Hasta kimliği yok.</Text>
      )}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>İnsan önceliği</Text>
        <Text style={styles.cardBody}>
          Kapalı: yalnızca insan. Destek: taslak / sınırlı operasyonel yanıt. Aktif: izin
          verilen koordinasyon görevleri. Acil durumda otomatik yanıtlar durur ve hekim bilgilendirilir.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 6, color: "#111827" },
  sub: { fontSize: 14, color: "#6b7280", marginBottom: 16, lineHeight: 20 },
  muted: { color: "#6b7280" },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", marginBottom: 6, color: "#111827" },
  cardBody: { fontSize: 13, color: "#4b5563", lineHeight: 19 },
});
