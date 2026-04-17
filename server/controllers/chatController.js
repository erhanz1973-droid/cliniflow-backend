/**
 * Admin chat HTTP handlers for server/index.js (Supabase + JWT).
 * Single source of truth: patient_messages only (no legacy `messages` table merge or fallback).
 */

const UUID_RE_CHAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function now() {
  return Date.now();
}

function mapPatientMessagesRowToLegacy(row) {
  if (!row) return null;
  const role = String(row.from_role || "").toLowerCase();
  const from = role === "patient" ? "PATIENT" : "CLINIC";
  let attachment = row.attachment || undefined;
  if (attachment && typeof attachment === "object") {
    attachment = {
      ...attachment,
      mimeType: attachment.mimeType || attachment.mime,
      name: attachment.name || "Dosya",
      size: attachment.size != null ? attachment.size : 0,
    };
  }
  const createdRaw = row.created_at ?? row.createdAt;
  let createdAt = now();
  if (typeof createdRaw === "number") createdAt = createdRaw;
  else if (typeof createdRaw === "string") {
    const parsed = Date.parse(createdRaw);
    if (!Number.isNaN(parsed)) createdAt = parsed;
  } else if (createdRaw instanceof Date) {
    createdAt = createdRaw.getTime();
  }
  let readAt = null;
  const readRaw = row.read_at ?? row.readAt ?? null;
  if (readRaw != null) {
    if (typeof readRaw === "number") readAt = readRaw;
    else if (typeof readRaw === "string") {
      const p = Date.parse(readRaw);
      if (!Number.isNaN(p)) readAt = p;
    } else if (readRaw instanceof Date) readAt = readRaw.getTime();
  }
  const bodyText =
    row.text ??
    row.message ??
    row.content ??
    row.message_text ??
    row.body ??
    "";
  return {
    id: String(row.message_id || row.id || ""),
    text: String(bodyText || ""),
    from,
    type: row.type || "text",
    attachment: attachment || undefined,
    createdAt,
    patientId: row.patient_id || undefined,
    ...(readAt != null ? { readAt } : {}),
  };
}

/** Drop rows with no visible text and no usable attachment (empty bubbles in UI). */
function isRenderableLegacyMessage(m) {
  if (!m) return false;
  const t = String(m.text || "").trim();
  if (t.length > 0) return true;
  const att = m.attachment;
  if (att && typeof att === "object") {
    const url = String(att.url || "").trim();
    if (url.length > 0) return true;
    const ft = String(att.fileType || "").toLowerCase();
    const mime = String(att.mimeType || att.mime || "").toLowerCase();
    if (ft === "image" || mime.startsWith("image/")) return true;
  }
  const ty = String(m.type || "").toLowerCase();
  if (ty === "image" && att) return true;
  return false;
}

function filterRenderableMessages(list) {
  return (Array.isArray(list) ? list : []).filter(isRenderableLegacyMessage);
}

async function resolveAdminClinicContext(supabase, adminJwt) {
  let adminCode = String(adminJwt.clinicCode || "").trim().toUpperCase();
  let adminClinicId = adminJwt.clinicId ? String(adminJwt.clinicId).trim() : "";

  if (!adminCode && adminClinicId) {
    const { data: c } = await supabase
      .from("clinics")
      .select("id, clinic_code")
      .eq("id", adminClinicId)
      .maybeSingle();
    if (c?.clinic_code) adminCode = String(c.clinic_code).trim().toUpperCase();
  }
  if (!adminClinicId && adminCode) {
    const { data: c } = await supabase
      .from("clinics")
      .select("id")
      .eq("clinic_code", adminCode)
      .maybeSingle();
    if (c?.id) adminClinicId = String(c.id).trim();
  }

  return { adminCode, adminClinicId };
}

/** Admin may access thread only if patient is in the same clinic (prefer clinic_id). */
function patientBelongsToAdmin(prow, adminCode, adminClinicId) {
  const pCid = prow.clinic_id != null ? String(prow.clinic_id).trim() : "";
  if (adminClinicId && pCid && adminClinicId === pCid) return true;
  const pCode = String(prow.clinic_code || "").trim().toUpperCase();
  const aCode = String(adminCode || "").trim().toUpperCase();
  return !!(aCode && pCode && aCode === pCode);
}

