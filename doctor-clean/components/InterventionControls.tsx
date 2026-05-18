import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetchJson } from "@/lib/api";
import type { AiState } from "@/lib/coordinationWorkspaceTypes";

type ResponderMode = "AI_ACTIVE" | "HUMAN_ACTIVE" | "HYBRID" | "ESCALATED";

type Props = {
  patientId: string;
  aiState?: AiState;
  onRefresh: () => void;
  onGuideAi: () => void;
};

export function InterventionControls({
  patientId,
  aiState,
  onRefresh,
  onGuideAi,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      setError(null);
      try {
        const json = await apiFetchJson<{ ok?: boolean; message?: string; error?: string }>(
          `/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            timeoutMs: 30_000,
          },
        );
        if (!json.ok) throw new Error(json.message || json.error || "Kaydedilemedi");
        await onRefresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi");
      } finally {
        setSaving(false);
      }
    },
    [patientId, onRefresh],
  );

  const suggestRewrite = useCallback(async () => {
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

  const escalated = aiState?.aiEscalationRequired;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>👨‍⚕️ Doktor müdahalesi</Text>
      <View style={styles.row}>
        <ActionBtn
          label="AI duraklat"
          onPress={() => patch({ pauseAi: true })}
          disabled={saving}
          variant="secondary"
        />
        <ActionBtn
          label="Yeniden yaz"
          onPress={suggestRewrite}
          disabled={drafting || saving}
          variant="secondary"
        />
        <ActionBtn
          label="Devral"
          onPress={() => patch({ action: "takeOver" })}
          disabled={saving}
          variant="primary"
        />
        <ActionBtn label="AI'ye rehberlik" onPress={onGuideAi} disabled={saving} variant="guide" />
        <ActionBtn
          label="AI devam"
          onPress={() => patch({ action: "resumeAi", clearEscalation: true })}
          disabled={saving || escalated}
          variant="muted"
        />
      </View>

      <TextInput
        style={styles.draftInput}
        multiline
        placeholder="Manuel yanıt veya AI taslağı — Gönder için Intent Panel'i kullanın"
        value={draft}
        onChangeText={setDraft}
      />
      {draft ? (
        <Pressable style={styles.guideLink} onPress={onGuideAi}>
          <Text style={styles.guideLinkText}>Taslağı Intent Panel'de düzenle ve gönder →</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(saving || drafting) && <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 8 }} />}
    </View>
  );
}

function ActionBtn({
  label,
  onPress,
  disabled,
  variant,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary" | "guide" | "muted";
}) {
  const bg =
    variant === "primary"
      ? "#2563eb"
      : variant === "guide"
        ? "#7c3aed"
        : variant === "muted"
          ? "#9ca3af"
          : "#64748b";
  return (
    <Pressable
      style={[styles.btn, { backgroundColor: bg }, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
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
  title: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  draftInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    minHeight: 64,
    fontSize: 14,
    textAlignVertical: "top",
  },
  guideLink: { marginTop: 8 },
  guideLinkText: { fontSize: 12, color: "#7c3aed", fontWeight: "600" },
  error: { marginTop: 8, fontSize: 12, color: "#b91c1c" },
});
