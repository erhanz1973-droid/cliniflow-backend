// DiagnosisSection Component - Production Ready UI
// Editable diagnosis fields with role control

import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { Case } from "../types/case";

interface DiagnosisSectionProps {
  caseData: Case;
  authUserId: string;
  onUpdate: (updates: Partial<Case>) => void;
}

export const DiagnosisSection: React.FC<DiagnosisSectionProps> = ({ 
  caseData, 
  authUserId, 
  onUpdate 
}) => {
  const isEditable = caseData.primaryDoctorId === authUserId && caseData.status !== "COMPLETED";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tanı</Text>
      
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>ICD-10 Kodu</Text>
        <TextInput
          style={[
            styles.input,
            !isEditable && styles.disabledInput
          ]}
          value={caseData.diagnosisCode || ""}
          onChangeText={(text) => onUpdate({ diagnosisCode: text })}
          placeholder="ICD-10 kodunu girin"
          editable={isEditable}
        />
      </View>

      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Tanı Notları</Text>
        <TextInput
          style={[
            styles.textArea,
            !isEditable && styles.disabledInput
          ]}
          value={caseData.diagnosisNote || ""}
          onChangeText={(text) => onUpdate({ diagnosisNote: text })}
          placeholder="Detaylı tanı bilgilerini girin"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={isEditable}
        />
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
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
  },
  textArea: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    minHeight: 100,
  },
  disabledInput: {
    backgroundColor: "#f3f4f6",
    color: "#6b7280",
  },
});
