// ProcedureModal Component - Production Ready UI
// Controlled modal for adding/editing procedures

import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { Procedure } from "../types/case";

interface ProcedureModalProps {
  visible: boolean;
  procedure: Procedure | null;
  onClose: () => void;
  onSave: (procedure: Procedure) => void;
}

export const ProcedureModal: React.FC<ProcedureModalProps> = ({ 
  visible, 
  procedure, 
  onClose, 
  onSave 
}) => {
  const [formData, setFormData] = useState<Procedure>({
    id: "",
    title: "",
    tooth: "",
    sessions: 1,
    price: 0,
    notes: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (procedure) {
      setFormData(procedure);
    } else {
      setFormData({
        id: crypto.randomUUID(),
        title: "",
        tooth: "",
        sessions: 1,
        price: 0,
        notes: "",
      });
    }
    setErrors({});
  }, [procedure, visible]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = "İşlem adı zorunludur";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    onSave(formData);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {procedure ? "İşlem Düzenle" : "Yeni İşlem"}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>İşlem Adı *</Text>
            <TextInput
              style={[styles.input, errors.title && styles.errorInput]}
              value={formData.title}
              onChangeText={(text) => setFormData({ ...formData, title: text })}
              placeholder="İşlem adını girin"
            />
            {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Diş</Text>
            <TextInput
              style={styles.input}
              value={formData.tooth || ""}
              onChangeText={(text) => setFormData({ ...formData, tooth: text })}
              placeholder="Diş numarası (örn: 11, 21)"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Seans Sayısı</Text>
            <TextInput
              style={styles.input}
              value={formData.sessions?.toString() || "1"}
              onChangeText={(text) => setFormData({ ...formData, sessions: parseInt(text) || 1 })}
              placeholder="Seans sayısı"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Ücret (₺)</Text>
            <TextInput
              style={styles.input}
              value={formData.price?.toString() || "0"}
              onChangeText={(text) => setFormData({ ...formData, price: parseFloat(text) || 0 })}
              placeholder="Ücret"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Notlar</Text>
            <TextInput
              style={styles.textArea}
              value={formData.notes || ""}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              placeholder="İşlem hakkında notlar"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>İptal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Kaydet</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  fieldContainer: {
    marginBottom: 20,
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
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  errorInput: {
    borderColor: "#dc2626",
  },
  textArea: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    marginTop: 4,
  },
  footer: {
    flexDirection: "row",
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
