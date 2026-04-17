// routes/admin/treatments.js
// Mounted at: app.use('/api/admin', adminTreatmentsRouter)
// Covers:
//   GET  /api/admin/recent-treatments
//   POST /api/admin/treatments-v2
//   GET  /api/admin/treatments-v2/:patientId
//   POST /api/admin/treatments-v2/:patientId
//   PUT  /api/admin/treatments-v2/:treatmentId
//   DELETE /api/admin/treatments-v2/:treatmentId
//   GET  /api/admin/treatment-prices
//   POST /api/admin/treatment-groups
//   POST /api/admin/treatments
//   POST /api/admin/treatment-groups/:groupId/add-doctor
//   DELETE /api/admin/treatment-groups/:groupId/remove-doctor
//   POST /api/admin/encounters/:id/notes
//   POST /api/admin/fix-treatment-groups-status

const path = require('path');
const express = require('express');
const { randomUUID } = require('crypto');
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
const { adminAuth } = require(appPath('admin-auth-middleware.js'));

// lib/supabase — audit log helper için (non-critical, timeout'ta skip edilir)
let _libSupabase = null;
try { _libSupabase = require(appPath('lib', 'supabase')).supabase; } catch (_) {}

// Route handler'larda app.locals üzerinden index.cjs'in çalışan client'ını al
function getSupabase(req) {
  return req.app.locals.supabase || _libSupabase;
}

const router = express.Router();

/* ================= ENCOUNTER NOTE HELPERS ================= */
// Inlined from index.cjs lines 9226–9555 — logic identical, not rewritten.

const ENCOUNTER_NOTE_EDIT_WINDOW_MS = 5 * 60 * 1000;
const ENCOUNTER_NOTE_EVENT_TYPE = "encounter_note";
const ENCOUNTER_NOTE_FALLBACK_KIND = "encounter_note";
const ENCOUNTER_NOTE_FALLBACK_SOURCE = "events_fallback";

function isMissingRelationError(error) {
  const code = String(error?.code || "");
  return ["PGRST205", "PGRST204", "42P01", "42703"].includes(code);
}

function mapEventRowToEncounterNote(eventRow) {
  const data = eventRow?.data || {};
  return {
    id: String(data?.note_id || eventRow?.id || "").trim(),
    encounter_id: String(data?.encounter_id || "").trim(),
    doctor_id: String(data?.doctor_id || "").trim(),
    content: String(data?.content || "").trim(),
    is_edited: !!data?.is_edited,
    edited_at: data?.edited_at || null,
    edited_by: data?.edited_by || null,
    is_correction: !!data?.is_correction,
    correction_for: data?.correction_for || null,
    author_role: String(data?.author_role || "DOCTOR").toUpperCase(),
    created_at: data?.created_at || eventRow?.created_at || null,
    _storage_source: ENCOUNTER_NOTE_FALLBACK_SOURCE,
    _event_id: eventRow?.id || null,
  };
}

async function resolveEncounterContext(encounterId) {
  const encounterResult = await supabase
    .from("patient_encounters")
    .select("id,patient_id")
    .eq("id", String(encounterId || "").trim())
    .maybeSingle();

  if (encounterResult.error || !encounterResult.data) {
    return { data: null, error: encounterResult.error || new Error("encounter_not_found") };
  }

  const patientId = encounterResult.data?.patient_id || null;
  let clinicId = null;
  if (patientId) {
    const patientResult = await supabase
      .from("patients")
      .select("id,clinic_id")
      .eq("id", patientId)
      .maybeSingle();

    if (!patientResult.error && patientResult.data) {
      clinicId = patientResult.data.clinic_id || null;
    }
  }

  return {
    data: {
      encounter_id: String(encounterResult.data.id || "").trim(),
      patient_id: patientId,
      clinic_id: clinicId,
    },
    error: null,
  };
}

async function fetchEncounterNoteByIdFromEvents(noteId) {
  const normalizedNoteId = String(noteId || "").trim();
  if (!normalizedNoteId) return { data: null, error: null };

  let result = await supabase
    .from("events")
    .select("id,created_at,data")
    .eq("event_type", ENCOUNTER_NOTE_EVENT_TYPE)
    .contains("data", { kind: ENCOUNTER_NOTE_FALLBACK_KIND, note_id: normalizedNoteId })
    .order("created_at", { ascending: false })
    .limit(1);

  if (result.error) {
    const fallbackResult = await supabase
      .from("events")
      .select("id,created_at,data")
      .eq("event_type", ENCOUNTER_NOTE_EVENT_TYPE)
      .order("created_at", { ascending: false })
      .limit(500);

    if (fallbackResult.error) {
      return { data: null, error: fallbackResult.error };
    }

    const matched = (fallbackResult.data || []).find((row) => {
      const data = row?.data || {};
      return data?.kind === ENCOUNTER_NOTE_FALLBACK_KIND && String(data?.note_id || "").trim() === normalizedNoteId;
    });

    return { data: matched ? mapEventRowToEncounterNote(matched) : null, error: null };
  }

  const first = (result.data || [])[0] || null;
  return { data: first ? mapEventRowToEncounterNote(first) : null, error: null };
}

