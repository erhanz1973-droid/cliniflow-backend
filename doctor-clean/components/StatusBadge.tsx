// StatusBadge Component - Production Ready UI
// Clean, minimal status badges with color coding

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Case } from "../types/case";

interface StatusBadgeProps {
  status: Case["status"];
  escalated?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, escalated }) => {
  const getStatusColor = () => {
    switch (status) {
      case "DRAFT":
        return "#6b7280"; // Gray
      case "ACTIVE":
        return "#2563eb"; // Blue
      case "COMPLETED":
        return "#16a34a"; // Green
      default:
        return "#6b7280";
    }
  };

  const getStatusText = () => {
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

  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: getStatusColor() }]}>
        <Text style={styles.text}>{getStatusText()}</Text>
      </View>
      {escalated && (
        <View style={styles.escalatedBadge}>
          <Text style={styles.escalatedText}>Acil</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 80,
    alignItems: "center",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  escalatedBadge: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  escalatedText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
    textTransform: "uppercase",
  },
});
