import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetchJson } from "@/lib/api";
import {
  expandClinicalGuidance,
  fetchIntentTags,
  rewriteClinicalDraft,
  sendClinicalGuidance,
  type IntentTag,
  type RewriteAction,
} from "@/lib/clinicalGuidanceApi";

const REWRITE_ACTIONS: { id: RewriteAction; label: string }[] = [
  { id: "shorter", label: "Kısa" },
  { id: "simpler", label: "Basit" },
  { id: "more_empathetic", label: "Empatik" },
  { id: "more_professional", label: "Profesyonel" },
  { id: "reassure_patient", label: "Güven ver" },
  { id: "more_concise", label: "Öz" },
];

const TAG_LABELS: Record<string, string> = {
  reassure_patient: "Güven",
  explain_process: "Süreç",
  request_xray: "Röntgen",
  request_cbct: "CBCT",
  explain_timeline: "Zaman çizelgesi",
  discuss_pricing: "Fiyat",
  reduce_anxiety: "Kaygı",
  encourage_consultation: "Konsültasyon",
  collect_patient_info: "Bilgi topla",
  schedule_visit: "Ziyaret",
};

type Props = {
  patientId: string;
};

export function DoctorIntentPanel({ patientId }: Props) {
  const [expansionAllowed, setExpansionAllowed] = useState(true);
  const [intentTags, setIntentTags] = useState<IntentTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<IntentTag[]>([]);
  const [intentText, setIntentText] = useState("");
  const [patientDraft, setPatientDraft] = useState("");
  const [guidanceId, setGuidanceId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntentTags()
      .then(setIntentTags)
      .catch(() => setIntentTags([]));
  }, []);

  useEffect(() => {
    if (!patientId) return;
    apiFetchJson<{
      ok?: boolean;
      profile?: { delegation?: { draftGenerationAllowed?: boolean } };
    }>(`/api/doctor/patients/${patientId}/ai-coordination`, { timeoutMs: 20_000 })
      .then((res) => {
        const allowed = res.profile?.delegation?.draftGenerationAllowed !== false;
        setExpansionAllowed(allowed);
        if (!allowed) setError("YZ genişletme bu başvuruda kapalı (yalnızca insan modu).");
      })
      .catch(() => setExpansionAllowed(true));
  }, [patientId]);

  const toggleTag = (tag: IntentTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const onExpand = useCallback(async () => {
    if (!patientId || !intentText.trim()) {
      setError("Klinik notu gerekli.");
      return;
    }
    if (!expansionAllowed) {
      setError("Bu başvuruda YZ genişletme kapalı (yalnızca insan modu).");
      return;
    }
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const res = await expandClinicalGuidance({
        patientId,
        intentText: intentText.trim(),
        intentTags: selectedTags,
        guidanceId: guidanceId || undefined,
      });
      if (!res.ok) {
        setError(res.message || res.error || "Genişletme başarısız");
        return;
      }
      if (res.guidance?.id) setGuidanceId(res.guidance.id);
      if (res.draft?.id) setDraftId(res.draft.id);
      if (res.draft?.guidanceId) setGuidanceId(res.draft.guidanceId);
      setPatientDraft(res.patientDraft || "");
      setConfidence(res.confidence ?? null);
      setWarnings([
        ...(res.detectedRisks || []),
        ...(res.safetyReport?.warnings || []),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Genişletme hatası");
    } finally {
      setBusy(false);
    }
  }, [patientId, intentText, selectedTags, guidanceId, expansionAllowed]);

  const onRewrite = async (action: RewriteAction) => {
    if (!draftId || !patientDraft.trim()) {
      setError("Önce hasta taslağı oluşturun.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await rewriteClinicalDraft({
        draftId,
        draftText: patientDraft,
        action,
      });
      if (!res.ok) {
        setError(res.message || res.error || "Yeniden yazma başarısız");
        return;
      }
      setPatientDraft(res.patientDraft || patientDraft);
      if (res.draft?.id) setDraftId(res.draft.id);
      setWarnings(res.safetyReport?.warnings || warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yeniden yazma hatası");
    } finally {
      setBusy(false);
    }
  };

  const onSend = async () => {
    if (!guidanceId || !draftId || !patientDraft.trim()) {
      setError("Göndermek için taslak ve onay gerekli.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await sendClinicalGuidance({
        guidanceId,
        draftId,
        finalText: patientDraft.trim(),
      });
      if (!res.ok) {
        setError(res.message || res.error || "Gönderilemedi");
        return;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim hatası");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Klinik niyet → hasta mesajı</Text>
      <Text style={styles.sub}>
        Dahili not hastaya asla doğrudan gitmez. YZ güvenli, hasta dostu taslak üretir; siz
        onaylayıp gönderirsiniz.
      </Text>

      <Text style={styles.label}>Dahili klinik not</Text>
      <TextInput
        style={styles.inputMultiline}
        multiline
        placeholder="Örn: 2 implant gerekebilir. Önce CBCT. Korkutma. 2 ziyaret sürecini kısaca anlat."
        value={intentText}
        onChangeText={setIntentText}
        editable={!busy}
      />

      <Text style={styles.label}>Niyet etiketleri</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow}>
        {(intentTags.length ? intentTags : (Object.keys(TAG_LABELS) as IntentTag[])).map(
          (tag) => {
            const on = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                style={[styles.tag, on && styles.tagOn]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagText, on && styles.tagTextOn]}>
                  {TAG_LABELS[tag] || tag}
                </Text>
              </Pressable>
            );
          },
        )}
      </ScrollView>

      <Pressable
        style={[styles.btnPrimary, (!expansionAllowed || busy) && styles.btnDisabled]}
        onPress={onExpand}
        disabled={!expansionAllowed || busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnPrimaryText}>Hasta taslağı oluştur</Text>
        )}
      </Pressable>

      {warnings.length > 0 ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Güvenlik uyarıları</Text>
          <Text style={styles.warnBody}>{warnings.join(" · ")}</Text>
        </View>
      ) : null}

      {confidence != null ? (
        <Text style={styles.meta}>Güven skoru: {Math.round(confidence * 100)}%</Text>
      ) : null}

      <Text style={styles.label}>Hasta mesajı (önizleme / düzenle)</Text>
      <TextInput
        style={[styles.inputMultiline, styles.draftInput]}
        multiline
        value={patientDraft}
        onChangeText={setPatientDraft}
        placeholder="YZ taslağı burada görünür…"
        editable={!busy}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rewriteRow}>
        {REWRITE_ACTIONS.map((a) => (
          <Pressable
            key={a.id}
            style={styles.chipBtn}
            onPress={() => onRewrite(a.id)}
            disabled={busy || !patientDraft}
          >
            <Text style={styles.chipBtnText}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        style={[styles.btnSend, (busy || !patientDraft || sent) && styles.btnDisabled]}
        onPress={onSend}
        disabled={busy || !patientDraft || sent}
      >
        <Text style={styles.btnSendText}>{sent ? "Gönderildi ✓" : "Onayla ve gönder"}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f0f9ff",
  },
  title: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  sub: { fontSize: 12, color: "#475569", lineHeight: 17, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 8 },
  inputMultiline: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
    textAlignVertical: "top",
  },
  draftInput: { minHeight: 120, borderColor: "#93c5fd" },
  tagRow: { marginBottom: 8, maxHeight: 40 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
    marginRight: 6,
  },
  tagOn: { backgroundColor: "#2563eb" },
  tagText: { fontSize: 12, color: "#334155" },
  tagTextOn: { color: "#fff" },
  btnPrimary: {
    marginTop: 10,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSend: {
    marginTop: 12,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSendText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  rewriteRow: { marginTop: 8, maxHeight: 36 },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#e0e7ff",
    marginRight: 6,
  },
  chipBtnText: { fontSize: 12, color: "#3730a3", fontWeight: "600" },
  warnBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  warnTitle: { fontSize: 12, fontWeight: "700", color: "#92400e" },
  warnBody: { fontSize: 11, color: "#78350f", marginTop: 4 },
  meta: { fontSize: 11, color: "#64748b", marginTop: 6 },
  error: { marginTop: 10, color: "#b91c1c", fontSize: 13 },
});
