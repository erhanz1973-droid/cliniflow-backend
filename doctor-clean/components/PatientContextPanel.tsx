import { StyleSheet, Text, View } from "react-native";

import type { AiState, CurrentStrategy, LeadHeat, WorkspaceProfile } from "@/lib/coordinationWorkspaceTypes";

const CONTEXT_LABELS: Record<string, string> = {
  local_patient: "Yerel hasta",
  domestic_traveler: "Yurt içi seyahat",
  international_patient: "Uluslararası",
};

type Props = {
  profile?: WorkspaceProfile | null;
  aiState?: AiState;
  leadHeat?: LeadHeat;
  strategy?: CurrentStrategy;
};

export function PatientContextPanel({ profile, aiState, leadHeat, strategy }: Props) {
  const heatColor = leadHeat?.isHot
    ? "#dc2626"
    : (leadHeat?.score ?? 0) >= 60
      ? "#d97706"
      : "#6b7280";

  return (
    <View style={styles.wrap}>
      <Text style={styles.patientName}>{profile?.patientName || "Hasta"}</Text>
      {profile?.treatmentInterest ? (
        <Text style={styles.line}>İlgi: {profile.treatmentInterest}</Text>
      ) : null}
      {profile?.country ? <Text style={styles.line}>Ülke: {profile.country}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lead sıcaklığı</Text>
        <Text style={[styles.heat, { color: heatColor }]}>
          {leadHeat?.label || "—"}
          {leadHeat?.score != null ? ` · ${leadHeat.score}` : ""}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI modu</Text>
        <Text style={styles.value}>
          {aiState?.responderModeLabel || aiState?.coordinationMode || "—"}
        </Text>
        {aiState?.handlingStateLabel ? (
          <Text style={styles.sub}>{aiState.handlingStateLabel}</Text>
        ) : null}
        {aiState?.aiPaused ? <Badge label="AI duraklatıldı" tone="warn" /> : null}
        {aiState?.aiEscalationRequired ? <Badge label="Escalation" tone="danger" /> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Strateji</Text>
        <Text style={styles.value}>
          {CONTEXT_LABELS[strategy?.patientContextClass || ""] ||
            strategy?.patientContextClass ||
            "—"}
        </Text>
        {strategy?.journeyStageLabel ? (
          <Text style={styles.sub}>{strategy.journeyStageLabel}</Text>
        ) : null}
        {strategy?.readinessPercent != null ? (
          <Text style={styles.sub}>Hazırlık: %{strategy.readinessPercent}</Text>
        ) : null}
      </View>

      {strategy?.blockingReason ? (
        <View style={styles.alert}>
          <Text style={styles.alertText}>{strategy.blockingReason}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: "warn" | "danger" }) {
  const bg = tone === "danger" ? "#fef2f2" : "#fffbeb";
  const color = tone === "danger" ? "#b91c1c" : "#b45309";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  patientName: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 6 },
  line: { fontSize: 12, color: "#4b5563", marginBottom: 2 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#9ca3af",
    marginBottom: 4,
  },
  heat: { fontSize: 18, fontWeight: "700" },
  value: { fontSize: 13, fontWeight: "600", color: "#111827" },
  sub: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  badge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginTop: 6 },
  badgeText: { fontSize: 10, fontWeight: "600" },
  alert: {
    marginTop: 12,
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  alertText: { fontSize: 11, color: "#92400e" },
});
