const { supabase } = require("../supabase");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class DoctorUuidResolveError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
    this.name = "DoctorUuidResolveError";
  }
}

function isDoctorUuidResolveError(err) {
  return Boolean(err && err.name === "DoctorUuidResolveError" && typeof err.code === "string");
}

function httpStatusForDoctorResolveError(code) {
  if (
    code === "doctor_uuid_lookup_failed" ||
    code === "doctor_uuid_resolve_unavailable"
  ) {
    return 503;
  }
  return 400;
}

/** @param {unknown} err @returns {boolean} true if HTTP response was sent */
function sendDoctorUuidResolveError(res, err) {
  if (!isDoctorUuidResolveError(err)) return false;
  const status = httpStatusForDoctorResolveError(err.code);
  res.status(status).json({
    ok: false,
    error: err.code,
    message: err.message,
  });
  return true;
}

/**
 * JWT / istemci doctor anahtarını doctors.id (UUID) biçimine çevirir.
 * UUID ise aynen döner; d_… kodları doctors.doctor_id ile çözülür.
 *
 * @param {string|null|undefined} id
 * @param {{ allowEmpty?: boolean }} [opts] allowEmpty: true ise boş girdi için null (sadece gerçekten opsiyonel yerlerde)
 * @returns {Promise<string|null>}
 */
async function resolveDoctorUUID(id, opts = {}) {
  const allowEmpty = !!opts.allowEmpty;
  const s = String(id == null ? "" : id).trim();
  if (!s) {
    if (allowEmpty) return null;
    throw new DoctorUuidResolveError(
      "doctor_id_required",
      "Doctor identifier is required"
    );
  }
  if (UUID_RE.test(s)) return s;
  if (!supabase) {
    throw new DoctorUuidResolveError(
      "doctor_uuid_resolve_unavailable",
      "Supabase client is not configured"
    );
  }

  const { data, error } = await supabase
    .from("doctors")
    .select("id")
    .eq("doctor_id", s)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DoctorUuidResolveError(
      "doctor_uuid_lookup_failed",
      error.message || String(error)
    );
  }
  if (!data?.id) {
    throw new DoctorUuidResolveError(
      "doctor_uuid_not_found",
      `No doctor row for clinic doctor_id code: ${s}`
    );
  }
  return String(data.id).trim();
}

module.exports = {
  resolveDoctorUUID,
  DoctorUuidResolveError,
  isDoctorUuidResolveError,
  httpStatusForDoctorResolveError,
  sendDoctorUuidResolveError,
};
