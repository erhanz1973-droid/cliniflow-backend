// routes/admin/clinic.js
// Mounted at: app.use('/api/admin', adminClinicRouter)
// Covers: GET/PUT /api/admin/clinic, GET /api/admin/events,
//         GET /api/admin/stats, GET/POST /api/admin/timeline[/events]

const path = require('path');
const express = require('express');
const jwt     = require('jsonwebtoken');
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
const { supabase }  = require(appPath('lib', 'supabase'));
const { adminAuth } = require(appPath('admin-auth-middleware.js'));

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/* ================= ADMIN STATS ================= */
// Original location: index.cjs line 2661
// NOTE: This route does its own inline JWT verification (not adminAuth middleware).
router.get('/stats', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }

    // Get current month and year
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate monthly patients
    const { data: monthlyPatients, error: patientsError } = await supabase
      .from("patients")
      .select("*")
      .eq("status", "ACTIVE")
      .gte("created_at", new Date(currentYear, currentMonth, 1).toISOString())
      .lt("created_at", new Date(currentYear, currentMonth + 1, 1).toISOString());

    // Calculate monthly treatments
    const { data: monthlyTreatments, error: treatmentsError } = await supabase
      .from("treatments")
      .select("*")
      .gte("created_at", new Date(currentYear, currentMonth, 1).toISOString())
      .lt("created_at", new Date(currentYear, currentMonth + 1, 1).toISOString());

    // Get last 6 months data
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const month = new Date(currentYear, currentMonth - i, 1);
      const monthName = month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const monthEnd   = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();

      const { data: monthPatients } = await supabase
        .from("patients")
        .select("*")
        .eq("status", "ACTIVE")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      const { data: monthTreatments } = await supabase
        .from("treatments")
        .select("*")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      monthlyData.push({
        month: monthName,
        patients:   monthPatients?.length  || 0,
        treatments: monthTreatments?.length || 0
      });
    }

    res.json({
      ok: true,
      monthlyPatients:   monthlyPatients?.length  || 0,
      monthlyTreatments: monthlyTreatments?.length || 0,
      monthlyData
    });

  } catch (err) {
    console.error("[ADMIN STATS] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN CLINIC (GET) ================= */
// Original location: index.cjs line 3113
router.get('/clinic', adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.admin?.clinicId
    const clinicId = req.admin?.clinicId;

    // 🔥 CRITICAL: Add undefined guard
    if (!clinicId) {
      console.error("[ADMIN CLINIC] Missing clinicId:", {
        admin: req.admin,
        clinicId: clinicId
      });
      return res.status(400).json({
        ok: false,
        error: "Missing clinicId"
      });
    }

    // 🔥 Debug log
    console.log("[ADMIN CLINIC] clinicId:", clinicId);

    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("id", clinicId)
      .single();

    if (error || !clinic) {
      console.error("[ADMIN CLINIC] Clinic not found:", { clinicId, error });
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

    // Patient count hesapla
    const { count: patientCount, error: countError } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId);

    const currentPatientCount = patientCount || 0;
    const plan = clinic.plan || "FREE";

    // Calculate maxPatients based on plan if not set in database
    // Free: 3, Basic: 10, Pro: unlimited (null)
    let maxPatients = clinic.max_patients;
    if (maxPatients === null || maxPatients === undefined) {
      if (plan === "FREE") {
        maxPatients = 3;
      } else if (plan === "BASIC") {
        maxPatients = 10;
      } else if (plan === "PRO") {
        maxPatients = null; // Unlimited
      } else {
        maxPatients = 3; // Default to FREE plan limit
      }
    }

    // Branding bilgilerini parse et (JSONB)
    // Only Pro plan can customize branding
    const branding = clinic.branding || {};
    const isPro = plan === "PRO";
    const brandingTitle   = isPro ? (branding.title   || clinic.name       || "") : "";
    const brandingLogoUrl = isPro ? (branding.logoUrl  || clinic.logo_url  || "") : "";
    const showPoweredBy   = !isPro; // Free and Basic always show "Powered by Clinicator"

    // Şifre hash'ini döndürme
    const { password_hash, ...clinicData } = clinic;

    res.json({
      ok: true,
      clinicCode: clinic.clinic_code,
      name:       clinic.name,
      address:    clinic.address || "",
      phone:      clinic.phone   || "",
      email:      clinic.email   || "",
      website:    clinic.website || "",
      logoUrl:    clinic.logo_url || "",
      googleMapsUrl: clinic.google_maps_url || "",
      defaultInviterDiscountPercent: clinic.default_inviter_discount_percent,
      defaultInvitedDiscountPercent: clinic.default_invited_discount_percent,
      clinicType:     clinic.clinic_type     || "DENTAL",
      enabledModules: clinic.enabled_modules || [],
      plan: plan,
      maxPatients: maxPatients,
      currentPatientCount: currentPatientCount,
      branding: {
        title:          brandingTitle,
        logoUrl:        brandingLogoUrl,
        showPoweredBy:  showPoweredBy,
        primaryColor:   isPro ? (branding.primaryColor   || "") : "",
        secondaryColor: isPro ? (branding.secondaryColor || "") : "",
        welcomeMessage: isPro ? (branding.welcomeMessage || "") : "",
      },
      updatedAt: clinic.updated_at ? new Date(clinic.updated_at).getTime() : null,
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Get clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN EVENTS (GET) ================= */
// Original location: index.cjs line 3214
// Supports optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD for the schedule page.
// When a date range is given all events in that range are returned flat in `upcoming`;
// overdue/today are empty so the schedule page's frontend filter works correctly.
router.get('/events', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin.clinicId;
    console.log('[EVENTS] CLINIC ID:', clinicId);

    if (!clinicId) {
      console.warn('[EVENTS] Missing clinicId');
      return res.json({ ok: true, overdue: [], today: [], upcoming: [] });
    }

    // Date-range mode (used by admin-schedule.html)
    const { startDate, endDate } = req.query;
    const rangeMode = !!(startDate && endDate);
    let rangeStart = null, rangeEnd = null;
    if (rangeMode) {
      rangeStart = new Date(startDate + 'T00:00:00.000Z').getTime();
      rangeEnd   = new Date(endDate   + 'T23:59:59.999Z').getTime();
      if (isNaN(rangeStart) || isNaN(rangeEnd)) {
        return res.status(400).json({ ok: false, error: 'invalid_date_range' });
      }
    }

    // 1. Get all patients for this clinic (no role filter — avoids column-not-found errors)
    let patients = [];
    {
      const { data, error: pErr } = await supabase
        .from('patients')
        .select('id, patient_id, name')
        .eq('clinic_id', clinicId);

      if (pErr) {
        console.error('[EVENTS] patients fetch error:', pErr.message, pErr.code);
        return res.status(500).json({ ok: false, error: 'db_error', detail: pErr.message });
      }
      patients = data || [];
    }

    console.log(`[EVENTS] Found ${patients?.length ?? 0} patients`);

    // Normalise Supabase timestamp format to proper ISO 8601 so Date.parse works everywhere
    // e.g. "2026-02-13 11:17:00.111+00" → "2026-02-13T11:17:00.111+00:00"
    const normalizeTs = (val) => {
      if (!val) return null;
      // Handle Unix timestamp (number or numeric string like "1742720400000")
      const num = typeof val === 'number' ? val : (typeof val === 'string' && /^\d{10,13}$/.test(val.trim()) ? Number(val) : NaN);
      if (!isNaN(num)) {
        const ms = num > 1e12 ? num : num * 1000; // seconds → ms if needed
        return new Date(ms).toISOString();
      }
      // Handle Supabase non-standard format: "2026-03-23 10:00:00+00" → ISO
      return String(val).replace(' ', 'T').replace(/\+00$/, '+00:00');
    };

    const patientIds = (patients || []).map(p => p.id);
    if (!patientIds.length) {
      return res.json({ ok: true, overdue: [], today: [], upcoming: [] });
    }

    // Build lookups: UUID → display name, UUID → TEXT patient_id (for nav URLs)
    const nameMap = {};
    const textIdMap = {};   // UUID → TEXT external patient_id
    (patients || []).forEach(p => {
      nameMap[p.id]   = p.name || p.patient_id || '—';
      textIdMap[p.id] = p.patient_id || p.id;   // prefer TEXT id for navigation
    });

    // 3. Pull scheduled procedures for all clinic patients
    //    Try multiple select clauses to handle schema variations gracefully
    const allEvents = [];
    const DONE_STATUSES = new Set(['DONE', 'COMPLETED', 'CANCELLED', 'done', 'completed', 'cancelled']);

    const procedureSelectCandidates = [
      'id, patient_id, title, procedure_name, tooth_number, scheduled_date, due_date, status, created_at',
      'id, patient_id, title, procedure_name, tooth_number, scheduled_date, status, created_at',
      'id, patient_id, title, procedure_name, scheduled_date, status, created_at',
      'id, patient_id, title, status, created_at',
    ];

    let procRows = [];
    for (const selectClause of procedureSelectCandidates) {
      // Batch by 50 patient IDs to stay within URL length limits
      let ok = true;
      const tmp = [];
      for (let i = 0; i < patientIds.length; i += 50) {
        const chunk = patientIds.slice(i, i + 50);
        const { data, error } = await supabase
          .from('procedures')
          .select(selectClause)
          .in('patient_id', chunk)
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) {
          const code = String(error.code || '');
          if (['42703', 'PGRST204', 'PGRST200', 'PGRST201', '42P01'].includes(code)) {
            ok = false; break; // try next select clause
          }
          console.error('[EVENTS] procedures fetch error:', error.message);
          ok = false; break;
        }
        if (data) tmp.push(...data);
      }
      if (ok) { procRows = tmp; break; }
    }

    procRows.forEach(p => {
      if (DONE_STATUSES.has(String(p.status || ''))) return;
      const dateStr = normalizeTs(p.scheduled_date || p.due_date || p.created_at || null);
      if (!dateStr) return;
      const uuidKey = p.patient_id;
      allEvents.push({
        id:          String(p.id),
        title:       p.title || p.procedure_name || 'Procedure',
        timelineAt:  dateStr,
        type:        'TREATMENT',
        status:      String(p.status || '').toUpperCase(),
        toothId:     p.tooth_number || null,
        patientId:   textIdMap[uuidKey] || uuidKey,   // TEXT id for URL nav
        patientName: nameMap[uuidKey] || '—',
      });
    });

    // 4. Pull treatments from treatments_v2 (main treatments table)
    //    Try with status column first; fall back without it if column missing.
    {
      const tv2SelectCandidates = [
        'id, patient_id, created_at, status, treatment_items_v2(procedure_code, description)',
        'id, patient_id, created_at, treatment_items_v2(procedure_code, description)',
        'id, patient_id, created_at',
      ];
      for (const tv2Select of tv2SelectCandidates) {
        let tv2Ok = true;
        const tv2All = [];
        for (let i = 0; i < patientIds.length; i += 50) {
          const chunk = patientIds.slice(i, i + 50);
          const { data: tv2Rows, error: tv2Err } = await supabase
            .from('treatments_v2')
            .select(tv2Select)
            .in('patient_id', chunk)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: false })
            .limit(200);
          if (tv2Err) {
            const c = String(tv2Err.code || '');
            if (['42703', 'PGRST204', 'PGRST200', 'PGRST201', '42P01'].includes(c)) {
              tv2Ok = false; break; // try next select clause
            }
            console.warn('[EVENTS] treatments_v2 fetch error:', tv2Err.message);
            tv2Ok = false; break;
          }
          if (tv2Rows) tv2All.push(...tv2Rows);
        }
        if (tv2Ok) {
          tv2All.forEach(t => {
            if (DONE_STATUSES.has(String(t.status || ''))) return;
            const items = Array.isArray(t.treatment_items_v2) ? t.treatment_items_v2 : [];
            const title = items[0]?.description || items[0]?.procedure_code || 'Treatment';
            const uuidKey = t.patient_id;
            allEvents.push({
              id:          String(t.id),
              title,
              timelineAt:  normalizeTs(t.created_at),
              type:        'TREATMENT',
              status:      String(t.status || 'PLANNED').toUpperCase(),
              patientId:   textIdMap[uuidKey] || uuidKey,
              patientName: nameMap[uuidKey] || '—',
            });
          });
          break; // success — no need to try next clause
        }
      }
    }

    const countAfterStep4 = allEvents.length;
    console.log(`[EVENTS] After procedures+treatments_v2: ${countAfterStep4} events`);

    // 5. Pull patient_treatments — both treatment_events list AND teeth[].procedures[].scheduledAt
    //
    // IMPORTANT: patient_treatments.patient_id may store the TEXT external ID (e.g. "KUZ001")
    // rather than the UUID. Build both sets and try UUID first, then TEXT if empty.
    const textPatientIds = (patients || []).map(p => p.patient_id).filter(Boolean);

    // Build reverse lookup: TEXT patient_id → UUID (for nameMap/textIdMap lookups)
    const textToUuid = {};
    (patients || []).forEach(p => { if (p.patient_id) textToUuid[p.patient_id] = p.id; });

    const ptIdSets = [];
    if (patientIds.length)     ptIdSets.push({ ids: patientIds,    keyType: 'uuid' });
    if (textPatientIds.length) ptIdSets.push({ ids: textPatientIds, keyType: 'text' });

    let ptRowsFound = false;
    for (const { ids: ptIds, keyType } of ptIdSets) {
      if (ptRowsFound) break;
      for (let i = 0; i < ptIds.length; i += 50) {
        const chunk = ptIds.slice(i, i + 50);
        // Try with treatment_events first; fall back without it if the column doesn't exist
        let rows = null;
        for (const ptSelect of [
          'patient_id, treatment_events, treatments_data',
          'patient_id, treatments_data',
        ]) {
          const { data: ptData, error: tErr } = await supabase
            .from('patient_treatments')
            .select(ptSelect)
            .in('patient_id', chunk);
          if (tErr) {
            const c = String(tErr.code || '');
            if (['42703', 'PGRST204', 'PGRST200', 'PGRST201'].includes(c)) continue; // retry without column
            console.warn('[EVENTS] patient_treatments fetch error:', tErr.message);
            break;
          }
          rows = ptData;
          break;
        }
        if (!rows || rows.length === 0) continue;

        ptRowsFound = true;
        rows.forEach(row => {
          // Resolve UUID key for nameMap/textIdMap regardless of which id type we queried
          const rawKey  = row.patient_id;
          const uuidKey = keyType === 'text' ? (textToUuid[rawKey] || rawKey) : rawKey;
          const patientIdNav   = textIdMap[uuidKey] || rawKey;
          const patientNameNav = nameMap[uuidKey] || '—';

          // 5a. Legacy treatment_events list
          const rawList = Array.isArray(row.treatment_events)
            ? row.treatment_events
            : (Array.isArray(row.treatments_data?.events) ? row.treatments_data.events : []);
          rawList.forEach(evt => {
            if (!evt || (!evt.date && !evt.timelineAt)) return;
            if (DONE_STATUSES.has(String(evt.status || ''))) return;
            const dateStr = normalizeTs(evt.timelineAt || evt.date);
            if (!dateStr) return;
            allEvents.push({
              id:          evt.id || `ev_${Math.random().toString(36).slice(2)}`,
              title:       evt.title || evt.type || 'Event',
              timelineAt:  dateStr,
              type:        String(evt.type || 'TREATMENT').toUpperCase(),
              status:      String(evt.status || '').toUpperCase(),
              patientId:   patientIdNav,
              patientName: patientNameNav,
            });
          });

          // 5b. Procedures inside treatments_data.teeth[].procedures[]
          const teeth = Array.isArray(row.treatments_data?.teeth) ? row.treatments_data.teeth : [];
          teeth.forEach(tooth => {
            const procs = Array.isArray(tooth?.procedures) ? tooth.procedures : [];
            procs.forEach(proc => {
              const dateStr = normalizeTs(proc.scheduledAt || proc.scheduled_at || proc.createdAt || proc.created_at || null);
              if (!dateStr) return;
              if (DONE_STATUSES.has(String(proc.status || '').toUpperCase())) return;
              const procType  = String(proc.type || proc.procedureType || proc.code || 'TREATMENT').toUpperCase();
              const toothNum  = tooth.toothId || tooth.tooth_id || tooth.id || null;
              const toothLabel = toothNum ? `Diş ${toothNum}` : '';
              const procLabel  = proc.name || proc.description || proc.type || procType;
              allEvents.push({
                id:          proc.id || `pt_${uuidKey}_${toothNum}_${Math.random().toString(36).slice(2)}`,
                title:       toothLabel ? `${toothLabel} • ${procLabel}` : procLabel,
                timelineAt:  dateStr,
                type:        'TREATMENT',
                status:      String(proc.status || 'PLANNED').toUpperCase(),
                toothId:     toothNum ? String(toothNum) : null,
                patientId:   patientIdNav,
                patientName: patientNameNav,
              });
            });
          });
        }); // rows.forEach
      } // for chunk (inner)
    } // for ptIdSets (outer)

    console.log(`[EVENTS] After patient_treatments: ${allEvents.length} events (added ${allEvents.length - countAfterStep4})`);

    // 5. Categorise by date
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd   = todayStart + 86400000 - 1;

    const overdue  = [];
    const today    = [];
    const upcoming = [];

    const byTime = (a, b) => Date.parse(a.timelineAt) - Date.parse(b.timelineAt);

    if (rangeMode) {
      // Date-range mode: return ALL events within the requested range (used by schedule page)
      allEvents.forEach(evt => {
        const ts = Date.parse(evt.timelineAt);
        if (isNaN(ts)) return;
        if (evt.status === 'CANCELLED') return;
        if (ts >= rangeStart && ts <= rangeEnd) upcoming.push(evt);
      });
      upcoming.sort(byTime);
      console.log(`[EVENTS] Range ${startDate}→${endDate}: ${upcoming.length} events`);
    } else {
      // Normal dashboard mode: split into overdue / today / upcoming
      allEvents.forEach(evt => {
        const ts = Date.parse(evt.timelineAt);
        if (isNaN(ts)) return;
        const status = evt.status;
        if (status === 'CANCELLED') return;
        if (ts < todayStart)     overdue.push(evt);
        else if (ts <= todayEnd) today.push(evt);
        else if (status !== 'DONE' && status !== 'COMPLETED') upcoming.push(evt);
      });
      overdue.sort(byTime);
      today.sort(byTime);
      upcoming.sort(byTime);
      console.log(`[EVENTS] Final — overdue:${overdue.length} today:${today.length} upcoming:${upcoming.length}`);
    }

    res.json({ ok: true, overdue, today, upcoming });
  } catch (err) {
    console.error('[EVENTS] crash:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* ================= ADMIN CLINIC (PUT) ================= */
// Original location: index.cjs line 3219
router.put('/clinic', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    console.log("[UPDATE CLINIC] Received body:", JSON.stringify(body, null, 2));
    console.log("[UPDATE CLINIC] Clinic ID:", req.admin?.clinicId);

    // Get current clinic to check plan
    const { data: currentClinic, error: currentClinicError } = await supabase
      .from("clinics")
      .select("plan, branding")
      .eq("id", req.admin?.clinicId)
      .single();

    if (currentClinicError || !currentClinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

    const currentPlan     = String(currentClinic.plan     || "FREE").trim().toUpperCase();
    const isPro           = currentPlan === "PRO";
    const currentBranding = currentClinic.branding || {};

    const updateData = {
      name:          body.name,
      address:       body.address,
      phone:         body.phone,
      email:         body.email,
      website:       body.website,
      logo_url:      body.logoUrl,
      google_maps_url:                    body.googleMapsUrl,
      default_inviter_discount_percent:   body.defaultInviterDiscountPercent,
      default_invited_discount_percent:   body.defaultInvitedDiscountPercent,
    };

    // Add clinicType and enabledModules if provided (only DENTAL supported)
    if (body.clinicType) {
      const requestedType = String(body.clinicType).toUpperCase();
      if (requestedType === "DENTAL") {
        updateData.clinic_type = "DENTAL";
      }
      // HAIR type is no longer supported, ignore if provided
    }
    if (Array.isArray(body.enabledModules)) {
      updateData.enabled_modules = body.enabledModules;
    }

    // Add plan and maxPatients if provided
    if (body.plan) {
      const validPlans = ["FREE", "BASIC", "PRO"];
      if (validPlans.includes(String(body.plan).toUpperCase())) {
        const newPlan = String(body.plan).toUpperCase();
        updateData.plan = newPlan;
        // Update maxPatients based on plan: Free=3, Basic=10, Pro=unlimited
        updateData.max_patients = newPlan === "FREE" ? 3 : (newPlan === "BASIC" ? 10 : null);

        // Branding: Only Pro can customize. Free and Basic always show standard Clinicator branding
        if (newPlan !== "PRO") {
          // Reset branding for Free/Basic plans
          updateData.branding = {
            title: "",
            logoUrl: "",
            showPoweredBy: true, // Always show "Powered by Clinicator" for Free/Basic
          };
        }
      }
    }

    // Branding update: Only PRO clinics can set branding
    if (body.branding !== undefined || body.clinicName !== undefined || body.clinicLogoUrl !== undefined) {
      if (!isPro) {
        return res.status(403).json({
          ok: false,
          error: "BRANDING_NOT_ALLOWED",
          plan: currentPlan,
          message: "Branding customization is only available for PRO plan clinics. Please upgrade to PRO to customize branding."
        });
      }

      // Update branding for PRO clinics
      const newBranding = {
        ...currentBranding,
        title:          body.clinicName     !== undefined ? String(body.clinicName     || "").trim() : (body.branding?.title    !== undefined ? String(body.branding.title    || "").trim() : currentBranding.title    || ""),
        logoUrl:        body.clinicLogoUrl  !== undefined ? String(body.clinicLogoUrl  || "").trim() : (body.branding?.logoUrl  !== undefined ? String(body.branding.logoUrl  || "").trim() : currentBranding.logoUrl  || ""),
        showPoweredBy:  body.branding?.showPoweredBy  !== undefined ? !!body.branding.showPoweredBy  : (currentBranding.showPoweredBy  !== undefined ? currentBranding.showPoweredBy  : false),
        primaryColor:   body.branding?.primaryColor   !== undefined ? String(body.branding.primaryColor   || "").trim() : (currentBranding.primaryColor   || ""),
        secondaryColor: body.branding?.secondaryColor !== undefined ? String(body.branding.secondaryColor || "").trim() : (currentBranding.secondaryColor || ""),
        welcomeMessage: body.branding?.welcomeMessage !== undefined ? String(body.branding.welcomeMessage || "").trim() : (currentBranding.welcomeMessage || ""),
      };

      updateData.branding = newBranding;
      console.log("[UPDATE CLINIC] Updating branding for PRO clinic:", newBranding);
    }

    // Get current clinic to check plan before updating
    const { data: currentClinicForBranding, error: currentClinicErrorForBranding } = await supabase
      .from("clinics")
      .select("plan, branding")
      .eq("id", req.admin?.clinicId)
      .single();

    const currentPlanForBranding = (updateData.plan || currentClinicForBranding?.plan || "FREE").toUpperCase();
    const isProForBranding       = currentPlanForBranding === "PRO";
    const currentBrandingData    = currentClinicForBranding?.branding || {};

    // Branding update: Only PRO clinics can set branding
    // Support both body.branding object and direct clinicName/clinicLogoUrl fields
    if (body.branding !== undefined || body.clinicName !== undefined || body.clinicLogoUrl !== undefined) {
      if (!isProForBranding) {
        return res.status(403).json({
          ok: false,
          error: "BRANDING_NOT_ALLOWED",
          plan: currentPlanForBranding,
          message: "Branding customization is only available for PRO plan clinics. Please upgrade to PRO to customize branding."
        });
      }

      // Update branding for PRO clinics
      const newBranding = {
        ...currentBrandingData,
        title:          body.clinicName     !== undefined ? String(body.clinicName     || "").trim() : (body.branding?.title    !== undefined ? String(body.branding.title    || "").trim() : currentBrandingData.title    || ""),
        logoUrl:        body.clinicLogoUrl  !== undefined ? String(body.clinicLogoUrl  || "").trim() : (body.branding?.logoUrl  !== undefined ? String(body.branding.logoUrl  || "").trim() : currentBrandingData.logoUrl  || ""),
        showPoweredBy:  body.branding?.showPoweredBy  !== undefined ? !!body.branding.showPoweredBy  : (currentBrandingData.showPoweredBy  !== undefined ? currentBrandingData.showPoweredBy  : false),
        primaryColor:   body.branding?.primaryColor   !== undefined ? String(body.branding.primaryColor   || "").trim() : (currentBrandingData.primaryColor   || ""),
        secondaryColor: body.branding?.secondaryColor !== undefined ? String(body.branding.secondaryColor || "").trim() : (currentBrandingData.secondaryColor || ""),
        welcomeMessage: body.branding?.welcomeMessage !== undefined ? String(body.branding.welcomeMessage || "").trim() : (currentBrandingData.welcomeMessage || ""),
      };

      updateData.branding = newBranding;
      // Also update logo_url if clinicLogoUrl is provided (for backward compatibility)
      if (body.clinicLogoUrl !== undefined || body.branding?.logoUrl !== undefined) {
        updateData.logo_url = newBranding.logoUrl;
      }
      console.log("[UPDATE CLINIC] Updating branding for PRO clinic:", newBranding);
    }

    // Null değerleri temizle
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    console.log("[UPDATE CLINIC] Update data:", JSON.stringify(updateData, null, 2));

    const { data: updatedClinic, error } = await supabase
      .from("clinics")
      .update(updateData)
      .eq("id", req.admin?.clinicId)
      .select()
      .single();

    if (error) {
      console.error("[UPDATE CLINIC] Supabase update error:", error);
      return res.status(500).json({ ok: false, error: "update_failed", details: error.message });
    }

    console.log("[UPDATE CLINIC] Successfully updated:", updatedClinic.clinic_code);

    // Patient count hesapla
    const { count: patientCount, error: countError } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", req.admin?.clinicId);

    const currentPatientCount = patientCount || 0;
    const finalPlan = String(updatedClinic.plan || "FREE").trim().toUpperCase();

    // Calculate maxPatients based on plan if not set in database
    // Free: 3, Basic: 10, Pro: unlimited (null)
    let maxPatients = updatedClinic.max_patients;
    if (maxPatients === null || maxPatients === undefined) {
      if (finalPlan === "FREE") {
        maxPatients = 3;
      } else if (finalPlan === "BASIC") {
        maxPatients = 10;
      } else if (finalPlan === "PRO") {
        maxPatients = null; // Unlimited
      } else {
        maxPatients = 3; // Default to FREE plan limit
      }
    }

    // Branding bilgilerini parse et (JSONB)
    // Only Pro plan can customize branding
    const branding = updatedClinic.branding || {};
    const responseIsPro   = finalPlan === "PRO";
    const brandingTitle   = responseIsPro ? (branding.title   || updatedClinic.name      || "") : "";
    const brandingLogoUrl = responseIsPro ? (branding.logoUrl  || updatedClinic.logo_url || "") : "";
    const showPoweredBy   = !responseIsPro; // Free and Basic always show "Powered by Clinicator"

    const { password_hash, ...clinicData } = updatedClinic;

    res.json({
      ok: true,
      clinic: {
        clinicCode:    updatedClinic.clinic_code,
        name:          updatedClinic.name,
        address:       updatedClinic.address  || "",
        phone:         updatedClinic.phone    || "",
        email:         updatedClinic.email    || "",
        website:       updatedClinic.website  || "",
        logoUrl:       updatedClinic.logo_url || "",
        googleMapsUrl: updatedClinic.google_maps_url || "",
        defaultInviterDiscountPercent: updatedClinic.default_inviter_discount_percent,
        defaultInvitedDiscountPercent: updatedClinic.default_invited_discount_percent,
        clinicType:     updatedClinic.clinic_type     || "DENTAL",
        enabledModules: updatedClinic.enabled_modules || [],
        plan: finalPlan,
        maxPatients: maxPatients,
        currentPatientCount: currentPatientCount,
        branding: {
          title:          brandingTitle,
          logoUrl:        brandingLogoUrl,
          showPoweredBy:  showPoweredBy,
          primaryColor:   responseIsPro ? (branding.primaryColor   || "") : "",
          secondaryColor: responseIsPro ? (branding.secondaryColor || "") : "",
          welcomeMessage: responseIsPro ? (branding.welcomeMessage || "") : "",
        },
        updatedAt: updatedClinic.updated_at ? new Date(updatedClinic.updated_at).getTime() : null,
      },
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Update clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TIMELINE (GET) ================= */
// Original location: index.cjs line 14380
router.get('/timeline', adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.admin?.clinicId
    const clinicId = req.admin?.clinicId;
    const limit  = parseInt(req.query.limit)  || 50;
    const offset = parseInt(req.query.offset) || 0;

    // 🔥 CRITICAL: Add undefined guard
    if (!clinicId) {
      console.error("[ADMIN TIMELINE] Missing clinicId:", {
        admin: req.admin,
        clinicId: clinicId
      });
      return res.status(400).json({
        ok: false,
        error: "Missing clinicId"
      });
    }

    console.log("[ADMIN TIMELINE] Request:", { clinicId, limit, offset });

    // 🔥 CRITICAL: Update to new schema
    const { data, error } = await supabase
      .from("admin_timeline_events")
      .select(`
        id,
        event_type,
        entity_type,
        entity_id,
        title,
        description,
        metadata,
        created_by,
        created_at
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[ADMIN TIMELINE] Error:", error);
      return res.status(500).json({
        ok: false,
        error: "failed_to_fetch_timeline",
        details: error.message
      });
    }

    console.log(`[ADMIN TIMELINE] Fetched ${data?.length || 0} events for clinic ${clinicId}`);

    // 🔥 CRITICAL: Return raw data - no formatting needed for new schema
    res.json(data);

  } catch (err) {
    console.error("[ADMIN TIMELINE] Fatal error:", err);
    res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

/* ================= ADMIN TIMELINE CREATE EVENT ================= */
// Original location: index.cjs line 14443
router.post('/timeline/events', adminAuth, async (req, res) => {
  try {
    const {
      type,
      reference_id,
      message,
      details
    } = req.body;

    const clinicId = req.admin.clinicId;
    const adminId  = req.admin.adminId || req.admin.id;

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
        clinic_id:    clinicId,
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

/* ================= ADMIN APPOINTMENTS — helpers ================= */

const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/**
 * Returns true only for strings that match YYYY-MM-DD exactly.
 */
function isValidDateString(value) {
  return typeof value === 'string' && DATE_RE.test(value.trim());
}

/**
 * Converts a YYYY-MM-DD string to a Date at start-of-day (UTC) or end-of-day (UTC).
 * Returns null when the input is invalid or the resulting Date is NaN.
 */
function safeDate(dateStr, endOfDay = false) {
  if (!isValidDateString(dateStr)) return null;
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
  const d = new Date(dateStr.trim() + suffix);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Parses a start/end pair into { start: Date, end: Date }.
 * Returns null when either value is invalid or start > end.
 */
function parseDateRange(startStr, endStr) {
  const start = safeDate(startStr, false);
  const end   = safeDate(endStr,   true);
  if (!start || !end) return null;
  if (start.getTime() > end.getTime()) return null;
  return { start, end };
}

/** Converts a row from the appointments table into the canonical response shape. */
function formatAppointmentRow(r, opts = {}) {
  const patientName = opts.patientName || r.patient_id || '';
  const doctorName  = opts.doctorName  || r.doctor_id  || '';
  const timeStr     = String(r.time || '').trim().padStart(5, '0');
  const startAt     = r.start_at || (r.date && timeStr ? `${r.date}T${timeStr}:00` : null);

  return {
    id:               r.id               || null,
    date:             r.date             || null,
    time:             r.time             || null,
    startAt,
    start_at:         r.start_at         || null,
    end_at:           r.end_at           || null,
    endAt:            r.end_at           || null,
    status:           String(r.status    || 'SCHEDULED').toUpperCase(),
    treatment:        r.procedure        || '',
    duration_minutes: Number(r.duration_minutes) || 0,
    break_minutes:    Number(r.break_minutes)    || 0,
    chair:            r.chair || r.chair_no      || '',
    doctor:           doctorName,
    doctor_id:        r.doctor_id        || '',
    patient:          patientName,
    patient_id:       r.patient_id       || '',
    notes:            r.notes            || '',
  };
}

/* ================= ADMIN APPOINTMENTS ================= */
// Accepts: ?date=YYYY-MM-DD  OR  ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Defaults to today when no parameters are supplied.
router.get('/appointments', adminAuth, async (req, res) => {
  // ── 1. Auth guard ─────────────────────────────────────────────────────────
  const clinicId = req.admin?.clinicId;
  if (!clinicId) {
    return res.status(400).json({ ok: false, error: 'missing_clinic_id' });
  }

  // ── 2. Parse & validate date parameters ───────────────────────────────────
  const { date, startDate, endDate } = req.query;

  let dateFrom = '';  // YYYY-MM-DD string used for Supabase range filter
  let dateTo   = '';

  if (date !== undefined) {
    if (!isValidDateString(date)) {
      return res.status(400).json({ ok: false, error: 'invalid_date', detail: '?date must be YYYY-MM-DD' });
    }
    dateFrom = dateTo = date.trim();

  } else if (startDate !== undefined || endDate !== undefined) {
    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      return res.status(400).json({ ok: false, error: 'invalid_date_range', detail: '?startDate and ?endDate must both be YYYY-MM-DD' });
    }
    const range = parseDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ ok: false, error: 'invalid_date_range', detail: 'startDate must be <= endDate' });
    }
    dateFrom = startDate.trim();
    dateTo   = endDate.trim();

  } else {
    // Default: today in UTC
    const today = new Date().toISOString().split('T')[0];
    dateFrom = dateTo = today;
  }

  // ── 3. Query with joins ────────────────────────────────────────────────────
  let rows = null;
  let usedJoin = false;

  try {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, date, time, start_at, end_at, status, procedure,
        duration_minutes, break_minutes, chair, chair_no,
        doctor_id, patient_id, notes,
        patients ( id, name, patient_id ),
        doctors  ( id, name, full_name )
      `)
      .eq('clinic_id', clinicId)
      .neq('status', 'cancelled')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.warn('[ADMIN APPOINTMENTS] join query error:', error.code, error.message);
    } else {
      rows = data;
      usedJoin = true;
    }
  } catch (joinErr) {
    console.warn('[ADMIN APPOINTMENTS] join query threw:', joinErr?.message);
  }

  // ── 4. Bare fallback when join fails ──────────────────────────────────────
  if (!usedJoin) {
    try {
      const { data: bare, error: bareErr } = await supabase
        .from('appointments')
        .select('id, date, time, start_at, end_at, status, procedure, duration_minutes, break_minutes, chair, chair_no, doctor_id, patient_id, notes')
        .eq('clinic_id', clinicId)
        .neq('status', 'cancelled')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (bareErr) {
        const c = String(bareErr.code || '');
        // Table / column not found → degrade gracefully, never 500
        if (['42P01', '42703', 'PGRST205', 'PGRST204', 'PGRST200'].includes(c)) {
          return res.json({ ok: true, appointments: [] });
        }
        console.error('[ADMIN APPOINTMENTS] bare query error:', bareErr.message);
        return res.json({ ok: true, appointments: [] });
      }

      rows = bare;
    } catch (bareThrown) {
      console.error('[ADMIN APPOINTMENTS] bare query threw:', bareThrown?.message);
      return res.json({ ok: true, appointments: [] });
    }
  }

  // ── 5. Shape response ─────────────────────────────────────────────────────
  try {
    const appointments = (rows || []).map(r => {
      const patientName = usedJoin
        ? (r.patients?.name || r.patient_id || '')
        : (r.patient_id || '');
      const doctorName = usedJoin
        ? (r.doctors?.full_name || r.doctors?.name || r.doctor_id || '')
        : (r.doctor_id || '');
      return formatAppointmentRow(r, { patientName, doctorName });
    });

    return res.json({ ok: true, appointments });
  } catch (shapeErr) {
    console.error('[ADMIN APPOINTMENTS] response shaping error:', shapeErr?.message);
    return res.json({ ok: true, appointments: [] });
  }
});

module.exports = router;
