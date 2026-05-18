import AsyncStorage from "@react-native-async-storage/async-storage";

const DOCTOR_JWT_KEY = "@cliniflow/doctor_jwt_v1";

export async function getDoctorJwt(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(DOCTOR_JWT_KEY);
    return t?.trim() || null;
  } catch {
    return null;
  }
}

export async function setDoctorJwt(token: string | null): Promise<void> {
  if (!token?.trim()) {
    await AsyncStorage.removeItem(DOCTOR_JWT_KEY);
    return;
  }
  await AsyncStorage.setItem(DOCTOR_JWT_KEY, token.trim());
}

export async function clearDoctorJwt(): Promise<void> {
  await AsyncStorage.removeItem(DOCTOR_JWT_KEY);
}
