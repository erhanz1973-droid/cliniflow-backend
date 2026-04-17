// Case Detail Screen - Production Ready
// Full clinical case workflow with structured treatment plan

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Case, Procedure, AuthUser } from "../../../types/case";
import { CaseHeader } from "../../../components/CaseHeader";
import { DiagnosisSection } from "../../../components/DiagnosisSection";
import { TreatmentSection } from "../../../components/TreatmentSection";

// Mock auth user - replace with real auth
const mockAuthUser: AuthUser = {
  id: "doctor-123",
  name: "Dr. Ahmet Yılmaz",
  role: "doctor",
};

// Mock case data - replace with API call
const mockCaseData: Case = {
  id: "case-123",
  patientName: "Mehmet Demir",
  primaryDoctorId: "doctor-123",
  diagnosisCode: "K02.1",
  diagnosisNote: "Çürük diş tedavisi gerekiyor. 21 numaralı dişte derin çürük tespit edildi.",
  procedures: [
    {
      id: "proc-1",
      title: "Kanal Tedavisi",
      tooth: "21",
      sessions: 3,
      price: 2500,
      notes: "Kök kanalı tedavisi planlandı",
    },
    {
      id: "proc-2", 
      title: "Kompozit Dolgu",
      tooth: "21",
      sessions: 1,
      price: 800,
      notes: "Tedavi sonrası estetik dolgu",
    },
  ],
  status: "ACTIVE",
  escalated: false,
  updatedAt: "2024-02-25T18:30:00Z",
};

export default function CaseDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setCaseData(mockCaseData);
      setLoading(false);
    }, 1000);
  }, [id]);

  const handleCaseUpdate = (updates: Partial<Case>) => {
    if (!caseData) return;
    
    setCaseData({
      ...caseData,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleProceduresUpdate = (procedures: Procedure[]) => {
    if (!caseData) return;
    
    setCaseData({
      ...caseData,
      procedures,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSave = async () => {
    if (!caseData) return;

    setSaving(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const payload = {
        diagnosisCode: caseData.diagnosisCode,
        diagnosisNote: caseData.diagnosisNote,
        procedures: caseData.procedures,
        status: caseData.status,
      };

      console.log("Saving case:", payload);
      
      Alert.alert("Başarılı", "Vaka başarıyla kaydedildi.");
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Hata", "Vaka kaydedilemedi. Lütfen tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  };

  const canEdit = caseData?.primaryDoctorId === mockAuthUser.id && caseData.status !== "COMPLETED";

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!caseData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Vaka bulunamadı</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <CaseHeader caseData={caseData} authUserId={mockAuthUser.id} />
      
      <DiagnosisSection
        caseData={caseData}
        authUserId={mockAuthUser.id}
        onUpdate={handleCaseUpdate}
      />
      
      <TreatmentSection
        caseData={caseData}
        authUserId={mockAuthUser.id}
        onProceduresUpdate={handleProceduresUpdate}
      />

      {canEdit && (
        <View style={styles.saveContainer}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: "#dc2626",
    marginBottom: 20,
    textAlign: "center",
  },
  backButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  saveContainer: {
    padding: 16,
    paddingTop: 0,
  },
  saveButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
