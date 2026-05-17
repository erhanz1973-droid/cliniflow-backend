import { memo, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { useRouter } from "expo-router";

import { apiFetchJson } from "@/lib/api";
import { useScreenResource } from "@/hooks/use-screen-resource";

type PatientRow = { full_name?: string; name?: string; id?: string };

type PatientsResponse = {
  ok?: boolean;
  patients?: PatientRow[];
  error?: string;
};

const ROW_HEIGHT = 44;

const PatientListRow = memo(function PatientListRow({
  item,
  onPress,
}: {
  item: PatientRow;
  onPress: (id: string) => void;
}) {
  const label = String(item.full_name || item.name || item.id || "?").slice(0, 80);
  const id = item.id ? String(item.id) : "";
  return (
    <Pressable style={styles.row} onPress={() => id && onPress(id)} disabled={!id}>
      <Text style={styles.name} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

function normalizePatients(res: PatientsResponse | null): PatientRow[] {
  if (!res?.ok || !Array.isArray(res.patients)) return [];
  return res.patients;
}

export default function Patients() {
  const router = useRouter();

  const openPatient = useCallback(
    (id: string) => {
      router.push(`/doctor/patient/${encodeURIComponent(id)}`);
    },
    [router]
  );

  const fetchPatients = useCallback(async () => {
    return apiFetchJson<PatientsResponse>("/api/doctor/patients", { timeoutMs: 55_000 });
  }, []);

  const { data, error, loading, refreshing, refresh } = useScreenResource(
    "doctor:patients",
    fetchPatients,
    { focusRefreshAfterMs: 60_000 }
  );

  const list = useMemo(() => normalizePatients(data), [data]);
  const apiErr = data && !data.ok ? data.error || "Liste alınamadı" : null;
  const displayErr = error || apiErr;

  const keyExtractor = useCallback(
    (item: PatientRow, index: number) => String(item.id || `idx-${index}`),
    []
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<PatientRow> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PatientRow>) => (
      <PatientListRow item={item} onPress={openPatient} />
    ),
    [openPatient]
  );

  const ListHeader = useMemo(
    () => (
      <View>
        <Text style={styles.title}>Hastalar</Text>
        <Text style={styles.sub}>GET /api/doctor/patients</Text>
        {loading && list.length === 0 ? (
          <ActivityIndicator style={styles.spinner} color="#2563eb" />
        ) : null}
        {displayErr ? <Text style={styles.error}>{displayErr}</Text> : null}
        {!loading && !displayErr ? (
          <Text style={styles.count}>
            {list.length} kayıt{refreshing ? " · güncelleniyor…" : ""}
          </Text>
        ) : null}
      </View>
    ),
    [displayErr, list.length, loading, refreshing]
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={list}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        ListHeaderComponent={ListHeader}
        removeClippedSubviews
        windowSize={8}
        maxToRenderPerBatch={12}
        initialNumToRender={18}
        updateCellsBatchingPeriod={50}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <Pressable style={styles.btn} onPress={refresh}>
            <Text style={styles.btnText}>Yenile</Text>
          </Pressable>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  listContent: { paddingHorizontal: 20, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: "700", marginTop: 16, marginBottom: 4, color: "#111827" },
  sub: { fontSize: 13, color: "#6b7280", marginBottom: 12 },
  spinner: { marginVertical: 12 },
  error: { color: "#b91c1c", marginVertical: 8 },
  count: { fontSize: 15, fontWeight: "600", marginBottom: 8, color: "#374151" },
  row: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  name: { fontSize: 16, color: "#111827" },
  btn: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});