async function createEncounterNoteFromEvents({ encounterId, doctorId, content, isCorrection, correctionFor, authorRole }) {
  const contextResult = await resolveEncounterContext(encounterId);
  if (contextResult.error || !contextResult.data) {
    return { data: null, error: contextResult.error || new Error("encounter_not_found") };
  }

  const nowIso = new Date().toISOString();
  const noteId = randomUUID();
  const noteData = {
    kind: ENCOUNTER_NOTE_FALLBACK_KIND,
    note_id: noteId,
    encounter_id: contextResult.data.encounter_id,
    doctor_id: String(doctorId || "").trim(),
    content: String(content || "").trim(),
    is_edited: false,
    edited_at: null,
    edited_by: null,
    is_correction: !!isCorrection,
    correction_for: correctionFor || null,
    author_role: String(authorRole || "DOCTOR").toUpperCase(),
    created_at: nowIso,
  };

  const eventInsert = await supabase
    .from("events")
    .insert({
      clinic_id: contextResult.data.clinic_id || null,
      patient_id: contextResult.data.patient_id || null,
      event_type: ENCOUNTER_NOTE_EVENT_TYPE,
      data: noteData,
    })
    .select("id,created_at,data")
    .single();

  if (eventInsert.error || !eventInsert.data) {
    return { data: null, error: eventInsert.error || new Error("fallback_note_create_failed") };
  }

  return { data: mapEventRowToEncounterNote(eventInsert.data), error: null };
}

function normalizeEncounterNote(row, actorDoctorKeys = []) {
  const createdAt = String(row?.created_at || "").trim();
  const createdTs = createdAt ? Date.parse(createdAt) : NaN;
  const ageMs = Number.isFinite(createdTs) ? Math.max(0, Date.now() - createdTs) : Number.POSITIVE_INFINITY;
  const noteDoctorId = String(row?.doctor_id || "").trim();
  const canEdit = actorDoctorKeys.includes(noteDoctorId) && ageMs <= ENCOUNTER_NOTE_EDIT_WINDOW_MS;
  const storageSource = String(row?._storage_source || "encounter_notes").trim() || "encounter_notes";

  return {
    id: row?.id,
    encounter_id: row?.encounter_id,
    doctor_id: noteDoctorId,
    content: row?.content || "",
    is_edited: !!row?.is_edited,
    edited_at: row?.edited_at || null,
    edited_by: row?.edited_by || null,
    is_correction: !!row?.is_correction,
    correction_for: row?.correction_for || null,
    author_role: String(row?.author_role || "DOCTOR").toUpperCase(),
    created_at: row?.created_at || null,
    storage_source: storageSource,
    can_edit: canEdit,
    edit_window_seconds_remaining: canEdit
      ? Math.max(0, Math.floor((ENCOUNTER_NOTE_EDIT_WINDOW_MS - ageMs) / 1000))
      : 0,
  };
}

async function logEncounterNoteAudit({ action, noteId, encounterId, actorId, actorRole, metadata }) {
  const payload = {
    note_id: String(noteId || "").trim() || null,
    encounter_id: String(encounterId || "").trim() || null,
    action: String(action || "UNKNOWN").trim().toUpperCase(),
    actor_id: String(actorId || "").trim() || null,
    actor_role: String(actorRole || "DOCTOR").trim().toUpperCase(),
    metadata: metadata || null,
    created_at: new Date().toISOString(),
  };

  const _sb = _libSupabase;
  if (!_sb) return; // audit log optional
  const attempt = await _sb.from("encounter_note_audit_logs").insert(payload);
  if (!attempt.error) return;

  if (isMissingRelationError(attempt.error)) {
    console.warn("[ENCOUNTER NOTES AUDIT] audit table missing, skipping persistent log");
    return;
  }

  console.warn("[ENCOUNTER NOTES AUDIT] insert warning:", attempt.error);
}

