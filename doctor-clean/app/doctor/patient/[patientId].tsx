import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { DoctorCoordinationWorkspace } from "@/components/DoctorCoordinationWorkspace";

export default function DoctorPatientWorkspace() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const id = Array.isArray(patientId) ? patientId[0] : patientId;

  return (
    <View style={styles.screen}>
      {id ? (
        <DoctorCoordinationWorkspace patientId={id} />
      ) : (
        <Text style={styles.muted}>Hasta kimliği yok.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  muted: { padding: 20, color: "#6b7280" },
});
