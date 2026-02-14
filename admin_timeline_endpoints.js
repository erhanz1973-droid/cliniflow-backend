/* ================= ADMIN TIMELINE ================= */
app.get("/api/admin/timeline", adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin.clinicId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    console.log("[ADMIN TIMELINE] Request:", { clinicId, limit, offset });

    // Fetch timeline events with details
    const { data: events, error } = await supabase
      .from("admin_timeline_events")
      .select(`
        id,
        type,
        reference_id,
        message,
        details,
        created_at,
        created_by
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[ADMIN TIMELINE] Error:", error);
      return res.status(500).json({
        ok: false,
        error: "failed_to_fetch_timeline"
      });
    }

    // Format events for UI
    const formattedEvents = (events || []).map(event => {
      const details = event.details || {};
      
      // Format relative time
      const createdAt = new Date(event.created_at);
      const now = new Date();
      const diffMs = now - createdAt;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let relativeTime;
      if (diffMins < 1) {
        relativeTime = "Just now";
      } else if (diffMins < 60) {
        relativeTime = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      } else if (diffHours < 24) {
        relativeTime = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        relativeTime = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      }

      // Format event based on type
      let icon, title, subtitle;
      
      switch (event.type) {
        case "TREATMENT_GROUP_CREATED":
          icon = "🟢";
          title = "Treatment Group Created";
          subtitle = `Group: ${details.group_name || 'Unknown'} | Patient: ${details.patient_name || 'Unknown'} | Doctor: ${details.primary_doctor_name || 'Unknown'}`;
          break;
        
        case "DOCTOR_ASSIGNED":
          icon = "👨‍⚕️";
          title = "Doctor Assigned";
          subtitle = `Doctor: ${details.doctor_name || 'Unknown'} | Group: ${details.group_name || 'Unknown'}`;
          break;
        
        case "TASK_ESCALATED":
          icon = "⚠️";
          title = "Task Escalated";
          subtitle = `Task: ${details.task_title || 'Unknown'} | Escalated to: ${details.escalated_to || 'Unknown'}`;
          break;
        
        case "TREATMENT_COMPLETED":
          icon = "✅";
          title = "Treatment Completed";
          subtitle = `Patient: ${details.patient_name || 'Unknown'} | Treatment: ${details.treatment_type || 'Unknown'}`;
          break;
        
        default:
          icon = "📝";
          title = event.message || "System Event";
          subtitle = JSON.stringify(details, null, 2);
      }

      return {
        id: event.id,
        type: event.type,
        reference_id: event.reference_id,
        icon,
        title,
        subtitle,
        message: event.message,
        details,
        created_at: event.created_at,
        relative_time: relativeTime,
        created_by: event.created_by
      };
    });

    console.log(`[ADMIN TIMELINE] Fetched ${formattedEvents.length} events for clinic ${clinicId}`);

    res.json({
      ok: true,
      events: formattedEvents,
      pagination: {
        limit,
        offset,
        has_more: events && events.length === limit
      }
    });

  } catch (err) {
    console.error("[ADMIN TIMELINE] Fatal error:", err);
    res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

/* ================= ADMIN TIMELINE CREATE EVENT ================= */
app.post("/api/admin/timeline/events", adminAuth, async (req, res) => {
  try {
    const {
      type,
      reference_id,
      message,
      details
    } = req.body;

    const clinicId = req.admin.clinicId;
    const adminId = req.admin.adminId || req.admin.id;

    if (!type || !message) {
      return res.status(400).json({
        ok: false,
        error: "missing_required_fields",
        details: "type and message are required"
      });
    }

    // Create timeline event
    const { data: event, error } = await supabase
      .from("admin_timeline_events")
      .insert({
        clinic_id: clinicId,
        type,
        reference_id,
        message,
        details,
        created_by: adminId
      })
      .select()
      .single();

    if (error) {
      console.error("[ADMIN TIMELINE CREATE EVENT] Error:", error);
      return res.status(500).json({
        ok: false,
        error: "failed_to_create_event",
        details: error.message
      });
    }

    console.log("[ADMIN TIMELINE CREATE EVENT] Event created:", event.id);

    res.json({
      ok: true,
      event
    });

  } catch (err) {
    console.error("[ADMIN TIMELINE CREATE EVENT] Fatal error:", err);
    res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});
