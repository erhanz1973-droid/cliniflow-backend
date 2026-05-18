import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { setAuthToken } from "@/lib/api";
import { clearDoctorJwt } from "@/lib/session";

export default function Profile() {
  const onLogout = async () => {
    await clearDoctorJwt();
    setAuthToken(null);
    router.replace("/login");
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Doctor Profile</Text>
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
  root: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 24, color: "#111827" },
  btn: {
    backgroundColor: "#dc2626",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
