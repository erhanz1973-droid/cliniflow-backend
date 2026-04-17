// Refactored Treatment Groups API - Lifecycle Model
// Remove ACTIVE status, implement junction table for group-doctor relation, make status derived from treatments

/* ================= ADMIN TREATMENT GROUPS CREATE (REFACTORED) ================= */
app.post("/api/admin/treatment-groups", adminAuth, async (req, res) => {
  try {
    const {
      patient_id,
      doctor_ids,
      primary_doctor_id,
      name,
      description
    } = req.body;

    console.log("[TREATMENT GROUPS CREATE] Request:", {
      patient_id,
      doctor_ids,
      primary_doctor_id,
      name,
      description
    });

    // Validation for required fields
    if (!patient_id || !doctor_ids?.length || !primary_doctor_id || !name) {
      return res.status(400).json({
        ok: false,
        error: "missing_fields",
        details: "patient_id, doctor_ids, primary_doctor_id, and name are required"
      });
    }

    const clinicId = req.admin.clinicId;
    const adminId = req.admin.adminId || req.admin.id;

    // Create treatment group (status will be derived from treatments)
    const { data: groupData, error: groupError } = await supabase
      .from("treatment_groups")
      .insert({
        patient_id,
        clinic_id: clinicId,
        created_by_admin_id: adminId,
        group_name: name,
        description: description || "",
        // Note: status is now calculated, no manual status field
      })
      .select()
      .single();

    if (groupError) {
      console.error("[TREATMENT GROUPS CREATE] Group creation error:", groupError);
      return res.status(500).json({
        ok: false,
        error: "Failed to create treatment group",
        details: groupError.message
      });
    }

    console.log("[TREATMENT GROUPS CREATE] Group created:", groupData);

    // 🔥 CRITICAL: Add timeline event for treatment group creation
    try {
      // Get patient and doctor details for timeline event
      const { data: patientData } = await supabase
        .from("patients")
        .select("name")
        .eq("id", patient_id)
        .single();

      const { data: primaryDoctorData } = await supabase
        .from("doctors")
        .select("full_name")
        .eq("id", primary_doctor_id)
        .single();

      // Add timeline event
      const { data: timelineEvent, error: timelineError } = await supabase
        .from("admin_timeline_events")
        .insert({
          clinic_id: clinicId,
          type: "TREATMENT_GROUP_CREATED",
          reference_id: groupData.id,
          message: "Treatment group created",
          details: {
            group_name: name,
            patient_name: patientData?.name || "Unknown Patient",
            primary_doctor_name: primaryDoctorData?.full_name || "Unknown Doctor",
            created_by_admin_id: adminId,
            doctor_count: doctor_ids.length
          },
          created_by: adminId
        })
        .select()
        .single();

      if (timelineError) {
        console.error("[TREATMENT GROUPS CREATE] Timeline event error:", timelineError);
        // Don't fail the request, just log the error
      } else {
        console.log("[TREATMENT GROUPS CREATE] Timeline event created:", timelineEvent.id);
      }
    } catch (timelineErr) {
      console.error("[TREATMENT GROUPS CREATE] Timeline event creation failed:", timelineErr);
      // Don't fail the request, just log the error
    }

    // Assign doctors to the group using junction table
    const doctorAssignments = doctor_ids.map((doctorId, index) => ({
      treatment_group_id: groupData.id,
      doctor_id: doctorId,
      is_primary: doctorId === primary_doctor_id,
      assigned_by: adminId
    }));

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("treatment_group_doctors")
      .insert(doctorAssignments)
      .select();

    if (assignmentError) {
      console.error("[TREATMENT GROUPS CREATE] Assignment error:", assignmentError);
      // Rollback group creation
      await supabase
        .from("treatment_groups")
        .delete()
        .eq("id", groupData.id);
      
      return res.status(500).json({
        ok: false,
        error: "Failed to assign doctors to treatment group",
        details: assignmentError.message
      });
    }

    console.log("[TREATMENT GROUPS CREATE] Doctors assigned:", assignmentData);

    res.json({
      ok: true,
      message: "Treatment group created successfully",
      data: {
        group: groupData,
        assignments: assignmentData
      }
    });

  } catch (error) {
    console.error("[TREATMENT GROUPS CREATE] Error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

/* ================= ADMIN TREATMENT GROUPS LIST (WITH DOCTORS) ================= */
app.get("/api/admin/treatment-groups", adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin.clinicId;

    const { data: groups, error: groupsError } = await supabase
      .from("treatment_groups")
      .select(`
        id,
        patient_id,
        clinic_id,
        group_name,
        description,
        calculated_status,
        created_at,
        updated_at,
        patients!inner(
          id,
          name,
          phone
        )
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    if (groupsError) {
      console.error("[TREATMENT GROUPS LIST] Error:", groupsError);
      return res.status(500).json({
        ok: false,
        error: "Failed to fetch treatment groups",
        details: groupsError.message
      });
    }

    // Get doctors for each group
    const groupsWithDoctors = await Promise.all(
      groups.map(async (group) => {
        const { data: doctors, error: doctorsError } = await supabase
          .from("treatment_group_doctors")
          .select(`
            doctor_id,
            is_primary,
            assigned_at,
            doctors!inner(
              id,
              name,
              email,
              phone
            )
          `)
          .eq("treatment_group_id", group.id);

        if (doctorsError) {
          console.error("[TREATMENT GROUPS LIST] Doctors error:", doctorsError);
          return { ...group, doctors: [] };
        }

        return {
          ...group,
          doctors: doctors.map(d => ({
            id: d.doctor_id,
            name: d.doctors.name,
            email: d.doctors.email,
            phone: d.doctors.phone,
            is_primary: d.is_primary,
            assigned_at: d.assigned_at
          }))
        };
      })
    );

    res.json({
      ok: true,
      data: groupsWithDoctors
    });

  } catch (error) {
    console.error("[TREATMENT GROUPS LIST] Error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

/* ================= ADMIN ASSIGN DOCTOR TO TREATMENT GROUP ================= */
app.post("/api/admin/treatment-groups/:groupId/assign-doctor", adminAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { doctor_id, is_primary = false } = req.body;

    if (!doctor_id) {
      return res.status(400).json({
        ok: false,
        error: "doctor_id is required"
      });
    }

    const adminId = req.admin.adminId || req.admin.id;

    // Check if group exists
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({
        ok: false,
        error: "Treatment group not found"
      });
    }

    // If setting as primary, unset other primary assignments
    if (is_primary) {
      await supabase
        .from("treatment_group_doctors")
        .update({ is_primary: false })
        .eq("treatment_group_id", groupId);
    }

    // Create assignment
    const { data, error } = await supabase
      .from("treatment_group_doctors")
      .upsert({
        treatment_group_id: groupId,
        doctor_id,
        is_primary,
        assigned_by: adminId
      }, {
        onConflict: "treatment_group_id,doctor_id"
      })
      .select();

    if (error) {
      console.error("[ASSIGN DOCTOR] Error:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to assign doctor to treatment group",
        details: error.message
      });
    }

    res.json({
      ok: true,
      message: "Doctor assigned to treatment group successfully",
      data
    });

  } catch (error) {
    console.error("[ASSIGN DOCTOR] Error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

/* ================= ADMIN REMOVE DOCTOR FROM TREATMENT GROUP ================= */
app.delete("/api/admin/treatment-groups/:groupId/remove-doctor", adminAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { doctor_id } = req.body || {};

    if (!doctor_id) {
      return res.status(400).json({
        ok: false,
        error: "doctor_id is required"
      });
    }

    const { error } = await supabase
      .from("treatment_group_doctors")
      .delete()
      .eq("treatment_group_id", groupId)
      .eq("doctor_id", doctor_id);

    if (error) {
      console.error("[REMOVE DOCTOR] Error:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to remove doctor from treatment group",
        details: error.message
      });
    }

    res.json({
      ok: true,
      message: "Doctor removed from treatment group successfully"
    });

  } catch (error) {
    console.error("[REMOVE DOCTOR] Error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: error.message
    });
  }
});

/* ================= ADMIN CANCEL TREATMENT GROUP ================= */
app.post("/api/admin/treatment-groups/:groupId/cancel", adminAuth, async (req, res) => {
  try {
    const { groupId } = req.params;

    // Set all treatments in group to CANCELLED
    const { error } = await supabase
      .from("treatments")
      .update({ status: "CANCELLED" })
      .eq("treatment_group_id", groupId);

    if (error) {
      console.error("[CANCEL GROUP] Error:", error);
      return res.status(500).json({
        ok: false,
        error: "Failed to cancel treatment group",
        details: error.message
      });
    }

    // The calculated_status will automatically update to CANCELLED via trigger

    res.json({
      ok: true,
      message: "Treatment group cancelled successfully"
    });

  } catch (error) {
    console.error("[CANCEL GROUP] Error:", error);
    res.status(500).json({
      ok: false,
      error: "Internal server error",
      details: error.message
    });
  }
});
