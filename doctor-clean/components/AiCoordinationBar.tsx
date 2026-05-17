import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiFetchJson } from "@/lib/api";

type UiPreset = "OFF" | "ASSIST" | "ACTIVE";

type Delegation = {
  uiPreset?: UiPreset;
  statusLabel?: string;
  aiEscalationRequired?: boolean;
  cappedByClinicPolicy?: boolean;
};

type ClinicPolicy = {
  ceilingLabel?: string;
  ceilingMode?: string;
};

type CoordinationResponse = {
  ok?: boolean;
  profile?: {
    delegation?: Delegation;
    patientName?: string;
  } | null;
  delegation?: Delegation;
  clinicPolicy?: ClinicPolicy;
  error?: string;
  message?: string;
};

const PRESETS: { id: UiPreset; label: string }[] = [
  { id: "OFF", label: "Kapalı" },
  { id: "ASSIST", label: "Destek" },
  { id: "ACTIVE", label: "Aktif" },
];

type Props = {
  patientId: string;
};

export function AiCoordinationBar({ patientId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delegation, setDelegation] = useState<Delegation | null>(null);
  const [clinicPolicy, setClinicPolicy] = useState<ClinicPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetchJson<CoordinationResponse>(
        `/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
        { timeoutMs: 30_000 }
      );
      if (!json.ok) {
        setError(json.message || json.error || "Yüklenemedi");
        return;
      }
      setDelegation(json.profile?.delegation || null);
      setClinicPolicy(json.clinicPolicy || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      setError(null);
      try {
        const json = await apiFetchJson<CoordinationResponse>(
          `/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            timeoutMs: 30_000,
          }
        );
        if (!json.ok) {
          setError(json.message || json.error || "Kaydedilemedi");
          return;
        }
        setDelegation(json.delegation || json.profile?.delegation || null);
        if (json.clinicPolicy) setClinicPolicy(json.clinicPolicy);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi");
      } finally {
        setSaving(false);
      }
    },
    [patientId]
  );

  const current = delegation?.uiPreset || "ASSIST";
  const escalated = delegation?.aiEscalationRequired === true;

  if (loading && !delegation) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator size="small" color="#2563eb" />
      </View>
    );
  }

  if (!delegation && !loading) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.muted}>Bu hasta için YZ koordinasyon profili yok.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Canlı YZ koordinasyonu</Text>
      <Text style={styles.status}>{delegation?.statusLabel || "—"}</Text>
      <View style={styles.row}>
        {PRESETS.map((p) => {
          const active = current === p.id;
          const disabled =
            saving ||
            (escalated && p.id !== "OFF") ||
            (p.id === "ACTIVE" &&
              (clinicPolicy?.ceilingMode === "HUMAN_ONLY" ||
                clinicPolicy?.ceilingMode === "AI_DRAFT"));
          return (
            <Pressable
              key={p.id}
              style={[styles.btn, active && styles.btnActive, disabled && styles.btnDisabled]}
              disabled={disabled}
              onPress={() => patch({ uiPreset: p.id })}
            >
              <Text style={[styles.btnText, active && styles.btnTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          disabled={saving}
          onPress={() => patch({ pauseAi: true })}
        >
          <Text style={styles.actionText}>YZ duraklat</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionWarn]}
          disabled={saving}
          onPress={() => patch({ requireDoctorReview: true })}
        >
          <Text style={styles.actionText}>İnceleme gerekli</Text>
        </Pressable>
        {escalated ? (
          <Pressable
            style={styles.actionBtn}
            disabled={saving}
            onPress={() => patch({ uiPreset: "ASSIST", clearEscalation: true })}
          >
            <Text style={styles.actionText}>İncelendi — devam</Text>
          </Pressable>
        ) : null}
      </View>
      {clinicPolicy?.ceilingLabel ? (
        <Text style={styles.hint}>Klinik üst sınır: {clinicPolicy.ceilingLabel}</Text>
      ) : null}
      {delegation?.cappedByClinicPolicy ? (
        <Text style={styles.warn}>Klinik politikası nedeniyle mod sınırlandı.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
    marginBottom: 16,
  },
  title: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 4 },
  status: { fontSize: 12, color: "#6b7280", marginBottom: 10 },
  row: { flexDirection: "row", gap: 8, marginBottom: 10 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },
  btnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  btnTextActive: { color: "#fff" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#64748b",
  },
  actionWarn: { backgroundColor: "#b45309" },
  actionText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  hint: { marginTop: 8, fontSize: 11, color: "#6b7280" },
  warn: { marginTop: 4, fontSize: 11, color: "#b45309" },
  muted: { fontSize: 13, color: "#6b7280" },
  error: { marginTop: 8, fontSize: 12, color: "#b91c1c" },
});
