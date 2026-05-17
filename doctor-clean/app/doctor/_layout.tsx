import { Tabs } from "expo-router";

export default function DoctorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /** Keep tab screens mounted so back navigation does not remount + refetch. */
        lazy: false,
        freezeOnBlur: false,
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="patients" />
      <Tabs.Screen name="cases" />
      <Tabs.Screen name="case" options={{ href: null }} />
      <Tabs.Screen name="patient" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
