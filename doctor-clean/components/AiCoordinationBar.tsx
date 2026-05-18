import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetchJson } from "@/lib/api";

type ResponderMode = "AI_ACTIVE" | "HUMAN_ACTIVE" | "HYBRID" | "ESCALATED";

type WorkspaceProfile = {
  patientName?: string;
  responderMode?: ResponderMode;
  responderModeLabel?: string;
  primaryResponderLabel?: string;
  handlingStateLabel?: string;
  conversationSummary?: string;
  blockingReason?: string | null;
  nextAction?: string | null;
  delegation?: {
    statusLabel?: string;
    draftGenerationAllowed?: boolean;
    autoReplyAllowed?: boolean;
    aiEscalationRequired?: boolean;
  };
};

type WorkspaceResponse = {
  ok?: boolean;
  profile?: WorkspaceProfile | null;
  latestAiReply?: string | null;
  latestPatientMessage?: string | null;
  blocker?: string | null;
  nextStep?: string | null;
  timeline?: { label?: string; createdAt?: string }[];
  error?: string;
  message?: string;
};

type PatchResponse = {
  ok?: boolean;
  delegation?: WorkspaceProfile["delegation"];
  responderMode?: ResponderMode;
  responderModeLabel?: string;
  error?: string;
  message?: string;
};

const MODES: { id: ResponderMode; label: string }[] = [
  { id: "AI_ACTIVE", label: "AI Coordinator" },
  { id: "HYBRID", label: "Hybrid" },
  { id: "HUMAN_ACTIVE", label: "Human" },
  { id: "ESCALATED", label: "Escalated" },
];

type Props = {
  patientId: string;
};

export function AiCoordinationBar({ patientId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [latestAi, setLatestAi] = useState<string | null>(null);
  const [latestPatient, setLatestPatient] = useState<string | null>(null);
  const [blocker, setBlocker] = useState<string | null>(null);
  const [nextStep, setNextStep] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiFetchJson<WorkspaceResponse>(
        `/api/doctor/patients/${encodeURIComponent(patientId)}/coordination-workspace`,
        { timeoutMs: 30_000 },
      );
      if (!json.ok) {
        setError(json.message || json.error || "Yüklenemedi");
        return;
      }
      setProfile(json.profile || null);
      setLatestAi(json.latestAiReply || null);
      setLatestPatient(json.latestPatientMessage || null);
      setBlocker(json.blocker || json.profile?.blockingReason || null);
      setNextStep(json.nextStep || json.profile?.nextAction || null);
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
        const json = await apiFetchJson<PatchResponse>(
          `/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            timeoutMs: 30_000,
          },
        );
        if (!json.ok) {
          setError(json.message || json.error || "Kaydedilemedi");
          return;
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi");
      } finally {
        setSaving(false);
      }
    },
    [patientId, load],
  );

  const generateDraft = useCallback(async () => {
    setDrafting(true);
    setError(null);
    try {
      const json = await apiFetchJson<{ ok?: boolean; suggestedReply?: string; message?: string }>(
        `/api/doctor/patients/${encodeURIComponent(patientId)}/suggest-reply`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", timeoutMs: 45_000 },
      );
      if (!json.ok) throw new Error(json.message || "Taslak oluşturulamadı");
      setDraft(json.suggestedReply || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Taslak oluşturulamadı");
    } finally {
      setDrafting(false);
    }
  }, [patientId]);

  const mode = profile?.responderMode || "HYBRID";
  const escalated = mode === "ESCALATED" || profile?.delegation?.aiEscalationRequired;

  if (loading && !profile) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator size="small" color="#2563eb" />
      </View>
    );
  }

  if (!profile && !loading) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.muted}>Bu hasta için AI Coordinator profili yok.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>AI Coordinator — canlı görünürlük</Text>
      <Text style={styles.status}>
        {profile?.primaryResponderLabel || "AI Coordinator"} · {profile?.responderModeLabel || profile?.delegation?.statusLabel}
      </Text>
      {profile?.handlingStateLabel ? (
        <Text style={styles.hint}>Durum: {profile.handlingStateLabel}</Text>
      ) : null}

      {latestPatient ? (
        <View style={styles.msgBox}>
          <Text style={styles.msgLabel}>Son hasta mesajı</Text>
          <Text style={styles.msgText}>{latestPatient}</Text>
        </View>
      ) : null}
      {latestAi ? (
        <View style={[styles.msgBox, styles.msgAi]}>
          <Text style={styles.msgLabel}>Son AI yanıtı</Text>
          <Text style={styles.msgText}>{latestAi}</Text>
        </View>
      ) : null}

      {blocker ? <Text style={styles.warn}>Engel: {blocker}</Text> : null}
      {nextStep ? <Text style={styles.hint}>Sonraki adım: {nextStep}</Text> : null}

      <View style={styles.row}>
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <Pressable
              key={m.id}
              style={[styles.btn, active && styles.btnActive, saving && styles.btnDisabled]}
              disabled={saving}
              onPress={() => patch({ responderMode: m.id })}
            >
              <Text style={[styles.btnText, active && styles.btnTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} disabled={saving} onPress={() => patch({ action: "takeOver" })}>
          <Text style={styles.actionText}>Devral</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} disabled={saving} onPress={() => patch({ pauseAi: true })}>
          <Text style={styles.actionText}>AI duraklat</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          disabled={saving || escalated}
          onPress={() => patch({ action: "resumeAi", clearEscalation: true })}
        >
          <Text style={styles.actionText}>AI devam</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} disabled={drafting} onPress={generateDraft}>
          <Text style={styles.actionText}>{drafting ? "…" : "AI taslak"}</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.draftInput}
        multiline
        placeholder="Manuel yanıt veya AI taslağı…"
        value={draft}
        onChangeText={setDraft}
      />
      <Text style={styles.hint}>
        Klinik ekibiniz bilgileri inceler; belirli bir hekimin görüntü incelemesi yapıldığı iddia edilmez.
      </Text>

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
  status: { fontSize: 12, color: "#374151", marginBottom: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 10 },
  btn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  btnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 11, fontWeight: "600", color: "#374151" },
  btnTextActive: { color: "#fff" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#64748b",
  },
  actionText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  msgBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  msgAi: { backgroundColor: "#eff6ff" },
  msgLabel: { fontSize: 10, fontWeight: "700", color: "#6b7280", marginBottom: 4 },
  msgText: { fontSize: 13, color: "#111827" },
  draftInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    minHeight: 72,
    fontSize: 14,
    textAlignVertical: "top",
  },
  hint: { marginTop: 6, fontSize: 11, color: "#6b7280" },
  warn: { fontSize: 12, color: "#b45309", marginBottom: 4 },
  muted: { fontSize: 13, color: "#6b7280" },
  error: { marginTop: 8, fontSize: 12, color: "#b91c1c" },
});
