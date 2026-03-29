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

// GET /api/doctor/dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const tokenDoctorRaw = req.user?.id || req.user?.doctorId;
    const clinicId = req.user?.clinicId;
    if (!tokenDoctorRaw || !clinicId) {
      return res.status(400).json({ ok: false, error: 'missing_doctor_or_clinic' });
    }

    const doctorDbId = await resolveDoctorUUID(tokenDoctorRaw);

    // Today appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const { data: todayAppointments, error: apptError } = await supabase
      .from('appointments')
      .select('*')
      .eq('doctor_id', doctorDbId)
      .gte('date', today.toISOString())
      .lt('date', tomorrow.toISOString());
    if (apptError) throw apptError;

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
