// routes/admin/tasks.js
// Mounted at: app.use('/api/admin', adminTasksRouter)
// Covers: POST /api/admin/tasks

const express = require('express');
const { supabase } = require('../../supabase');
const { adminAuth } = require('../../admin-auth-middleware');
const {
  resolveDoctorUUID,
  sendDoctorUuidResolveError,
} = require('../../lib/resolveDoctorUUID');

const router = express.Router();

/* ================= ADMIN TASK ASSIGNMENT ================= */
// Original location: index.cjs line 7930
router.post('/tasks', adminAuth, async (req, res) => {
  try {
    const {
      treatment_group_id,
      patient_id,
      assigned_doctor_id,
      title,
      description,
      priority = "medium",
      due_date
    } = req.body;

    if (!treatment_group_id || !patient_id || !assigned_doctor_id || !title) {
      return res.status(400).json({ ok: false, error: "required_fields_missing" });
    }

    const clinicId = req.admin.clinicId;

    let assigneeUuid;
    try {
      assigneeUuid = await resolveDoctorUUID(assigned_doctor_id);
    } catch (e) {
      if (sendDoctorUuidResolveError(res, e)) return;
      throw e;
    }

    // 1. Verify treatment group exists and belongs to admin's clinic
    const { data: treatmentGroup, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id, clinic_id, status")
      .eq("id", treatment_group_id)
      .eq("clinic_id", clinicId)
      .single();

    if (groupError || !treatmentGroup) {
      console.error("[ADMIN CREATE TASK] Treatment group not found:", groupError);
      return res.status(404).json({ ok: false, error: "treatment_group_not_found" });
    }

    // 2. Verify patient exists and belongs to same clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, clinic_id, status")
      .eq("id", patient_id)
      .eq("clinic_id", clinicId)
      .single();

    if (patientError || !patient) {
      console.error("[ADMIN CREATE TASK] Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // 3. Verify doctor exists, is active, belongs to same clinic, and is member of treatment group
    const { data: doctor, error: doctorError } = await supabase
      .from("doctors")
      .select("id, clinic_id, status, role")
      .eq("id", assigneeUuid)
      .eq("clinic_id", clinicId)
      .eq("role", "DOCTOR")
      .eq("status", "ACTIVE")
      .single();

    if (doctorError || !doctor) {
      console.error("[ADMIN CREATE TASK] Doctor not found:", doctorError);
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    // 4. Verify doctor is member of the treatment group
    const { data: groupMember, error: memberError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", treatment_group_id)
      .eq("doctor_id", assigneeUuid)
      .single();

    if (memberError || !groupMember) {
      console.error("[ADMIN CREATE TASK] Doctor not in treatment group:", memberError);
      return res.status(400).json({ ok: false, error: "doctor_not_in_treatment_group" });
    }

    // 5. Create the task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        treatment_group_id,
        patient_id,
        assigned_doctor_id: assigneeUuid,
        created_by_admin_id: req.admin.adminId,
        title,
        description,
        priority,
        due_date: due_date ? new Date(due_date).toISOString() : null
      })
      .select()
      .single();

    if (taskError || !task) {
      console.error("[ADMIN CREATE TASK] Task creation error:", taskError);
      return res.status(500).json({ ok: false, error: "task_creation_failed" });
    }

    console.log("[ADMIN CREATE TASK] Success:", {
      taskId: task.id,
      treatmentGroupId: treatment_group_id,
      patientId: patient_id,
      assignedDoctorId: assigneeUuid,
      adminId: req.admin.adminId
    });

    res.json({
      ok: true,
      task: {
        id: task.id,
        treatment_group_id: task.treatment_group_id,
        patient_id: task.patient_id,
        assigned_doctor_id: task.assigned_doctor_id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        created_at: task.created_at,
        updated_at: task.updated_at
      }
    });

  } catch (err) {
    if (sendDoctorUuidResolveError(res, err)) return;
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN CREATE TASK] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

module.exports = router;
