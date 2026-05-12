import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import { apiFetchJson, setAuthToken } from "@/lib/api";
import { logDoctorCleanPushSyncResult } from "@/lib/logStartup";
import { setDoctorJwt } from "@/lib/session";
import { syncDoctorExpoPushTokenWithBackend } from "@/lib/syncDoctorExpoPush";

type LoginResponse = {
  ok?: boolean;
  token?: string;
  error?: string;
  message?: string;
};

export default function DoctorLogin() {
  const [email, setEmail] = useState("");
  const [clinicCode, setClinicCode] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const em = email.trim().toLowerCase();
    const code = clinicCode.trim().toUpperCase();
    if (!em || !code) {
      Alert.alert("Giriş", "E-posta ve klinik kodu gerekli.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetchJson<LoginResponse>("/api/doctor/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, clinicCode: code }),
        timeoutMs: 30_000,
      });
      if (!res?.ok || !res.token) {
        Alert.alert(
          "Giriş başarısız",
          res?.message || res?.error || "Bilinmeyen hata"
        );
        return;
      }
      await setDoctorJwt(res.token);
      setAuthToken(res.token);
      void syncDoctorExpoPushTokenWithBackend().then((pushResult) => {
        logDoctorCleanPushSyncResult(pushResult);
      });
      router.replace("/doctor/dashboard");
    } catch (e) {
      Alert.alert("Giriş", (e as Error)?.message || "Ağ hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Doktor girişi</Text>
        <Text style={styles.hint}>Üretim API ile aynı ortam (Clinifly).</Text>
        <TextInput
          style={styles.input}
          placeholder="E-posta"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Klinik kodu"
          autoCapitalize="characters"
          autoCorrect={false}
          value={clinicCode}
          onChangeText={setClinicCode}
        />
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Giriş yap</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f3f4f6" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8, color: "#111827" },
  hint: { fontSize: 13, color: "#6b7280", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    color: "#111827",
  },
  button: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
