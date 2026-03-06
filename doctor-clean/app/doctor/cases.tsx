import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Case } from "../../types/case";

// Mock cases data - replace with API call
const mockCases: Case[] = [
  {
    id: "case-123",
    patientName: "Mehmet Demir",
    primaryDoctorId: "doctor-123",
    diagnosisCode: "K02.1",
    diagnosisNote: "Çürük diş tedavisi",
    procedures: [
      {
        id: "proc-1",
        title: "Kanal Tedavisi",
        tooth: "21",
        sessions: 3,
        price: 2500,
      },
    ],
    status: "ACTIVE",
    escalated: false,
    updatedAt: "2024-02-25T18:30:00Z",
  },
  {
    id: "case-124",
    patientName: "Ayşe Yılmaz",
    primaryDoctorId: "doctor-123",
    diagnosisCode: "K04.7",
    diagnosisNote: "Diş eti iltihabı",
    procedures: [],
    status: "DRAFT",
    escalated: true,
    updatedAt: "2024-02-25T16:20:00Z",
  },
  {
    id: "case-125",
    patientName: "Can Kaya",
    primaryDoctorId: "doctor-456",
    diagnosisCode: "K03.6",
    diagnosisNote: "Diş kırığı",
    procedures: [
      {
        id: "proc-2",
        title: "Kron Kaplama",
        tooth: "12",
        sessions: 2,
        price: 1800,
      },
    ],
    status: "COMPLETED",
    escalated: false,
    updatedAt: "2024-02-24T14:15:00Z",
  },
];

export default function Cases() {
  const router = useRouter();

  const renderCaseCard = ({ item }: { item: Case }) => (
    <TouchableOpacity
      style={styles.caseCard}
      onPress={() => router.push(`/doctor/case/${item.id}`)}
    >
      <View style={styles.caseHeader}>
        <Text style={styles.patientName}>{item.patientName}</Text>
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) }
          ]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
          {item.escalated && (
            <View style={styles.escalatedBadge}>
              <Text style={styles.escalatedText}>Acil</Text>
            </View>
          )}
        </View>
      </View>
      
      <Text style={styles.diagnosis} numberOfLines={2}>
        {item.diagnosisCode} - {item.diagnosisNote}
      </Text>
      
      <View style={styles.caseFooter}>
        <Text style={styles.procedureCount}>
          {item.procedures.length} işlem
        </Text>
        <Text style={styles.updateTime}>
          {formatDate(item.updatedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const getStatusColor = (status: Case["status"]) => {
    switch (status) {
      case "DRAFT":
        return "#6b7280";
      case "ACTIVE":
        return "#2563eb";
      case "COMPLETED":
        return "#16a34a";
      default:
        return "#6b7280";
    }
  };

  const getStatusText = (status: Case["status"]) => {
    switch (status) {
      case "DRAFT":
        return "Taslak";
      case "ACTIVE":
        return "Aktif";
      case "COMPLETED":
        return "Tamamlandı";
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vakalar</Text>
      
      <FlatList
        data={mockCases}
        renderItem={renderCaseCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 20,
  },
  listContainer: {
    gap: 12,
  },
  caseCard: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  caseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  patientName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  statusContainer: {
    flexDirection: "row",
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  escalatedBadge: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  escalatedText: {
    fontSize: 9,
    fontWeight: "600",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  diagnosis: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
    lineHeight: 20,
  },
  caseFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  procedureCount: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  updateTime: {
    fontSize: 12,
    color: "#9ca3af",
  },
});
