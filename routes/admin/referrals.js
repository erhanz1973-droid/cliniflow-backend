// routes/admin/referrals.js
// Mounted at: app.use('/api/admin', adminReferralsRouter)
// Covers:
//   GET   /api/admin/referrals
//   POST  /api/admin/referrals  (originally forwarded to GET via app._router.handle;
//                                replaced with shared handler to work in modular context)
//   PATCH /api/admin/referrals/:referralId/approve
//   PATCH /api/admin/referrals/:referralId/reject

const path = require('path');
const express = require('express');
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
// supabase via app.locals (index.cjs working client)
function getSupabase(req) { return req.app.locals.supabase; }
const { adminAuth } = require(appPath('admin-auth-middleware.js'));

const router = express.Router();

/* ================= ADMIN REFERRALS GET ================= */
// Original location: index.cjs line 12939
// Extracted into a shared handler so POST can reuse it without app._router.handle.
async function handleGetReferrals(req, res) {
  try {
    const supabase = getSupabase(req);
    // This endpoint is dynamic and must never be cached (prevents 304/empty stale lists in admin).
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });
    res.removeHeader("ETag");

    const status = String(req.query.status || "").trim().toUpperCase();
    console.log(`[ADMIN REFERRALS] Fetching referrals for clinic_id: ${req.admin?.clinicId}, clinic_code: ${req.admin?.clinicCode}, status filter: ${status || "ALL"}`);

    const normalizeReferralStatus = (value) => {
      const raw = String(value || "").trim().toUpperCase();
      if (!raw) return "PENDING";
      if (["INVITED", "REGISTERED", "CREATED", "SENT"].includes(raw)) return "PENDING";
      if (raw === "COMPLETED") return "APPROVED";
      if (raw === "CANCELLED") return "REJECTED";
      return raw;
    };

    const isMissingClinicCodeColumn = (error) =>
      String(error?.code || "") === "42703" &&
      String(error?.message || "").toLowerCase().includes("clinic_code");

    const fetchReferralsByClinic = async () => {
      const clinicId = req.admin?.clinicId;
      const clinicCode = req.admin?.clinicCode;

      console.log("[ADMIN REFERRALS] Using clinicId:", clinicId, "clinicCode:", clinicCode);

      if (!clinicId) {
        console.error("ClinicId missing in admin referrals endpoint");
        return res.status(400).json({ ok: false, error: "clinic_missing" });
      }

      // Strategy 1: query by clinic_id (new records always have this)
      const { data: byId, error: byIdError } = await supabase
        .from("referrals")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });

      if (byIdError) {
        return { data: null, error: byIdError, source: "clinic_id" };
      }

      if (Array.isArray(byId) && byId.length > 0) {
        return { data: byId, error: null, source: "clinic_id" };
      }

      // Strategy 2: query by clinic_code (some legacy records)
      if (clinicCode) {
        const { data: byCode, error: byCodeError } = await supabase
          .from("referrals")
          .select("*")
          .eq("clinic_code", clinicCode)
          .order("created_at", { ascending: false });

        if (!byCodeError && Array.isArray(byCode) && byCode.length > 0) {
          return { data: byCode, error: null, source: "clinic_code" };
        }
        if (byCodeError && !isMissingClinicCodeColumn(byCodeError)) {
          console.warn("[ADMIN REFERRALS] clinic_code query error:", byCodeError.message);
        }
      }

      // Strategy 3: find via patient IDs (UUID + TEXT) that belong to this clinic.
      // Covers old records inserted without clinic_id, and records using TEXT patient_id.
      try {
        const { data: clinicPatients, error: cpErr } = await supabase
          .from("patients")
          .select("id, patient_id")
          .eq("clinic_id", clinicId); // no role filter — avoids column-not-found errors

        if (!cpErr && Array.isArray(clinicPatients) && clinicPatients.length > 0) {
          const patientUUIDs   = clinicPatients.map(p => p.id).filter(Boolean);
          const patientTextIds = clinicPatients.map(p => p.patient_id).filter(Boolean);
          // Combine both UUID and TEXT id sets (referrals may store either type)
          const idSets = [...new Set([...patientUUIDs, ...patientTextIds])];

          const allRows = [];
          for (let i = 0; i < idSets.length; i += 50) {
            const chunk = idSets.slice(i, i + 50);
            const { data: r1 } = await supabase
              .from("referrals")
              .select("*")
              .in("inviter_patient_id", chunk);
            const { data: r2 } = await supabase
              .from("referrals")
              .select("*")
              .in("invited_patient_id", chunk);
            if (r1) allRows.push(...r1);
            if (r2) allRows.push(...r2);
          }

          // Deduplicate by id/referral_id
          const seen = new Set();
          const unique = allRows.filter(r => {
            const key = r.referral_id || r.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          if (unique.length > 0) {
            console.log(`[ADMIN REFERRALS] Found ${unique.length} referral(s) via patient ID fallback`);
            return { data: unique, error: null, source: "patient_ids" };
          }
        } else if (cpErr) {
          console.warn("[ADMIN REFERRALS] patient lookup error:", cpErr.message);
        }
      } catch (fbErr) {
        console.warn("[ADMIN REFERRALS] patient-based fallback error:", fbErr.message);
      }

      return { data: [], error: null, source: "none" };
    };

    // Önce tüm referral'ları çek (debug için)
    const { data: allReferrals, error: allError, source } = await fetchReferralsByClinic();

    if (allError) {
      console.error("[ADMIN REFERRALS] Supabase error (all):", allError);
      return res.status(500).json({ ok: false, error: "referrals_fetch_failed", details: allError.message });
    } else {
      console.log(`[ADMIN REFERRALS] Total referrals in DB: ${allReferrals?.length || 0}`);
      console.log(`[ADMIN REFERRALS] Source: ${source}`);
      if (allReferrals && allReferrals.length > 0) {
        console.log(`[ADMIN REFERRALS] Status breakdown:`, {
          PENDING: allReferrals.filter(r => normalizeReferralStatus(r.status) === "PENDING").length,
          APPROVED: allReferrals.filter(r => normalizeReferralStatus(r.status) === "APPROVED").length,
          REJECTED: allReferrals.filter(r => normalizeReferralStatus(r.status) === "REJECTED").length,
          NULL: allReferrals.filter(r => !r.status).length,
        });
        // İlk birkaç referral'ın detaylarını logla
        allReferrals.slice(0, 3).forEach((r, i) => {
          console.log(`[ADMIN REFERRALS] Referral ${i + 1}:`, {
            id: r.referral_id || r.id,
            status: r.status || "NULL",
            inviter: r.inviter_patient_name || r.inviter_name,
            invited: r.invited_patient_name || r.invited_name,
          });
        });
      }
    }

    let filteredReferrals = allReferrals || [];
    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      filteredReferrals = (allReferrals || []).filter(ref => normalizeReferralStatus(ref.status) === status);
      console.log(`[ADMIN REFERRALS] Status filter ${status}: ${allReferrals?.length || 0} total, ${filteredReferrals.length} after filter`);
    }

    filteredReferrals.forEach(ref => {
      ref.status = normalizeReferralStatus(ref.status);
    });

    console.log(`[ADMIN REFERRALS] Found ${filteredReferrals?.length || 0} referral(s) after filter for clinic_id: ${req.admin?.clinicId}`);

    // Frontend formatına dönüştür
    // UUID'leri patient_id (TEXT) formatına çevir
    const formattedReferrals = await Promise.all((filteredReferrals || []).map(async (ref) => {
      // Inviter patient_id'yi al
      let inviterPatientId = null;
      if (ref.inviter_patient_id) {
        const { data: inviterPatient, error: inviterError } = await supabase
          .from("patients")
          .select("name, name")
          .eq("id", ref.inviter_patient_id)
          .maybeSingle();
        if (!inviterError && inviterPatient) {
          inviterPatientId = inviterPatient.patient_id || null;
          // Eğer inviter_patient_name yoksa ama patient name varsa, onu kullan
          if (!ref.inviter_patient_name && inviterPatient.name) {
            ref.inviter_patient_name = inviterPatient.name;
          }
        }
      }

      // Invited patient_id'yi al
      let invitedPatientId = null;
      if (ref.invited_patient_id) {
        const { data: invitedPatient, error: invitedError } = await supabase
          .from("patients")
          .select("name, name")
          .eq("id", ref.invited_patient_id)
          .maybeSingle();
        if (!invitedError && invitedPatient) {
          invitedPatientId = invitedPatient.patient_id || null;
          // Eğer invited_patient_name yoksa ama patient name varsa, onu kullan
          if (!ref.invited_patient_name && invitedPatient.name) {
            ref.invited_patient_name = invitedPatient.name;
          }
        }
      }

      const formattedRef = {
        id: ref.referral_id || ref.id,
        inviterPatientName: ref.inviter_patient_name || null,
        invitedPatientName: ref.invited_patient_name || null,
        inviterPatientId: inviterPatientId || null,
        invitedPatientId: invitedPatientId || null,
        status: (ref.status || "PENDING").toUpperCase(),
        discountPercent: ref.discount_percent || null,
        inviterDiscountPercent: ref.inviter_discount_percent || null,
        invitedDiscountPercent: ref.invited_discount_percent || null,
        createdAt: ref.created_at ? new Date(ref.created_at).getTime() : Date.now(),
        checkInAt: ref.check_in_at ? new Date(ref.check_in_at).getTime() : null,
        approvedAt: ref.approved_at ? new Date(ref.approved_at).getTime() : null,
      };

      console.log(`[ADMIN REFERRALS] Formatted referral:`, {
        id: formattedRef.id,
        inviter: formattedRef.inviterPatientName || formattedRef.inviterPatientId || "N/A",
        invited: formattedRef.invitedPatientName || formattedRef.invitedPatientId || "N/A",
        status: formattedRef.status,
      });

      return formattedRef;
    }));

    console.log(`[ADMIN REFERRALS] Returning ${formattedReferrals.length} formatted referral(s)`);
    res.json({ ok: true, items: formattedReferrals });
  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN REFERRALS] Exception:", err);
    res.status(500).json({ ok: false, error: "referrals_fetch_exception", details: err.message });
  }
}

