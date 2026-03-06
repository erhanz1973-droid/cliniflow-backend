// TreatmentSection Component - Production Ready UI
// Procedure cards with add/edit functionality

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Procedure, Case } from "../types/case";
import { ProcedureModal } from "./ProcedureModal";

interface TreatmentSectionProps {
  caseData: Case;
  authUserId: string;
  onProceduresUpdate: (procedures: Procedure[]) => void;
}

export const TreatmentSection: React.FC<TreatmentSectionProps> = ({ 
  caseData, 
  authUserId, 
  onProceduresUpdate 
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<Procedure | null>(null);

  const isEditable = caseData.primaryDoctorId === authUserId && caseData.status !== "COMPLETED";

  const handleAddProcedure = () => {
    setEditingProcedure(null);
    setModalVisible(true);
  };

  const handleEditProcedure = (procedure: Procedure) => {
    setEditingProcedure(procedure);
    setModalVisible(true);
  };

  const handleSaveProcedure = (procedure: Procedure) => {
    const updatedProcedures = editingProcedure
      ? caseData.procedures.map(p => p.id === procedure.id ? procedure : p)
      : [...caseData.procedures, procedure];
    
    onProceduresUpdate(updatedProcedures);
  };

  const ProcedureCard: React.FC<{ procedure: Procedure }> = ({ procedure }) => (
    <View style={styles.procedureCard}>
      <View style={styles.procedureHeader}>
        <Text style={styles.procedureTitle}>{procedure.title}</Text>
        {isEditable && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => handleEditProcedure(procedure)}
          >
            <Text style={styles.editButtonText}>Düzenle</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.procedureDetails}>
        {procedure.tooth && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Diş:</Text>
            <Text style={styles.detailValue}>{procedure.tooth}</Text>
          </View>
        )}
        
        {procedure.sessions && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Seans:</Text>
            <Text style={styles.detailValue}>{procedure.sessions}</Text>
          </View>
        )}
        
        {procedure.price !== undefined && procedure.price > 0 && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ücret:</Text>
            <Text style={styles.detailValue}>₺{procedure.price.toLocaleString()}</Text>
          </View>
        )}
      </View>
      
      {procedure.notes && (
        <Text style={styles.procedureNotes}>{procedure.notes}</Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tedavi Planı</Text>
        {isEditable && (
          <TouchableOpacity style={styles.addButton} onPress={handleAddProcedure}>
            <Text style={styles.addButtonText}>+ İşlem Ekle</Text>
          </TouchableOpacity>
        )}
      </View>

      {caseData.procedures.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Henüz işlem eklenmemiş</Text>
          {isEditable && (
            <TouchableOpacity style={styles.emptyAddButton} onPress={handleAddProcedure}>
              <Text style={styles.emptyAddButtonText}>İlk İşlemi Ekle</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.proceduresList}>
          {caseData.procedures.map((procedure) => (
            <ProcedureCard key={procedure.id} procedure={procedure} />
          ))}
        </View>
      )}

      <ProcedureModal
        visible={modalVisible}
        procedure={editingProcedure}
        onClose={() => setModalVisible(false)}
        onSave={handleSaveProcedure}
      />
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  addButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 16,
  },
  emptyAddButton: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  emptyAddButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  proceduresList: {
    gap: 12,
  },
  procedureCard: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 16,
  },
  procedureHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  procedureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  procedureDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  procedureNotes: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
    fontStyle: "italic",
  },
});
