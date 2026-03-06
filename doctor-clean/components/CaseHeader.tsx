// CaseHeader Component - Production Ready UI
// Clean header with patient info and status

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Case } from "../types/case";
import { StatusBadge } from "./StatusBadge";

interface CaseHeaderProps {
  caseData: Case;
  authUserId: string;
}

export const CaseHeader: React.FC<CaseHeaderProps> = ({ caseData, authUserId }) => {
  const isPrimaryDoctor = caseData.primaryDoctorId === authUserId;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.patientName}>{caseData.patientName}</Text>
        <StatusBadge status={caseData.status} escalated={caseData.escalated} />
      </View>
      
      <View style={styles.bottomRow}>
        <Text style={styles.doctorLabel}>
          Sorumlu Doktor: {isPrimaryDoctor ? "Siz" : "Diğer"}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  patientName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  doctorLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
});
