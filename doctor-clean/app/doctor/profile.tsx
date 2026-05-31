import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { setAuthToken } from "@/lib/api";
import {
  getDoctorPreferredLanguage,
  normalizeDoctorPreferredLanguage,
  setDoctorPreferredLanguage,
} from "@/lib/doctorPreferredLanguage";
import { clearDoctorJwt } from "@/lib/session";

const LANG_OPTIONS = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "ka", label: "Georgian" },
  { code: "ru", label: "Russian" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "ar", label: "Arabic" },
];

export default function Profile() {
  const [preferredLanguage, setPreferredLanguage] = useState("tr");
  const [savingLang, setSavingLang] = useState(false);

  useEffect(() => {
    void getDoctorPreferredLanguage().then(setPreferredLanguage);
  }, []);

  const onLogout = async () => {
    await clearDoctorJwt();
    setAuthToken(null);
    router.replace("/login");
  };

  const onPickLanguage = (code: string) => {
    const normalized = normalizeDoctorPreferredLanguage(code);
    setSavingLang(true);
    void setDoctorPreferredLanguage(normalized)
      .then((saved) => {
        setPreferredLanguage(saved);
        Alert.alert("Dil", "Tercih edilen dil kaydedildi. Mesaj çevirileri bu dile yapılır.");
      })
      .catch(() => {
        Alert.alert("Dil", "Kaydedilemedi. Lütfen tekrar deneyin.");
      })
      .finally(() => setSavingLang(false));
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Doctor Profile</Text>

      <Text style={styles.sectionTitle}>Preferred language (chat translation)</Text>
      <Text style={styles.sectionHint}>
        Hasta mesajları «Show Translation» ile bu dile çevrilir.
      </Text>
      <View style={styles.langGrid}>
        {LANG_OPTIONS.map((opt) => {
          const active = preferredLanguage === opt.code;
          return (
            <Pressable
              key={opt.code}
              style={[styles.langChip, active && styles.langChipActive]}
              disabled={savingLang}
              onPress={() => onPickLanguage(opt.code)}
            >
              <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={styles.btn}
        onPress={() => {
          Alert.alert("Çıkış", "Oturumu kapatılsın mı?", [
            { text: "İptal", style: "cancel" },
            { text: "Çıkış", style: "destructive", onPress: () => void onLogout() },
          ]);
        }}
      >
        <Text style={styles.btnText}>Çıkış</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, paddingTop: 48, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 24, color: "#111827" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 4 },
  sectionHint: { fontSize: 12, color: "#6b7280", marginBottom: 12, lineHeight: 18 },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 28 },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  langChipActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  langChipText: { fontSize: 13, color: "#374151", fontWeight: "600" },
  langChipTextActive: { color: "#1d4ed8" },
  btn: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
