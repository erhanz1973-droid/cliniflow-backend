const path = require('path');
const express = require('express');
const router = express.Router();
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
const { supabase } = require(appPath('supabase.js'));
const { authenticateToken } = require(appPath('server', 'middleware', 'auth'));
const {
  resolveDoctorUUID,
  sendDoctorUuidResolveError,
} = require(appPath('lib', 'resolveDoctorUUID'));

console.log('🔥 DOCTOR DASHBOARD ROUTE LOADED');

// GET /api/doctor/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
  console.log('🔥 DOCTOR DASHBOARD ENDPOINT HIT');
  try {
    const tokenDoctorRaw = req.user?.id || req.user?.doctorId;
    const clinicId = req.user?.clinicId;
    if (!tokenDoctorRaw || !clinicId) {
      return res.status(400).json({ ok: false, error: 'missing_doctor_or_clinic' });
    }

    const doctorDbId = await resolveDoctorUUID(tokenDoctorRaw);

    // Today appointments — `appointments` uses `start_time` (timestamptz), not `date` equality
    const nowDate = new Date();
    const todayLocal = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
    const dayStart = new Date(`${todayLocal}T00:00:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();

    let todayAppointments = [];
    const apptAttempts = [
      () =>
        supabase
          .from('appointments')
          .select('*')
          .eq('doctor_id', doctorDbId)
          .gte('start_time', dayStartIso)
          .lt('start_time', dayEndIso),
      () =>
        supabase
          .from('appointments')
          .select('*')
          .eq('doctor_id', doctorDbId)
          .gte('startTime', dayStartIso)
          .lt('startTime', dayEndIso),
    ];
    let apptError = null;
    let apptFound = false;
    for (const run of apptAttempts) {
      const { data, error } = await run();
      if (!error) {
        todayAppointments = data || [];
        apptFound = true;
        break;
      }
      apptError = error;
      const code = String(error?.code || '');
      const msg = String(error?.message || '').toLowerCase();
      const schemaIssue = ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code) || msg.includes('column');
      if (!schemaIssue) break;
    }
    if (!apptFound && apptError) {
      const code = String(apptError?.code || '');
      const msg = String(apptError?.message || '').toLowerCase();
      const schemaIssue = ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code) || msg.includes('column');
      if (!schemaIssue) throw apptError;
    }

    // Tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_doctor_id', doctorDbId)
      .eq('clinic_id', clinicId)
      .in('status', ['PENDING', 'IN_PROGRESS']);
    if (tasksError) throw tasksError;

    // Alerts (example: unread alerts)
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select('*')
      .eq('doctor_id', doctorDbId)
      .eq('clinic_id', clinicId)
      .eq('is_read', false);
    if (alertsError) throw alertsError;

    // Active plans
    const { data: activePlans, error: plansError } = await supabase
      .from('treatment_plans')
      .select('*')
      .eq('doctor_id', doctorDbId)
      .eq('clinic_id', clinicId)
      .in('status', ['ACTIVE', 'IN_PROGRESS']);
    if (plansError) throw plansError;

    res.json({
      ok: true,
      todayAppointments,
      tasks,
      alerts,
      activePlans
    });
  } catch (error) {
    if (sendDoctorUuidResolveError(res, error)) return;
    if (process.env.NODE_ENV !== 'production') {
      console.error('[DOCTOR DASHBOARD] Error:', error);
    }
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;