router.get('/referrals', adminAuth, handleGetReferrals);


/* ================= ADMIN REFERRALS POST ================= */
// Original location: index.cjs line 13124
// Original used app._router.handle to forward to GET — replaced with shared handler call.
router.post('/referrals', adminAuth, async (req, res) => {
  try {
    console.log("[ADMIN REFERRALS POST] Request received, forwarding to GET handler");
    req.query = req.query || {};
    return handleGetReferrals(req, res);
  } catch (err) {
    console.error("[ADMIN REFERRALS POST] Error:", err);
    return res.status(500).json({ ok: false, error: "internal_error", details: err.message });
  }
});

/* ================= ADMIN REFERRAL APPROVE ================= */
// Original location: index.cjs line 13141
router.patch('/referrals/:referralId/approve', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabase(req);
    const referralId = String(req.params.referralId || "").trim();
    if (!referralId) {
      return res.status(400).json({ ok: false, error: "referral_id_required" });
    }

    const { inviterDiscountPercent, invitedDiscountPercent } = req.body || {};

    // En az bir indirim yüzdesi girilmeli
    if ((inviterDiscountPercent === null || inviterDiscountPercent === undefined) &&
        (invitedDiscountPercent === null || invitedDiscountPercent === undefined)) {
      return res.status(400).json({ ok: false, error: "at_least_one_discount_required" });
    }

    console.log(`[ADMIN REFERRAL APPROVE] Approving referral ${referralId} for clinic ${req.admin?.clinicId}`);
    console.log(`[ADMIN REFERRAL APPROVE] Inviter discount: ${inviterDiscountPercent}%, Invited discount: ${invitedDiscountPercent}%`);

    // Referral'ı bul ve güncelle
    const { data: referral, error: findError } = await supabase
      .from("referrals")
      .select("*")
      .eq("id", referralId)
      .eq("clinic_id", req.admin?.clinicId)
      .single();

    if (findError || !referral) {
      console.error("[ADMIN REFERRAL APPROVE] Referral not found:", findError);
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }

    // Referral'ı güncelle
    const updateData = {
      status: "approved",
      approved_at: new Date().toISOString(),
    };

    if (inviterDiscountPercent !== null && inviterDiscountPercent !== undefined) {
      updateData.inviter_discount_percent = inviterDiscountPercent;
    }

    if (invitedDiscountPercent !== null && invitedDiscountPercent !== undefined) {
      updateData.invited_discount_percent = invitedDiscountPercent;
    }

    const { data: updatedReferral, error: updateError } = await supabase
      .from("referrals")
      .update(updateData)
      .eq("id", referralId)
      .eq("clinic_id", req.admin?.clinicId)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN REFERRAL APPROVE] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "approval_failed", details: updateError.message });
    }

    console.log(`[ADMIN REFERRAL APPROVE] Successfully approved referral ${referralId}`);

    res.json({
      ok: true,
      item: {
        id: updatedReferral.referral_id || updatedReferral.id,
        status: updatedReferral.status,
        inviterDiscountPercent: updatedReferral.inviter_discount_percent || null,
        invitedDiscountPercent: updatedReferral.invited_discount_percent || null,
      },
    });
  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN REFERRAL APPROVE] Exception:", err);
    res.status(500).json({ ok: false, error: "approval_exception", details: err.message });
  }
});

