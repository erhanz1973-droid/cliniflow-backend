import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../../lib/language-context";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useAuthStore } from "../../store/authStore";
import { useAuth } from "../../lib/auth";
import { apiGet, setAuthToken } from "../../lib/api";
import { useRouter } from "expo-router";

type TodayAppointmentStatus = "scheduled" | "in_progress" | "completed";

type TreatmentPlan = {
  id: string;
  status: string;
  procedure_name: string;
  scheduled_date?: string;
  date?: string;
  created_at?: string;
  patient: {
    name: string;
  };
};

function getGreeting(t: (key: string) => string) {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.greetingMorning");
  if (hour < 18) return t("home.greetingDay");
  return t("home.greetingEvening");
}

function getStatusLabel(status: TodayAppointmentStatus, t: (key: string) => string) {
  if (status === "in_progress") return t("dashboard.status.in_progress");
  if (status === "completed") return t("dashboard.status.completed");
  return t("dashboard.status.scheduled");
}

function getStatusColor(status: TodayAppointmentStatus) {
  if (status === "in_progress") return "#16a34a";
  if (status === "completed") return "#9ca3af";
  return "#2563eb";
}

// Tarih karşılaştırma yardımcısı
function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getDate() === d2.getDate() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getFullYear() === d2.getFullYear();
}