/* ================= ADMIN RECENT TREATMENTS ================= */
// Original location: index.cjs line 2296
router.get('/recent-treatments', adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.admin?.clinicId
    const clinicId = req.admin?.clinicId;

    // 🔥 CRITICAL: Add undefined guard
    if (!clinicId) {
      console.error("[RECENT TREATMENTS] Missing clinicId:", {
        admin: req.admin,
        clinicId: clinicId
      });
      return res.status(400).json({
        ok: false,
        error: "Missing clinicId"
      });
    }

    // 🔥 Debug log
    console.log("[RECENT TREATMENTS] clinicId:", clinicId);

    const { data, error } = await supabase
      .from("treatments_v2")
      .select(`
        id,
        type,
        created_at,
        patients:patient_id ( name ),
        doctors:doctor_id ( full_name )
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[RECENT TREATMENTS V2] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json(
      data.map(t => ({
        id: t.id,
        createdAt: t.created_at,
        type: t.type || "Treatment",
        patient: { name: t.patients?.name || "-" },
        doctor: { name: t.doctors?.full_name || "-" }
      }))
    );

  } catch (err) {
    console.error("[RECENT TREATMENTS V2] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN CREATE TREATMENT V2 ================= */
// Original location: index.cjs line 2351
router.post('/treatments-v2', adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.admin?.clinicId
    const clinicId = req.admin?.clinicId;
    const { patient_id, doctor_id, type, notes, items } = req.body;

    if (!patient_id) {
      return res.status(400).json({ ok: false, error: "patient_required" });
    }

    // 🔥 CRITICAL: Log request body for debugging
    console.log("[CREATE TREATMENT V2] REQUEST BODY:", req.body);
    console.log("[CREATE TREATMENT V2] PARSED VALUES:", {
      clinicId,
      patient_id,
      doctor_id,
      type,
      notes,
      items
    });

    // 🔥 CRITICAL: Validate UUID formats
    if (!clinicId || !clinicId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[CREATE TREATMENT V2] Invalid clinicId:", clinicId);
      return res.status(400).json({ ok: false, error: "invalid_clinic_id" });
    }

    if (!patient_id || !patient_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[CREATE TREATMENT V2] Invalid patient_id:", patient_id);
      return res.status(400).json({ ok: false, error: "invalid_patient_id" });
    }

    if (!doctor_id || !doctor_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[CREATE TREATMENT V2] Invalid doctor_id:", doctor_id);
      return res.status(400).json({ ok: false, error: "invalid_doctor_id" });
    }

    // 🔥 CRITICAL: Build payload with explicit values
    const payload = {
      clinic_id: clinicId,
      patient_id: patient_id,
      doctor_id: doctor_id,
      type: type || "general",
      notes: notes || "",
      created_at: new Date().toISOString(), // 🔥 CRITICAL: Explicit created_at
      updated_at: new Date().toISOString()  // 🔥 CRITICAL: Explicit updated_at
    };

    console.log("[CREATE TREATMENT V2] PAYLOAD:", JSON.stringify(payload, null, 2));

    const { data: treatment, error: treatmentError } = await supabase
      .from("treatments_v2")
      .insert([payload]) // 🔥 CRITICAL: Array format
      .select();

    // 🔥 CRITICAL: Log insert results
    console.log("[CREATE TREATMENT V2] INSERT DATA:", JSON.stringify(treatment, null, 2));
    console.log("[CREATE TREATMENT V2] INSERT ERROR:", JSON.stringify(treatmentError, null, 2));

    if (treatmentError) {
      console.error("[CREATE TREATMENT V2] Full Error Details:", {
        message: treatmentError.message,
        details: treatmentError.details,
        hint: treatmentError.hint,
        code: treatmentError.code
      });
      return res.status(500).json({
        ok: false,
        error: treatmentError.message || "creation_failed",
        details: treatmentError
      });
    }

    if (items && items.length > 0) {
      const mappedItems = items.map(i => ({
        treatment_id: treatment.id,
        tooth_number: i.tooth_number,
        procedure_code: i.procedure_code,
        description: i.description,
        price: i.price
      }));

      const { error: itemsError } = await supabase
        .from("treatment_items_v2")
        .insert(mappedItems);

      if (itemsError) {
        console.error("[CREATE TREATMENT ITEMS V2] Error:", itemsError);
      }
    }

    res.json({ ok: true, treatment_id: treatment.id });

  } catch (err) {
    console.error("[CREATE TREATMENT V2] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENTS V2 GET ================= */
// Original location: index.cjs line 2451
router.get('/treatments-v2/:patientId', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin?.clinicId || req.admin?.clinicId;  // req.admin?.clinicId is unset for admin routes
    const patientId = req.params.patientId;

    console.log("[ADMIN TREATMENTS V2 GET] QUERY PARAMS:", { clinicId, patientId });

    if (!clinicId) {
      console.warn("[ADMIN TREATMENTS V2 GET] Missing clinicId — check JWT token");
      return res.status(400).json({ ok: false, error: "missing_clinic_id" });
    }
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "missing_patient_id" });
    }

    const { data, error } = await supabase
      .from("treatments_v2")
      .select(`
        *,
        treatment_items_v2 (
          id,
          tooth_number,
          procedure_code,
          description,
          price
        )
      `)
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN TREATMENTS V2 GET] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    console.log(`[ADMIN TREATMENTS V2 GET] Found ${data?.length ?? 0} treatments`);
    res.json({ ok: true, treatments: data });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 GET] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENTS V2 POST BY PATIENT ================= */
// Original location: index.cjs line 2487
router.post('/treatments-v2/:patientId', adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.admin?.clinicId
    const clinicId = req.admin?.clinicId;
    const patientId = req.params.patientId;
    const { type, notes, items } = req.body;

    // 🔥 CRITICAL: Log request body for debugging
    console.log("[ADMIN TREATMENTS V2 POST] REQUEST BODY:", req.body);
    console.log("[ADMIN TREATMENTS V2 POST] PARSED VALUES:", {
      clinicId,
      patientId,
      type,
      notes,
      items
    });

    // 🔥 CRITICAL: Validate UUID formats
    if (!clinicId || !clinicId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[ADMIN TREATMENTS V2 POST] Invalid clinicId:", clinicId);
      return res.status(400).json({ ok: false, error: "invalid_clinic_id" });
    }

    if (!patientId || !patientId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[ADMIN TREATMENTS V2 POST] Invalid patientId:", patientId);
      return res.status(400).json({ ok: false, error: "invalid_patient_id" });
    }

    // 🔥 CRITICAL: Build payload with explicit values
    const payload = {
      clinic_id: clinicId,
      patient_id: patientId,
      type: type || "general",
      notes: notes || "",
      created_at: new Date().toISOString(), // 🔥 CRITICAL: Explicit created_at
      updated_at: new Date().toISOString()  // 🔥 CRITICAL: Explicit updated_at
    };

    console.log("[ADMIN TREATMENTS V2 POST] PAYLOAD:", JSON.stringify(payload, null, 2));

    const { data: treatment, error: treatmentError } = await supabase
      .from("treatments_v2")
      .insert([payload]) // 🔥 CRITICAL: Array format
      .select();

    // 🔥 CRITICAL: Log insert results
    console.log("[ADMIN TREATMENTS V2 POST] INSERT DATA:", JSON.stringify(treatment, null, 2));
    console.log("[ADMIN TREATMENTS V2 POST] INSERT ERROR:", JSON.stringify(treatmentError, null, 2));

    if (treatmentError) {
      console.error("[ADMIN TREATMENTS V2 POST] Full Error Details:", {
        message: treatmentError.message,
        details: treatmentError.details,
        hint: treatmentError.hint,
        code: treatmentError.code
      });
      return res.status(500).json({
        ok: false,
        error: treatmentError.message || "creation_failed",
        details: treatmentError
      });
    }

    if (items && items.length > 0) {
      const mappedItems = items.map(i => ({
        treatment_id: treatment.id,
        tooth_number: i.tooth_number,
        procedure_code: i.procedure_code,
        description: i.description,
        price: i.price
      }));

      const { error: itemsError } = await supabase
        .from("treatment_items_v2")
        .insert(mappedItems);

      if (itemsError) {
        console.error("[ADMIN TREATMENTS ITEMS V2 POST] Error:", itemsError);
      }
    }

    res.json({ ok: true, treatment });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 POST] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENTS V2 PUT ================= */
// Original location: index.cjs line 2576
router.put('/treatments-v2/:treatmentId', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin?.clinicId;
    const treatmentId = req.params.treatmentId;
    const { type, notes, items } = req.body;

    const { data: treatment, error: treatmentError } = await supabase
      .from("treatments_v2")
      .update({ type, notes })
      .eq("id", treatmentId)
      .eq("clinic_id", clinicId)
      .select()
      .single();

    if (treatmentError) {
      console.error("[ADMIN TREATMENTS V2 PUT] Error:", treatmentError);
      return res.status(500).json({ ok: false, error: "update_failed" });
    }

    // Update items if provided
    if (items && items.length > 0) {
      // Delete existing items
      await supabase
        .from("treatment_items_v2")
        .delete()
        .eq("treatment_id", treatmentId);

      // Insert new items
      const mappedItems = items.map(i => ({
        treatment_id: treatmentId,
        tooth_number: i.tooth_number,
        procedure_code: i.procedure_code,
        description: i.description,
        price: i.price
      }));

      const { error: itemsError } = await supabase
        .from("treatment_items_v2")
        .insert(mappedItems);

      if (itemsError) {
        console.error("[ADMIN TREATMENTS ITEMS V2 PUT] Error:", itemsError);
      }
    }

    res.json({ ok: true, treatment });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 PUT] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENTS V2 DELETE ================= */
// Original location: index.cjs line 2629
router.delete('/treatments-v2/:treatmentId', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin?.clinicId;
    const treatmentId = req.params.treatmentId;

    // Delete treatment items first
    await supabase
      .from("treatment_items_v2")
      .delete()
      .eq("treatment_id", treatmentId);

    // Delete treatment
    const { error } = await supabase
      .from("treatments_v2")
      .delete()
      .eq("id", treatmentId)
      .eq("clinic_id", clinicId);

    if (error) {
      console.error("[ADMIN TREATMENTS V2 DELETE] Error:", error);
      return res.status(500).json({ ok: false, error: "delete_failed" });
    }

    res.json({ ok: true, deleted: true });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 DELETE] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENT PRICES ================= */
// Original location: index.cjs line 3566
router.get('/treatment-prices', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin?.clinicId || null;

    // Schema: id, clinic_id, type, price, currency, is_active, duration_minutes, break_minutes
    let query = getSupabase(req)
      .from("treatment_prices")
      .select("id, type, price, currency, is_active, duration_minutes, break_minutes");
    if (clinicId) query = query.eq("clinic_id", clinicId);

    const timeoutMs = 25000; // Supabase cold start için 25 sn
    let data, error;
    try {
      const result = await Promise.race([
        query,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`treatment_prices query timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      data = result.data;
      error = result.error;
    } catch (raceErr) {
      console.warn("[TREATMENT PRICES] Query error/timeout:", raceErr.message);
      return res.json({ ok: true, prices: [], _timeout: true });
    }

    if (error) {
      const code = String(error?.code || "");
      if (["42P01", "PGRST204", "42703"].includes(code)) {
        return res.json({ ok: true, prices: [] });
      }
      console.error("[TREATMENT PRICES] Supabase error:", error.message);
      return res.json({ ok: true, prices: [] });
    }

    console.log(`[TREATMENT PRICES] Loaded ${(data||[]).length} rows for clinic ${clinicId}`);

    const prices = (data || []).map((row) => ({
      id: row.id,
      treatment_name: String(row.type || "").toUpperCase(),
      default_price: Number(row.price) || 0,
      currency: row.currency || "EUR",
      is_active: row.is_active !== false,
      duration_minutes: Number.parseInt(row.duration_minutes, 10) || 0,
      break_minutes: Number.parseInt(row.break_minutes, 10) || 0,
    }));

    return res.json({ ok: true, prices });
  } catch (error) {
    console.error("[TREATMENT PRICES COMPAT] Error:", error);
    return res.json({ ok: true, prices: [] });
  }
});