/* ================= ADMIN REFERRAL REJECT ================= */
// Original location: index.cjs line 13218
router.patch('/referrals/:referralId/reject', adminAuth, async (req, res) => {
  try {
    const supabase = getSupabase(req);
    const referralId = String(req.params.referralId || "").trim();
    if (!referralId) {
      return res.status(400).json({ ok: false, error: "referral_id_required" });
    }

    console.log(`[ADMIN REFERRAL REJECT] Rejecting referral ${referralId} for clinic ${req.admin?.clinicId}`);

    // Referral'ı bul ve güncelle
    const { data: referral, error: findError } = await supabase
      .from("referrals")
      .select("*")
      .eq("id", referralId)
      .eq("clinic_id", req.admin?.clinicId)
      .single();

    if (findError || !referral) {
      console.error("[ADMIN REFERRAL REJECT] Referral not found:", findError);
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }

    // Referral'ı rejected olarak güncelle
    const { data: updatedReferral, error: updateError } = await supabase
      .from("referrals")
      .update({
        status: "rejected",
        approved_at: null, // Approve date'i temizle
      })
      .eq("id", referralId)
      .eq("clinic_id", req.admin?.clinicId)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN REFERRAL REJECT] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "rejection_failed", details: updateError.message });
    }

    console.log(`[ADMIN REFERRAL REJECT] Successfully rejected referral ${referralId}`);

    res.json({
      ok: true,
      item: {
        id: updatedReferral.referral_id || updatedReferral.id,
        status: updatedReferral.status,
      },
    });
  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN REFERRAL REJECT] Exception:", err);
    res.status(500).json({ ok: false, error: "rejection_exception", details: err.message });
  }
});

module.exports = router;