function formatDateTR(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export default function DoctorDashboard() {
  const { t, currentLanguage } = useLanguage();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const { signOut } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ planned: 0, in_progress: 0, done: 0, today: 0, waiting: 0 });
  const [doctorInfo, setDoctorInfo] = useState<any>(null);
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<TreatmentPlan[]>([]);
  const [tomorrowAppointments, setTomorrowAppointments] = useState<TreatmentPlan[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<TreatmentPlan[]>([]);

  const fetchDashboard = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setRefreshing(false);
      router.replace("/login/doctor");
      return;
    }
    setAuthToken(token);
    try {
      const data = await apiGet<any>("/api/doctor/dashboard");
      
      if (!data?.ok) throw new Error("Dashboard yüklenemedi");
      
      setDoctorInfo(data.doctor || null);
      setStats(data.stats || { planned: 0, in_progress: 0, done: 0, today: 0, waiting: 0 });
      setRecentPatients(Array.isArray(data.recentPatients) ? data.recentPatients.slice(0, 5) : []);

      /** cliniflow-backend-clean: todayAppointments / tomorrowAppointments (recentTreatmentPlans yok) */
      const mapDashboardAppt = (a: any): TreatmentPlan => {
        const datePart = String(a?.date || "").trim();
        const timePart = String(a?.time || "09:00").trim();
        let sched: string | undefined;
        if (datePart) {
          sched =
            timePart.length === 5
              ? `${datePart}T${timePart}:00`
              : timePart
                ? `${datePart}T${timePart}`
                : `${datePart}T09:00:00`;
        }
        const encId = String(a?.planId || "").trim();
        const apptId = String(a?.appointmentId || "").trim();
        return {
          id: encId || apptId || `appt-${datePart}-${timePart}`,
          status: String(a?.status || "scheduled"),
          procedure_name: String(a?.procedureSummary || "Randevu"),
          scheduled_date: sched,
          date: sched,
          patient: { name: String(a?.patientName || "Hasta") },
        };
      };

      const apiToday = Array.isArray(data.todayAppointments) ? data.todayAppointments : [];
      const apiTomorrow = Array.isArray(data.tomorrowAppointments) ? data.tomorrowAppointments : [];
      const allPlans: TreatmentPlan[] = Array.isArray(data.recentTreatmentPlans)
        ? data.recentTreatmentPlans
        : [];

      let todayList: TreatmentPlan[] = [];
      let tomorrowList: TreatmentPlan[] = [];
      let upcomingList: TreatmentPlan[] = [];

      if (apiToday.length > 0 || apiTomorrow.length > 0) {
        todayList = apiToday.map(mapDashboardAppt);
        tomorrowList = apiTomorrow.map(mapDashboardAppt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        allPlans.forEach((plan) => {
          const dateStr = plan.scheduled_date || plan.date || plan.created_at;
          if (!dateStr) {
            upcomingList.push(plan);
            return;
          }
          const planDate = new Date(dateStr);
          if (isSameDay(planDate, today) || isSameDay(planDate, tomorrow)) return;
          if (planDate > tomorrow) upcomingList.push(plan);
        });
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        allPlans.forEach((plan) => {
          const dateStr = plan.scheduled_date || plan.date || plan.created_at;
          if (!dateStr) {
            upcomingList.push(plan);
            return;
          }
          const planDate = new Date(dateStr);
          if (isSameDay(planDate, today)) todayList.push(plan);
          else if (isSameDay(planDate, tomorrow)) tomorrowList.push(plan);
          else if (planDate > today) upcomingList.push(plan);
        });
      }

      setTodayAppointments(todayList);
      setTomorrowAppointments(tomorrowList);
      setUpcomingAppointments(upcomingList);
      
    } catch (error: any) {
      Alert.alert("Hata", error?.message || "Dashboard yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/login/doctor");
    } catch {
      // ignore
    }
  };

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard();
  }, [fetchDashboard]);

  const handlePlanPress = (plan: TreatmentPlan) => {
    router.push({
      pathname: "/doctor-treatment",
      params: { encounterId: plan.id },
    } as any);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingWrap]}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>{t("dashboard.loading")}</Text>
      </View>
    );
  }

  const doctorName = doctorInfo?.name || user?.name || "Doktor";
  const hasToday = todayAppointments.length > 0;
  const hasTomorrow = tomorrowAppointments.length > 0;
  const hasUpcoming = upcomingAppointments.length > 0;

  // Plan kartı render fonksiyonu
  const renderPlanCard = (plan: TreatmentPlan, isToday: boolean, isTomorrow: boolean) => {
    const dateStr = plan.scheduled_date || plan.date || plan.created_at;
    let dateLabel = "Tarih belirtilmemiş";
    let timeLabel = "";
    
    if (dateStr) {
      const date = new Date(dateStr);
      if (isToday) {
        dateLabel = "📅 Bugün";
      } else if (isTomorrow) {
        dateLabel = "📅 Yarın";
      } else {
        dateLabel = `📅 ${formatDateTR(date)}`;
      }
      
      // Saat varsa göster
      if (plan.scheduled_date || plan.date) {
        timeLabel = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      }
    }

    return (
      <TouchableOpacity
        key={plan.id}
        style={styles.planCard}
        onPress={() => handlePlanPress(plan)}
        activeOpacity={0.7}
      >
        <View style={[styles.dateBadge, isToday && styles.dateBadgeToday, isTomorrow && styles.dateBadgeTomorrow]}>
          <Text style={[styles.dateBadgeText, (isToday || isTomorrow) && styles.dateBadgeTextHighlight]}>
            {dateLabel}
          </Text>
          {timeLabel ? <Text style={styles.timeText}>{timeLabel}</Text> : null}
        </View>
        
        <View style={styles.planContent}>
          <Text style={styles.planPatient}>{plan.patient?.name || "Hasta"}</Text>
          <Text style={styles.planProcedure}>{plan.procedure_name}</Text>
          
          <View style={styles.planFooter}>
            <View style={[styles.statusBadge, { backgroundColor: plan.status === 'planned' ? '#dbeafe' : '#dcfce7' }]}>
              <Text style={[styles.statusBadgeText, { color: plan.status === 'planned' ? '#1e40af' : '#166534' }]}>
                {plan.status === 'planned' ? 'Planlandı' : plan.status}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2563eb" />
      }
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{getGreeting(t)}</Text>
          <Text style={styles.doctorName}>Dr. {doctorName}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{doctorName.charAt(0).toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>{t("dashboard.logout")}</Text>
        </TouchableOpacity>
      </View>

      {/* STATS */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: "#2563eb" }]}> 
          <Text style={styles.statValue}>{stats.planned ?? 0}</Text>
          <Text style={styles.statTitle}>Planlanan</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: "#f59e0b" }]}> 
          <Text style={styles.statValue}>{stats.waiting ?? 0}</Text>
          <Text style={styles.statTitle}>Bekleyen</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: "#16a34a" }]}> 
          <Text style={styles.statValue}>{stats.in_progress ?? 0}</Text>
          <Text style={styles.statTitle}>Devam Eden</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: "#9ca3af" }]}> 
          <Text style={styles.statValue}>{stats.done ?? 0}</Text>
          <Text style={styles.statTitle}>Tamamlanan</Text>
        </View>
      </View>

      {/* QUICK ACTIONS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("dashboard.quickActions")}</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/doctor/patients" as any)}
          >
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionLabel}>{t("dashboard.patients")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/xray-upload" as any)}
          >
            <Text style={styles.actionIcon}>🩻</Text>
            <Text style={styles.actionLabel}>{t("dashboard.xray")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/doctor/tasks" as any)}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>{t("dashboard.tasks")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BUGÜN */}
      {hasToday && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bugün ({todayAppointments.length})</Text>
          <View style={styles.card}>
            {todayAppointments.map(plan => renderPlanCard(plan, true, false))}
          </View>
        </View>
      )}

      {/* YARIN */}
      {hasTomorrow && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Yarın ({tomorrowAppointments.length})</Text>
          <View style={styles.card}>
            {tomorrowAppointments.map(plan => renderPlanCard(plan, false, true))}
          </View>
        </View>
      )}

      {/* GELECEK */}
      {hasUpcoming && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Yaklaşan Planlar ({upcomingAppointments.length})</Text>
          <View style={styles.card}>
            {upcomingAppointments.map(plan => renderPlanCard(plan, false, false))}
          </View>
        </View>
      )}

      {/* BOŞ DURUM */}
      {!hasToday && !hasTomorrow && !hasUpcoming && (
        <View style={styles.section}>
          <View style={styles.card}>
            <Text style={styles.emptyText}>
              📅 Yaklaşan tedavi planı bulunmuyor
            </Text>
          </View>
        </View>
      )}

      {/* RECENT PATIENTS */}
      {recentPatients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("dashboard.recentPatients")}</Text>
          <View style={styles.card}>
            {recentPatients.map((p, idx) => (
              <TouchableOpacity
                key={p.id || idx}
                style={[styles.patientRow, idx < recentPatients.length - 1 && styles.rowBorder]}
                activeOpacity={p.hasRisk ? 0.7 : 1}
                onPress={() => p.hasRisk && router.push({ pathname: "/patient-treatment-history", params: { patientId: p.id, patientName: p.name } } as any)}
              >
                <View style={styles.patientAvatar}>
                  <Text style={styles.patientAvatarText}>
                    {(p.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={styles.patientName}>{p.name || t("dashboard.unnamedPatient")}</Text>
                    {p.hasRisk && (
                      <View style={styles.riskBadge}>
                        <Text style={styles.riskBadgeText}>⚠ {(p.riskFlags as string[]).slice(0, 2).join(", ")}</Text>
                      </View>
                    )}
                  </View>
                  {p.lastVisit && <Text style={styles.patientMeta}>{p.lastVisit}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  loadingWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#6b7280",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  greeting: {
    fontSize: 13,
    color: "#6b7280",
  },
  doctorName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  logoutText: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 13,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  statTitle: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    padding: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  emptyText: {
    padding: 20,
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
  },
  // Plan Kart Stilleri
  planCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateBadge: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  dateBadgeToday: {
    backgroundColor: "#dcfce7",
  },
  dateBadgeTomorrow: {
    backgroundColor: "#dbeafe",
  },
  dateBadgeText: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
  },
  dateBadgeTextHighlight: {
    color: "#111827",
    fontWeight: "700",
  },
  timeText: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 2,
  },
  planContent: {
    flex: 1,
  },
  planPatient: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  planProcedure: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  planFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // Hasta Stilleri
  patientRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  patientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  patientAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563eb",
  },
  patientName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  patientMeta: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 1,
  },
  riskBadge: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  riskBadgeText: {
    color: "#b91c1c",
    fontSize: 10,
    fontWeight: "700",
  },
});