function createChatController({ supabase, jwt, jwtSecret }) {
  async function resolvePatientUuidForAdminChat(patientIdParam) {
    const raw = String(patientIdParam || "").trim();
    if (!raw) return null;
    if (UUID_RE_CHAT.test(raw)) return raw;
    const { data: byPid, error: errPid } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", raw)
      .maybeSingle();
    if (!errPid && byPid?.id) return String(byPid.id);
    if (raw.length > 2 && String(raw[0]).toLowerCase() === "p" && raw[1] === "_") {
      const rest = raw.slice(2);
      if (UUID_RE_CHAT.test(rest)) {
        const { data: byId, error: errId } = await supabase
          .from("patients")
          .select("id")
          .eq("id", rest)
          .maybeSingle();
        if (!errId && byId?.id) return String(byId.id);
      }
    }
    return null;
  }

  function requireServerAdminJwt(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ ok: false, error: "unauthorized" });
    try {
      const decoded = jwt.verify(token, jwtSecret);
      const role = String(decoded.role || "").trim().toUpperCase();
      const hasClinicScope = !!(decoded.clinicCode || decoded.clinicId);
      const hasPatientId =
        decoded.patientId != null && String(decoded.patientId || "").trim() !== "";
      const legacyAdmin = hasClinicScope && !hasPatientId;
      if (role !== "ADMIN" && !legacyAdmin) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      req.adminJwt = decoded;
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  }

  function classifyChatToken(decoded) {
    const role = String(decoded.role || "").trim().toUpperCase();
    const tokenPatientId =
      decoded.patientId != null && String(decoded.patientId || "").trim() !== ""
        ? String(decoded.patientId).trim()
        : "";
    const hasClinicId = decoded.clinicId != null && String(decoded.clinicId || "").trim() !== "";
    const hasClinicScope = !!(decoded.clinicCode || decoded.clinicId);
    const legacyAdmin = hasClinicScope && !tokenPatientId;
    if (role === "ADMIN" || legacyAdmin) {
      return { kind: "admin", decoded };
    }
    if (role === "PATIENT" && tokenPatientId && hasClinicId) {
      return { kind: "patient", decoded };
    }
    return { kind: "unknown", decoded };
  }

  /** Patient or admin JWT for unified /api/messages routes. */
  function verifyBearerChat(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return res.status(401).json({ ok: false, error: "unauthorized" });
    try {
      const decoded = jwt.verify(token, jwtSecret);
      const { kind } = classifyChatToken(decoded);
      if (kind === "unknown") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      req.chatDecoded = decoded;
      req.chatActor = kind;
      if (kind === "admin") req.adminJwt = decoded;
      next();
    } catch {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  }

  async function loadPatientMessagesOnly(resolvedUuid) {
    const { data, error } = await supabase
      .from("patient_messages")
      .select("*")
      .eq("patient_id", resolvedUuid)
      .order("created_at", { ascending: true });

    if (error) {
      const c = String(error.code || "");
      if (["42P01", "PGRST205", "PGRST116"].includes(c)) {
        return { messages: [], fetchError: null };
      }
      return { messages: [], fetchError: error.message || "fetch_failed" };
    }

    const messages = (data || []).map(mapPatientMessagesRowToLegacy).filter(Boolean);
    return { messages, fetchError: null };
  }

  async function assertPatientCanAccessThread(req, resolvedUuid, prow) {
    if (req.chatActor === "admin") {
      const { adminCode, adminClinicId } = await resolveAdminClinicContext(supabase, req.chatDecoded);
      if (!adminCode && !adminClinicId) return { ok: false, status: 401, error: "invalid_token" };
      if (!patientBelongsToAdmin(prow, adminCode, adminClinicId)) {
        return { ok: false, status: 403, error: "forbidden" };
      }
      return { ok: true };
    }
    const tokenPatient = String(req.chatDecoded.patientId || "").trim();
    const tokenClinic = String(req.chatDecoded.clinicId || "").trim();
    if (!tokenPatient || !tokenClinic) {
      return { ok: false, status: 401, error: "invalid_token" };
    }
    const resolvedTokenPatient = await resolvePatientUuidForAdminChat(tokenPatient);
    if (!resolvedTokenPatient || resolvedTokenPatient !== resolvedUuid) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    const pClinic = prow.clinic_id != null ? String(prow.clinic_id).trim() : "";
    if (!pClinic || pClinic !== tokenClinic) {
      return { ok: false, status: 403, error: "forbidden" };
    }
    return { ok: true };
  }

  async function markMessagesRead(req, res) {
    const patientParam = String(req.params.patientId || "").trim();
    if (!patientParam) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    let adminCode = String(req.adminJwt.clinicCode || "").trim().toUpperCase();
    let adminClinicId = req.adminJwt.clinicId ? String(req.adminJwt.clinicId).trim() : "";

    if (!adminCode && adminClinicId) {
      const { data: c } = await supabase
        .from("clinics")
        .select("id, clinic_code")
        .eq("id", adminClinicId)
        .maybeSingle();
      if (c?.clinic_code) adminCode = String(c.clinic_code).trim().toUpperCase();
    }
    if (!adminClinicId && adminCode) {
      const { data: c } = await supabase
        .from("clinics")
        .select("id")
        .eq("clinic_code", adminCode)
        .maybeSingle();
      if (c?.id) adminClinicId = String(c.id).trim();
    }

    if (!adminCode && !adminClinicId) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const resolvedUuid = await resolvePatientUuidForAdminChat(patientParam);
    if (!resolvedUuid) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const { data: prow, error: perr } = await supabase
      .from("patients")
      .select("id, clinic_id, clinic_code")
      .eq("id", resolvedUuid)
      .maybeSingle();
    if (perr || !prow) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    if (!patientBelongsToAdmin(prow, adminCode, adminClinicId)) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const readAtIso = new Date().toISOString();
    const { error } = await supabase
      .from("patient_messages")
      .update({ read_at: readAtIso })
      .eq("patient_id", resolvedUuid)
      .or("from_role.eq.patient,from_role.eq.PATIENT")
      .is("read_at", null);

    if (error) {
      console.error("[server] patient_messages read_at update:", error.message);
      return res.status(500).json({ ok: false, error: "mark_read_failed", details: error.message });
    }
    return res.json({ ok: true });
  }

  async function getPatients(req, res) {
    try {
      const { adminCode, adminClinicId } = await resolveAdminClinicContext(supabase, req.adminJwt);
      if (!adminCode && !adminClinicId) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }

      let q = supabase
        .from("patients")
        .select("id, patient_id, name, phone, status, created_at, primary_doctor_id");
      if (adminClinicId) q = q.eq("clinic_id", adminClinicId);
      else q = q.eq("clinic_code", adminCode);

      const { data: rows, error } = await q.order("created_at", { ascending: false });
      if (error) {
        console.error("[server/admin-chat] patients list:", error.message);
        return res.status(500).json({ ok: false, error: error.message || "list_failed" });
      }

      const normalized = (rows || []).map((p) => {
        const createdAt = p.created_at ? new Date(p.created_at).getTime() : 0;
        return {
          id: p.id,
          patient_id: p.patient_id,
          name: p.name || "",
          phone: p.phone || "",
          status: p.status,
          created_at: p.created_at,
          primary_doctor_id: p.primary_doctor_id || null,
          patientId: p.patient_id || p.id,
          createdAt,
          beforeScore: null,
          afterScore: null,
          oralHealthCompleted: false,
        };
      });

      return res.json({ ok: true, list: normalized, patients: normalized });
    } catch (e) {
      console.error("[server/admin-chat] patients:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }

  async function getMessages(req, res) {
    try {
      const { adminCode, adminClinicId } = await resolveAdminClinicContext(supabase, req.adminJwt);
      if (!adminCode && !adminClinicId) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }

      const patientParam = String(req.params.patientId || "").trim();
      const resolvedUuid = await resolvePatientUuidForAdminChat(patientParam);
      if (!resolvedUuid) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const { data: prow, error: perr } = await supabase
        .from("patients")
        .select("id, clinic_id, clinic_code")
        .eq("id", resolvedUuid)
        .maybeSingle();
      if (perr || !prow || !patientBelongsToAdmin(prow, adminCode, adminClinicId)) {
        return res.status(perr || !prow ? 404 : 403).json({
          ok: false,
          error: !prow ? "patient_not_found" : "forbidden",
        });
      }

      const { messages: rows, fetchError } = await loadPatientMessagesOnly(resolvedUuid);
      if (fetchError) {
        return res.status(500).json({ ok: false, error: fetchError });
      }

      return res.json({ ok: true, messages: filterRenderableMessages(rows) });
    } catch (e) {
      console.error("[server/admin-chat] get messages:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }

  async function postPatientThreadMessage(req, res) {
    try {
      if (req.chatActor !== "patient") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      const patientParam = String(req.params.patientId || "").trim();
      const body = req.body || {};
      const raw = body.message ?? body.text ?? body.content;
      const text = String(raw != null ? raw : "").trim();
      if (!patientParam) {
        return res.status(400).json({ ok: false, error: "patientId_required" });
      }
      if (!text) {
        return res.status(400).json({ ok: false, error: "empty_message" });
      }

      const resolvedUuid = await resolvePatientUuidForAdminChat(patientParam);
      if (!resolvedUuid) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const { data: prow, error: perr } = await supabase
        .from("patients")
        .select("id, clinic_id, clinic_code")
        .eq("id", resolvedUuid)
        .maybeSingle();
      if (perr || !prow) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const access = await assertPatientCanAccessThread(req, resolvedUuid, prow);
      if (!access.ok) {
        return res.status(access.status).json({ ok: false, error: access.error });
      }

      const created = await insertPatientUnifiedMessage(resolvedUuid, patientParam, text);
      if (created) {
        return res.status(201).json({ ok: true, ...created, message: created });
      }
      console.error("[server/chat] patient thread insert failed");
      return res.status(500).json({ ok: false, error: "messages_save_failed" });
    } catch (e) {
      console.error("[server/chat] post patient thread message:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }

  async function sendMessage(req, res) {
    try {
      const { adminCode, adminClinicId } = await resolveAdminClinicContext(supabase, req.adminJwt);
      if (!adminCode && !adminClinicId) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }

      const patientParam = String(req.params.patientId || "").trim();
      const rawText = req.body?.text ?? req.body?.message ?? req.body?.content;
      const text = String(rawText != null ? rawText : "").trim();
      if (!text || text.length === 0) {
        return res.status(400).json({ ok: false, error: "empty_message" });
      }

      console.log({
        patientId: patientParam,
        senderType: "ADMIN",
        message: text,
      });

      const resolvedUuid = await resolvePatientUuidForAdminChat(patientParam);
      if (!resolvedUuid) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const { data: prow, error: perr } = await supabase
        .from("patients")
        .select("id, clinic_id, clinic_code")
        .eq("id", resolvedUuid)
        .maybeSingle();
      if (perr || !prow || !patientBelongsToAdmin(prow, adminCode, adminClinicId)) {
        return res.status(perr || !prow ? 404 : 403).json({
          ok: false,
          error: !prow ? "patient_not_found" : "forbidden",
        });
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const baseRow = {
        patient_id: resolvedUuid,
        message_id: messageId,
        chat_id: patientParam,
        text,
        type: "text",
        attachment: null,
      };

      const senderId = prow.clinic_id != null ? String(prow.clinic_id) : null;
      const fromRoles = ["admin", "clinic", "CLINIC", "clinic_staff"];
      let lastError = null;

      outerRoles: for (const from_role of fromRoles) {
        const variants = senderId
          ? [{ ...baseRow, from_role }, { ...baseRow, from_role, sender_id: senderId }]
          : [{ ...baseRow, from_role }];
        for (let vi = 0; vi < variants.length; vi++) {
          const row = variants[vi];
          const { data, error } = await supabase.from("patient_messages").insert(row).select("*").single();
          if (!error && data) {
            return res.json({ ok: true, message: mapPatientMessagesRowToLegacy(data) });
          }
          lastError = error;
          const msg = String(error?.message || "").toLowerCase();
          const code = String(error?.code || "");
          const enumOrCheck =
            code === "23514" ||
            code === "22P02" ||
            msg.includes("enum") ||
            msg.includes("check constraint") ||
            msg.includes("invalid input");
          if (enumOrCheck) continue outerRoles;
          const missingSenderIdCol =
            code === "PGRST204" ||
            code === "42703" ||
            (msg.includes("sender_id") && (msg.includes("schema") || msg.includes("could not find")));
          if (missingSenderIdCol && row.sender_id != null && vi + 1 < variants.length) continue;
          if (code === "23502" && msg.includes("sender_id") && row.sender_id != null && vi + 1 < variants.length) {
            continue;
          }
          break outerRoles;
        }
      }

      console.error("[server/admin-chat] insert clinic message:", lastError?.message || lastError);
      return res.status(500).json({
        ok: false,
        error: "messages_save_failed",
        details: lastError?.message,
      });
    } catch (e) {
      console.error("[server/admin-chat] post admin message:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }

  async function insertPatientUnifiedMessage(resolvedUuid, patientParamRaw, text) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const chatId = String(patientParamRaw || "").trim();
    const roles = ["patient", "PATIENT"];
    for (const from_role of roles) {
      const baseRow = {
        patient_id: resolvedUuid,
        message_id: messageId,
        chat_id: chatId,
        text,
        type: "text",
        attachment: null,
        from_role,
      };
      const variants = [{ ...baseRow }, { ...baseRow, sender_id: resolvedUuid }];
      for (const row of variants) {
        const { data, error } = await supabase.from("patient_messages").insert(row).select("*").single();
        if (!error && data) return mapPatientMessagesRowToLegacy(data);
      }
    }
    return null;
  }

  /**
   * POST /api/messages
   * Body: { patientId, senderType: "ADMIN"|"PATIENT", message }
   */
  async function postUnifiedMessage(req, res) {
    try {
      const body = req.body || {};
      const patientParam = String(body.patientId || "").trim();
      const rawMsg = body.message ?? body.text ?? body.content;
      const text = String(rawMsg != null ? rawMsg : "").trim();
      const senderRaw = String(body.senderType || "").trim().toUpperCase();

      if (!patientParam) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }
      if (!text || text.length === 0) {
        return res.status(400).json({ ok: false, error: "empty_message" });
      }
      if (senderRaw !== "ADMIN" && senderRaw !== "PATIENT") {
        return res.status(400).json({ ok: false, error: "invalid_sender_type" });
      }

      if (senderRaw === "ADMIN" && req.chatActor !== "admin") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      if (senderRaw === "PATIENT" && req.chatActor !== "patient") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      console.log({
        patientId: patientParam,
        senderType: senderRaw,
        message: text,
      });

      const resolvedUuid = await resolvePatientUuidForAdminChat(patientParam);
      if (!resolvedUuid) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const { data: prow, error: perr } = await supabase
        .from("patients")
        .select("id, clinic_id, clinic_code")
        .eq("id", resolvedUuid)
        .maybeSingle();
      if (perr || !prow) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const access = await assertPatientCanAccessThread(req, resolvedUuid, prow);
      if (!access.ok) {
        return res.status(access.status).json({ ok: false, error: access.error });
      }

      if (senderRaw === "PATIENT") {
        const created = await insertPatientUnifiedMessage(resolvedUuid, patientParam, text);
        if (created) {
          return res.status(201).json({ ok: true, ...created, message: created });
        }
        console.error("[server/chat] unified patient insert failed");
        return res.status(500).json({ ok: false, error: "messages_save_failed" });
      }

      const { adminCode, adminClinicId } = await resolveAdminClinicContext(supabase, req.chatDecoded);
      if (!adminCode && !adminClinicId) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }
      if (!patientBelongsToAdmin(prow, adminCode, adminClinicId)) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const baseRow = {
        patient_id: resolvedUuid,
        message_id: messageId,
        chat_id: patientParam,
        text,
        type: "text",
        attachment: null,
      };
      const senderId = prow.clinic_id != null ? String(prow.clinic_id) : null;
      const fromRoles = ["admin", "clinic", "CLINIC", "clinic_staff"];
      let lastError = null;

      outerRoles: for (const from_role of fromRoles) {
        const variants = senderId
          ? [{ ...baseRow, from_role }, { ...baseRow, from_role, sender_id: senderId }]
          : [{ ...baseRow, from_role }];
        for (let vi = 0; vi < variants.length; vi++) {
          const row = variants[vi];
          const { data, error } = await supabase.from("patient_messages").insert(row).select("*").single();
          if (!error && data) {
            const legacy = mapPatientMessagesRowToLegacy(data);
            return res.status(201).json({ ok: true, ...legacy, message: legacy });
          }
          lastError = error;
          const msg = String(error?.message || "").toLowerCase();
          const code = String(error?.code || "");
          const enumOrCheck =
            code === "23514" ||
            code === "22P02" ||
            msg.includes("enum") ||
            msg.includes("check constraint") ||
            msg.includes("invalid input");
          if (enumOrCheck) continue outerRoles;
          const missingSenderIdCol =
            code === "PGRST204" ||
            code === "42703" ||
            (msg.includes("sender_id") && (msg.includes("schema") || msg.includes("could not find")));
          if (missingSenderIdCol && row.sender_id != null && vi + 1 < variants.length) continue;
          if (code === "23502" && msg.includes("sender_id") && row.sender_id != null && vi + 1 < variants.length) {
            continue;
          }
          break outerRoles;
        }
      }

      console.error("MESSAGE SAVE ERROR:", lastError?.message || lastError);
      return res.status(500).json({ ok: false, error: "messages_save_failed" });
    } catch (err) {
      console.error("MESSAGE SAVE ERROR:", err);
      return res.status(500).json({ ok: false, error: "messages_save_failed" });
    }
  }

  /** GET /api/messages/:patientId */
  async function getUnifiedMessages(req, res) {
    try {
      const patientParam = String(req.params.patientId || "").trim();
      if (!patientParam) {
        return res.status(400).json({ ok: false, error: "patientId_required" });
      }

      const resolvedUuid = await resolvePatientUuidForAdminChat(patientParam);
      if (!resolvedUuid) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const { data: prow, error: perr } = await supabase
        .from("patients")
        .select("id, clinic_id, clinic_code")
        .eq("id", resolvedUuid)
        .maybeSingle();
      if (perr || !prow) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      const access = await assertPatientCanAccessThread(req, resolvedUuid, prow);
      if (!access.ok) {
        return res.status(access.status).json({ ok: false, error: access.error });
      }

      const { messages: rows, fetchError } = await loadPatientMessagesOnly(resolvedUuid);
      if (fetchError) {
        return res.status(500).json({ ok: false, error: fetchError });
      }

      return res.json({ ok: true, messages: filterRenderableMessages(rows) });
    } catch (e) {
      console.error("[server/chat] get unified messages:", e);
      return res.status(500).json({ ok: false, error: e?.message || "internal_error" });
    }
  }

  /** POST /api/messages/read — body: { patientId } (admin only; same behavior as /messages/read) */
  async function postUnifiedMarkRead(req, res) {
    if (req.chatActor !== "admin") {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    const pid = String(req.body?.patientId || "").trim();
    if (!pid) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    req.params.patientId = pid;
    req.adminJwt = req.chatDecoded;
    return markMessagesRead(req, res);
  }

  async function getClinic(req, res) {
    try {
      const { adminCode, adminClinicId } = await resolveAdminClinicContext(supabase, req.adminJwt);
      const code = adminCode || "";
      if (!code && !adminClinicId) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }
      let q = supabase.from("clinics").select("id, clinic_code, name");
      if (adminClinicId) q = q.eq("id", adminClinicId);
      else q = q.eq("clinic_code", code);
      const { data: clinic, error } = await q.maybeSingle();
      if (error) {
        return res.json({ ok: true, name: "", branding: { clinicName: "Klinik" } });
      }
      const name = clinic?.name || "";
      return res.json({ ok: true, name, branding: { clinicName: name || "Klinik" } });
    } catch (e) {
      return res.json({ ok: true, name: "", branding: { clinicName: "Klinik" } });
    }
  }

  async function getUnreadCounts(req, res) {
    try {
      const { adminCode, adminClinicId } = await resolveAdminClinicContext(supabase, req.adminJwt);
      if (!adminCode && !adminClinicId) {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }

      const totalOnly = String(req.query.totalOnly || "").trim() === "1";
      if (!totalOnly) {
        return res.json({ ok: true, total: 0, counts: {} });
      }

      let pq = supabase.from("patients").select("id");
      if (adminClinicId) pq = pq.eq("clinic_id", adminClinicId);
      else pq = pq.eq("clinic_code", adminCode);
      const { data: plist, error: pe } = await pq;
      if (pe || !plist?.length) {
        return res.json({ ok: true, total: 0, counts: {} });
      }

      const ids = plist.map((p) => p.id).filter(Boolean);
      let totalPm = 0;
      const chunkSize = 200;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { count, error } = await supabase
          .from("patient_messages")
          .select("id", { count: "exact", head: true })
          .in("patient_id", chunk)
          .or("from_role.eq.patient,from_role.eq.PATIENT")
          .is("read_at", null);
        if (error) {
          console.error("[server/admin-chat] unread patient_messages:", error.message);
          return res.json({ ok: true, total: 0, counts: {} });
        }
        totalPm += count || 0;
      }

      return res.json({ ok: true, total: totalPm, counts: {} });
    } catch (e) {
      return res.json({ ok: true, total: 0, counts: {} });
    }
  }

  return {
    requireServerAdminJwt,
    verifyBearerChat,
    resolvePatientUuidForAdminChat,
    markMessagesRead,
    getPatients,
    getMessages,
    sendMessage,
    postUnifiedMessage,
    postPatientThreadMessage,
    getUnifiedMessages,
    postUnifiedMarkRead,
    getClinic,
    getUnreadCounts,
  };
}

module.exports = { createChatController };
