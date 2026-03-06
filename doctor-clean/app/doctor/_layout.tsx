import { Tabs } from "expo-router";

export default function DoctorLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="patients" />
      <Tabs.Screen name="cases" />
      <Tabs.Screen name="case" options={{ href: null }} />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
