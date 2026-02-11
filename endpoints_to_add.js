// ================= ADMIN ASSIGN PATIENT (TREATMENT GROUP) =================
app.post("/api/admin/assign-patient", adminAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id } = req.body || {};

    if (!patient_id || !doctor_id) {
      return res.status(400).json({ ok: false, error: "patient_id_and_doctor_id_required" });
    }

    const clinicId = req.admin?.clinicId;
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_not_found" });
    }

    console.log("[ADMIN ASSIGN PATIENT] Request:", { patient_id, doctor_id, clinicId });

    // 1. Check if patient exists and belongs to same clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, patient_id, name, clinic_id, status")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patient_id)
      .single();

    if (patientError || !patient) {
      console.error("[ADMIN ASSIGN PATIENT] Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // 2. Check if doctor exists and belongs to same clinic
    const { data: doctor, error: doctorError } = await supabase
      .from("doctors")
      .select("id, doctor_id, name, clinic_id, status")
      .eq("clinic_id", clinicId)
      .eq("doctor_id", doctor_id)
      .single();

    if (doctorError || !doctor) {
      console.error("[ADMIN ASSIGN PATIENT] Doctor not found:", doctorError);
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    // 3. Create treatment group if not exists
    let treatmentGroupId;
    const { data: existingGroup, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id")
      .eq("patient_id", patient.id)
      .eq("clinic_id", clinicId)
      .eq("status", "ACTIVE")
      .single();

    if (groupError && groupError.code !== 'PGRST116') {
      console.error("[ADMIN ASSIGN PATIENT] Group check error:", groupError);
      return res.status(500).json({ ok: false, error: "group_check_failed" });
    }

    if (existingGroup) {
      treatmentGroupId = existingGroup.id;
      console.log("[ADMIN ASSIGN PATIENT] Using existing group:", treatmentGroupId);
    } else {
      // Create new treatment group
      const { data: newGroup, error: createGroupError } = await supabase
        .from("treatment_groups")
        .insert({
          patient_id: patient.id,
          clinic_id: clinicId,
          status: "ACTIVE",
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (createGroupError || !newGroup) {
        console.error("[ADMIN ASSIGN PATIENT] Group creation failed:", createGroupError);
        return res.status(500).json({ ok: false, error: "group_creation_failed" });
      }

      treatmentGroupId = newGroup.id;
      console.log("[ADMIN ASSIGN PATIENT] Created new group:", treatmentGroupId);
    }

    // 4. Add doctor to treatment group as primary member
    const { error: memberError } = await supabase
      .from("treatment_group_members")
      .upsert({
        treatment_group_id: treatmentGroupId,
        doctor_id: doctor.id,
        role: "PRIMARY",
        status: "ACTIVE",
        joined_at: new Date().toISOString()
      }, {
        onConflict: "treatment_group_id,doctor_id"
      });

    if (memberError) {
      console.error("[ADMIN ASSIGN PATIENT] Member assignment failed:", memberError);
      return res.status(500).json({ ok: false, error: "member_assignment_failed" });
    }

    // 5. Create patient group assignment record
    const { error: assignmentError } = await supabase
      .from("patient_group_assignments")
      .insert({
        patient_id: patient.id,
        treatment_group_id: treatmentGroupId,
        clinic_id: clinicId,
        assigned_by: req.admin.adminId,
        assigned_at: new Date().toISOString(),
        status: "ACTIVE"
      });

    if (assignmentError) {
      console.error("[ADMIN ASSIGN PATIENT] Assignment record failed:", assignmentError);
      return res.status(500).json({ ok: false, error: "assignment_record_failed" });
    }

    console.log("[ADMIN ASSIGN PATIENT] Success:", { treatmentGroupId, patient_id, doctor_id });

    res.json({
      ok: true,
      treatment_group_id: treatmentGroupId,
      message: "Patient assigned to treatment group successfully"
    });

  } catch (error) {
    console.error("[ADMIN ASSIGN PATIENT] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= DOCTOR PATIENTS (TREATMENT GROUP) =================
app.get("/api/doctor/patients", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;

    // Get patients through treatment group members (not directly from patients table)
    const { data: groupMembers, error: memberError } = await supabase
      .from("treatment_group_members")
      .select(`
        treatment_group_id,
        treatment_groups!inner(
          id,
          patient_id,
          patients!inner(
            patient_id,
            name,
            status
          )
        )
      `)
      .eq("doctor_id", v.decoded.doctorId)
      .eq("treatment_groups.clinic_id", clinicId)
      .eq("status", "ACTIVE");

    if (memberError) {
      console.error("[DOCTOR PATIENTS] Error:", memberError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const patients = groupMembers.map(member => ({
      patient_id: member.treatment_groups.patients.patient_id,
      treatment_group_id: member.treatment_group_id,
      name: member.treatment_groups.patients.name,
      status: member.treatment_groups.patients.status
    }));

    res.json({
      ok: true,
      patients
    });

  } catch (error) {
    console.error("[DOCTOR PATIENTS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= DOCTOR ENCOUNTERS =================
app.post("/api/doctor/encounters", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;
    const { treatment_group_id, icd10_codes, notes } = req.body || {};

    if (!treatment_group_id) {
      return res.status(400).json({ ok: false, error: "treatment_group_id_required" });
    }

    if (!icd10_codes || icd10_codes.length === 0) {
      return res.status(400).json({ ok: false, error: "icd10_codes_required" });
    }

    // Check if doctor is member of this treatment group
    const { data: membership, error: membershipError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", treatment_group_id)
      .eq("doctor_id", v.decoded.doctorId)
      .eq("status", "ACTIVE")
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({ ok: false, error: "not_group_member" });
    }

    // Check if treatment group belongs to same clinic
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("clinic_id")
      .eq("id", treatment_group_id)
      .single();

    if (groupError || !group || group.clinic_id !== clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_mismatch" });
    }

    // Create encounter record
    const { data: encounter, error: encounterError } = await supabase
      .from("encounters")
      .insert({
        treatment_group_id,
        doctor_id: v.decoded.doctorId,
        encounter_type: "INITIAL",
        icd10_codes,
        notes: notes || "Initial examination",
        clinic_id: clinicId,
        created_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (encounterError || !encounter) {
      console.error("[DOCTOR ENCOUNTERS] Error:", encounterError);
      return res.status(500).json({ ok: false, error: "encounter_creation_failed" });
    }

    res.json({
      ok: true,
      encounter_id: encounter.id,
      message: "Encounter created successfully"
    });

  } catch (error) {
    console.error("[DOCTOR ENCOUNTERS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});