/* ================= ADMIN TREATMENT PRICES UPSERT ================= */
router.post('/treatment-prices', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin?.clinicId || null;
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_missing" });
    }

    const { treatment_name, default_price, currency, is_active, duration_minutes, break_minutes } = req.body || {};
    const typeVal = String(treatment_name || "").trim().toUpperCase();
    if (!typeVal) {
      return res.status(400).json({ ok: false, error: "treatment_name_required" });
    }

    const ALLOWED_CURRENCIES = ["USD", "EUR", "TRY", "GEL", "AED", "SAR", "INR", "BRL", "MXN"];
    const priceValue    = Number(default_price) || 0;
    const currencyRaw   = String(currency || "EUR").trim().toUpperCase();
    const currencyValue = ALLOWED_CURRENCIES.includes(currencyRaw) ? currencyRaw : "EUR";
    if (currency && !ALLOWED_CURRENCIES.includes(currencyRaw)) {
      return res.status(400).json({ ok: false, error: "unsupported_currency", message: `Currency '${currencyRaw}' is not supported.` });
    }
    const durationValue = Math.max(0, parseInt(duration_minutes, 10) || 0);
    const breakValue    = Math.max(0, parseInt(break_minutes, 10)    || 0);
    const activeValue   = is_active !== false;

    // Schema: id, clinic_id, type, price, currency, is_active, duration_minutes, break_minutes
    const payload = {
      clinic_id:        clinicId,
      type:             typeVal,
      price:            priceValue,
      currency:         currencyValue,
      is_active:        activeValue,
      duration_minutes: durationValue,
      break_minutes:    breakValue,
    };

    console.log(`[TREATMENT PRICES POST] Upserting: clinic=${clinicId} type=${typeVal} price=${priceValue}`);

    let result;
    try {
      result = await Promise.race([
        getSupabase(req).from("treatment_prices").upsert(payload, { onConflict: "clinic_id,type" }).select("*"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("upsert timeout")), 15000)),
      ]);
    } catch (err) {
      result = { data: null, error: { message: err.message } };
    }

    if (result.error) {
      console.error("[TREATMENT PRICES POST] Upsert error:", result.error.message, result.error.code);
      // If onConflict constraint doesn't exist, try plain insert/update
      try {
        // Check if row exists first
        const existing = await getSupabase(req)
          .from("treatment_prices")
          .select("id")
          .eq("clinic_id", clinicId)
          .eq("type", typeVal)
          .maybeSingle();

        if (existing.data?.id) {
          result = await getSupabase(req)
            .from("treatment_prices")
            .update({ price: priceValue, currency: currencyValue, is_active: activeValue, duration_minutes: durationValue, break_minutes: breakValue })
            .eq("id", existing.data.id)
            .select("*");
        } else {
          result = await getSupabase(req)
            .from("treatment_prices")
            .insert(payload)
            .select("*");
        }
      } catch (err2) {
        return res.status(500).json({ ok: false, error: "upsert_failed", details: err2.message });
      }

      if (result.error) {
        console.error("[TREATMENT PRICES POST] Fallback also failed:", result.error.message);
        return res.status(500).json({ ok: false, error: "db_error", details: result.error.message });
      }
    }

    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row) {
      return res.json({ ok: true, price: null });
    }
    return res.json({
      ok: true,
      price: {
        id:               row.id,
        treatment_name:   row.treatment_code || row.type || row.name || "",
        default_price:    Number(row.price ?? row.default_price ?? 0),
        currency:         row.currency || "EUR",
        is_active:        row.is_active !== false,
        duration_minutes: parseInt(row.duration_minutes, 10) || 0,
        break_minutes:    parseInt(row.break_minutes, 10)    || 0,
      },
    });
  } catch (error) {
    console.error("[TREATMENT PRICES POST] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENT GROUPS CREATE ================= */
// Original location: index.cjs line 7671
router.post('/treatment-groups', adminAuth, async (req, res) => {
  try {
    const { patient_id } = req.body;

    if (!patient_id) {
      return res.status(400).json({
        ok: false,
        error: "patient_id zorunludur"
      });
    }

    const clinicId = req.admin.clinicId;

    // 1️⃣ Hastayı getir
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, name")
      .eq("id", patient_id)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({
        ok: false,
        error: "Hasta bulunamadı"
      });
    }

    // 2️⃣ Mevcut group sayısını bul
    const { count, error: countError } = await supabase
      .from("treatment_groups")
      .select("*", { count: "exact", head: true })
      .eq("patient_id", patient_id);

    if (countError) {
      return res.status(500).json({
        ok: false,
        error: "Group sayısı alınamadı"
      });
    }

    const nextNumber = (count || 0) + 1;
    const autoName = `${patient.name} ${nextNumber}`;

    // 3️⃣ Group oluştur (TEMPORARILY DISABLED)
    // const { data: group, error: groupError } = await supabase
    //   .from("treatment_groups")
    //   .insert({
    //     group_name: autoName,
    //     patient_id,
    //     clinic_id: clinicId,
    //     status: "OPEN"
    //   })
    //   .select()
    //   .single();

    // if (groupError) {
    //   return res.status(500).json({
    //     ok: false,
    //     error: groupError.message
    //   });
    // }

    // Return success without creating group
    return res.json({
      ok: true,
      message: "Treatment endpoint redirected - no group created"
    });

  } catch (err) {
    console.error("Create treatment group error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

/* ================= ADMIN TREATMENTS CREATE ================= */
// Original location: index.cjs line 7749
// NOTE: isSupabaseEnabled() is not defined in index.cjs — supabase is always required
//       (lib/supabase.js exits at startup if credentials are missing), so check is inlined as true.
router.post('/treatments', adminAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id, tooth_number, icd_code, description } = req.body;

    if (!patient_id || !doctor_id || !tooth_number) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    // Fetch patient
    const { data: patient, error: fetchError } = await supabase
      .from("patients")
      .select("id, treatments")
      .eq("id", patient_id)
      .single();

    if (fetchError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    let treatments = patient.treatments || { teeth: {} };

    if (typeof treatments === "string") {
      try {
        treatments = JSON.parse(treatments);
      } catch {
        treatments = { teeth: {} };
      }
    }

    if (!treatments.teeth) {
      treatments.teeth = {};
    }

    if (!treatments.teeth[tooth_number]) {
      treatments.teeth[tooth_number] = [];
    }

    treatments.teeth[tooth_number].push({
      id: randomUUID(),
      doctor_id,
      icd_code: icd_code || null,
      description: description || "",
      date: new Date().toISOString()
    });

    const { error: updateError } = await supabase
      .from("patients")
      .update({ treatments })
      .eq("id", patient_id);

    if (updateError) {
      return res.status(500).json({ ok: false, error: "update_failed" });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error("Treatment create error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADD DOCTOR TO TREATMENT GROUP ================= */
// Original location: index.cjs line 8733
router.post('/treatment-groups/:groupId/add-doctor', adminAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { doctorId } = req.body || {};
    const { clinicId } = req.admin;

    if (!groupId || !doctorId) {
      return res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
    }

    // Validate group belongs to same clinic
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id, clinic_id, status")
      .eq("id", groupId)
      .eq("clinic_id", clinicId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({
        ok: false,
        error: "group_not_found"
      });
    }

    // Validate doctor belongs to same clinic
    const { data: doctor, error: doctorError } = await supabase
      .from("doctors")
      .select("id, clinic_id, status")
      .eq("id", doctorId)
      .eq("clinic_id", clinicId)
      .eq("status", "APPROVED")
      .single();

    if (doctorError || !doctor) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_found_or_not_approved"
      });
    }

    // Check if doctor already in group
    const { data: existingMember, error: memberError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", groupId)
      .eq("doctor_id", doctorId)
      .single();

    if (existingMember) {
      return res.status(400).json({
        ok: false,
        error: "doctor_already_in_group"
      });
    }

    // Add doctor to group
    const { data: newMember, error: addError } = await supabase
      .from("treatment_group_members")
      .insert({
        treatment_group_id: groupId,
        doctor_id: doctorId,
        role: "MEMBER",
        status: "ACTIVE",
        joined_at: new Date().toISOString()
      })
      .select()
      .single();

    if (addError || !newMember) {
      return res.status(500).json({
        ok: false,
        error: "failed_to_add_doctor_to_group"
      });
    }

    res.json({
      ok: true,
      message: "Doctor added to treatment group successfully",
      member: newMember
    });

  } catch (error) {
    console.error("[ADD DOCTOR TO TREATMENT GROUP] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= REMOVE DOCTOR FROM TREATMENT GROUP ================= */
// Original location: index.cjs line 8825
router.delete('/treatment-groups/:groupId/remove-doctor', adminAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { doctorId } = req.body || {};
    const { clinicId } = req.admin;

    if (!groupId || !doctorId) {
      return res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
    }

    // Validate group belongs to same clinic
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id, clinic_id, status")
      .eq("id", groupId)
      .eq("clinic_id", clinicId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({
        ok: false,
        error: "group_not_found"
      });
    }

    // Check if doctor is in group
    const { data: existingMember, error: memberError } = await supabase
      .from("treatment_group_members")
      .select("id, role")
      .eq("treatment_group_id", groupId)
      .eq("doctor_id", doctorId)
      .single();

    if (memberError || !existingMember) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_in_group"
      });
    }

    // Check if removing primary doctor from ACTIVE group
    if (existingMember.role === "PRIMARY" && group.status === "ACTIVE") {
      return res.status(400).json({
        ok: false,
        error: "cannot_remove_primary_doctor_from_active_group"
      });
    }

    // Count remaining doctors in group
    const { data: remainingMembers, error: countError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", groupId);

    if (countError) {
      return res.status(500).json({
        ok: false,
        error: "failed_to_count_remaining_doctors"
      });
    }

    // If removing last doctor, close the group
    if (remainingMembers.length <= 1) {
      await supabase
        .from("treatment_groups")
        .update({
          status: "COMPLETED",
          closed_at: new Date().toISOString()
        })
        .eq("id", groupId);
    }

    // Remove doctor from group
    const { error: removeError } = await supabase
      .from("treatment_group_members")
      .delete()
      .eq("treatment_group_id", groupId)
      .eq("doctor_id", doctorId);

    if (removeError) {
      return res.status(500).json({
        ok: false,
        error: "failed_to_remove_doctor_from_group"
      });
    }

    res.json({
      ok: true,
      message: "Doctor removed from treatment group successfully"
    });

  } catch (error) {
    console.error("[REMOVE DOCTOR FROM GROUP] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN ENCOUNTER NOTES ================= */
// Original location: index.cjs line 10681
router.post('/encounters/:id/notes', adminAuth, async (req, res) => {
  try {
    const encounterId = String(req.params.id || "").trim();
    const content = String(req.body?.content || "").trim();
    if (!encounterId) {
      return res.status(400).json({ ok: false, error: "encounter_id_required" });
    }
    if (!content) {
      return res.status(400).json({ ok: false, error: "content_required" });
    }

    const encounterLookup = await supabase
      .from("patient_encounters")
      .select("id")
      .eq("id", encounterId)
      .maybeSingle();

    if (encounterLookup.error || !encounterLookup.data) {
      return res.status(404).json({ ok: false, error: "encounter_not_found" });
    }

    const adminId = String(req.admin?.adminId || "").trim();
    const payloadCandidates = [
      {
        encounter_id: encounterId,
        doctor_id: adminId,
        content,
        is_correction: false,
        author_role: "ADMIN",
      },
      {
        encounter_id: encounterId,
        doctor_id: adminId,
        content,
        is_correction: false,
      },
      {
        encounter_id: encounterId,
        doctor_id: adminId,
        content,
      },
    ];

    let inserted = null;
    let insertError = null;
    for (const payload of payloadCandidates) {
      const result = await supabase
        .from("encounter_notes")
        .insert(payload)
        .select("id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,author_role,created_at")
        .single();

      if (!result.error && result.data) {
        inserted = result.data;
        insertError = null;
        break;
      }

      insertError = result.error;
      if (!isMissingRelationError(result.error)) break;
    }

    if ((!inserted || insertError) && isMissingRelationError(insertError)) {
      const fallbackCreate = await createEncounterNoteFromEvents({
        encounterId,
        doctorId: adminId,
        content,
        isCorrection: false,
        correctionFor: null,
        authorRole: "ADMIN",
      });
      inserted = fallbackCreate.data;
      insertError = fallbackCreate.error;
    }

    if (insertError || !inserted) {
      console.error("[ADMIN ENCOUNTER NOTES] create error:", insertError);
      return res.status(500).json({ ok: false, error: "note_create_failed" });
    }

    await logEncounterNoteAudit({
      action: "ADMIN_NOTE_CREATE",
      noteId: inserted.id,
      encounterId,
      actorId: adminId,
      actorRole: "ADMIN",
      metadata: { is_admin_annotation: true },
    });

    return res.json({ ok: true, note: normalizeEncounterNote(inserted, []) });
  } catch (error) {
    console.error("[ADMIN ENCOUNTER NOTES] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN FIX TREATMENT GROUPS STATUS ================= */
// Original location: index.cjs line 14327
router.post('/fix-treatment-groups-status', adminAuth, async (req, res) => {
  try {
    console.log("[FIX TREATMENT GROUPS] Starting status normalization...");

    // 1️⃣ Mevcut constraint'i kaldır
    const { error: dropError } = await supabase
      .from('treatment_groups')
      .select('id')
      .limit(1);

    // 2️⃣ Eski veriyi normalize et
    const { data: updateResult, error: updateError } = await supabase
      .from('treatment_groups')
      .update({ status: 'OPEN' })
      .eq('status', 'ACTIVE');

    if (updateError) {
      console.error("[FIX TREATMENT GROUPS] Update error:", updateError);
      throw updateError;
    }

    console.log(`[FIX TREATMENT GROUPS] Updated ${updateResult?.length || 0} records from ACTIVE to OPEN`);

    // 3️⃣ Kontrol et
    const { data: checkResult } = await supabase
      .from('treatment_groups')
      .select('status');

    const counts = {};
    checkResult?.forEach(item => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });

    console.log("[FIX TREATMENT GROUPS] Current status counts:", counts);

    res.json({
      ok: true,
      message: "Treatment groups status normalization completed - Step 1: ACTIVE → OPEN",
      updatedRecords: updateResult?.length || 0,
      statusCounts: counts,
      nextStep: "Execute ALTER TABLE commands in Supabase SQL Editor"
    });

  } catch (error) {
    console.error("[FIX TREATMENT GROUPS] Error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to normalize treatment groups status"
    });
  }
});

/* ================= GET /api/admin/procedure-stats ================= */
// Returns monthly procedure counts for the past N months (used by admin.html charts)
router.get('/procedure-stats', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabase(req);
    const clinicId = req.admin.clinicId;
    const months = Math.min(parseInt(req.query.months) || 6, 24);

    // Normalise Supabase timestamp format ("2026-02-13 11:17:00+00" → ISO 8601)
    const normalizeTs = (str) => {
      if (!str) return null;
      return String(str).replace(' ', 'T').replace(/\+00$/, '+00:00');
    };

    // Build month buckets using UTC to avoid server-timezone distortion
    const now = new Date();
    const nowYear  = now.getUTCFullYear();
    const nowMonth = now.getUTCMonth();
    const cutoff = new Date(Date.UTC(nowYear, nowMonth - months, 1));
    const cutoffIso = cutoff.toISOString();

    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(nowYear, nowMonth - i, 1));
      buckets.push({
        year:  d.getUTCFullYear(),
        month: d.getUTCMonth(),
        monthLabel: d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        procedures: 0,
      });
    }

    const countIntoMonth = (dateStr) => {
      const iso = normalizeTs(dateStr);
      if (!iso) return;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return;
      const bucket = buckets.find(b => b.year === d.getUTCFullYear() && b.month === d.getUTCMonth());
      if (bucket) bucket.procedures++;
    };

    // Source 1: treatments_v2
    const { data: tv2Rows, error: tv2Err } = await supabase
      .from('treatments_v2')
      .select('id, created_at')
      .eq('clinic_id', clinicId)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: true });

    if (!tv2Err) {
      (tv2Rows || []).forEach(r => countIntoMonth(r.created_at));
    } else if (!['42P01', 'PGRST205'].includes(String(tv2Err.code || ''))) {
      console.error('[PROCEDURE STATS] treatments_v2:', tv2Err.message);
    }

    // Source 2: patient_treatments → treatments_data.teeth[].procedures[]
    // Get all patients for this clinic first
    const { data: clinicPatients } = await supabase
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId);

    const patientIds = (clinicPatients || []).map(p => String(p.id)).filter(Boolean);

    for (let i = 0; i < patientIds.length; i += 50) {
      const chunk = patientIds.slice(i, i + 50);
      const { data: ptRows, error: ptErr } = await supabase
        .from('patient_treatments')
        .select('patient_id, treatments_data, updated_at')
        .in('patient_id', chunk);

      if (ptErr) {
        if (!['42P01', 'PGRST205'].includes(String(ptErr.code || ''))) {
          console.error('[PROCEDURE STATS] patient_treatments:', ptErr.message);
        }
        break;
      }

      (ptRows || []).forEach(row => {
        const teeth = Array.isArray(row.treatments_data?.teeth) ? row.treatments_data.teeth : [];
        teeth.forEach(tooth => {
          (Array.isArray(tooth?.procedures) ? tooth.procedures : []).forEach(proc => {
            const dateStr = proc.scheduledAt || proc.scheduled_at || proc.createdAt || proc.created_at || row.updated_at;
            if (!dateStr) return;
            const iso = normalizeTs(String(dateStr));
            if (!iso || new Date(iso) < cutoff) return;
            countIntoMonth(dateStr);
          });
        });
      });
    }

    console.log('[PROCEDURE STATS] buckets:', buckets.map(b => `${b.monthLabel}:${b.procedures}`).join(' '));

    const data = buckets.map((b, idx) => {
      const prev = buckets[idx - 1];
      let growthPercent = null;
      if (prev && prev.procedures > 0) {
        growthPercent = Math.round(((b.procedures - prev.procedures) / prev.procedures) * 100);
      }
      return { monthLabel: b.monthLabel, procedures: b.procedures, growthPercent };
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error('[PROCEDURE STATS] crash:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
