/**
 * POST /analyze-teeth
 *
 * JSON body: { "image": "<base64>" }
 * Optional data URL prefix: data:image/jpeg;base64,...
 *
 * Multipart (optional): fields "image" or "file"
 */

const multer = require("multer");
const { runRoboflowDetect, normalizeDetections } = require("../services/roboflow-teeth.cjs");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

function stripDataUrl(b64) {
  const s = String(b64 || "").trim();
  const m = s.match(/^data:image\/\w+;base64,(.+)$/);
  return m ? m[1] : s;
}

function parseImageFromRequest(req) {
  const files = req.files;
  if (files) {
    const f = files.image?.[0] || files.file?.[0];
    if (f?.buffer) {
      return { buffer: f.buffer, mime: f.mimetype || "image/jpeg" };
    }
  }
  const body = req.body || {};
  const raw = body.image;
  if (typeof raw === "string" && raw.length > 0) {
    const b64 = stripDataUrl(raw);
    try {
      const buffer = Buffer.from(b64, "base64");
      if (buffer.length < 32) return null;
      return { buffer, mime: body.mimeType || "image/jpeg" };
    } catch {
      return null;
    }
  }
  return null;
}

function skipMulterForJson(req, res, next) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("application/json")) return next();
  return uploadFields(req, res, next);
}

async function handleAnalyzeTeeth(req, res) {
  try {
    const parsed = parseImageFromRequest(req);
    if (!parsed) {
      return res.status(400).json({
        error: "image_required",
        message: 'Request body must include JSON { "image": "<base64>" }',
      });
    }

    const rf = await runRoboflowDetect(parsed.buffer, parsed.mime);
    const out = normalizeDetections(rf);

    return res.json({
      teethCount: out.teethCount,
      detections: out.detections,
    });
  } catch (err) {
    console.error("[analyze-teeth]", err?.message || err);

    if (err.code === "ROBOFLOW_NOT_CONFIGURED") {
      return res.status(503).json({
        error: "roboflow_not_configured",
        message: "Set ROBOFLOW_API_KEY in environment (e.g. .env for local dev)",
      });
    }

    if (err.code === "ROBOFLOW_TIMEOUT") {
      return res.status(504).json({
        error: "roboflow_timeout",
        message: err.message || "Inference timed out",
      });
    }

    if (err.code === "ROBOFLOW_ERROR") {
      return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        error: "roboflow_inference_failed",
        message: err.message || "Roboflow rejected the request",
      });
    }

    return res.status(500).json({
      error: "internal_error",
      message:
        process.env.NODE_ENV === "development" ? String(err.message) : "Analysis failed",
    });
  }
}

module.exports = function registerAnalyzeTeeth(app) {
  app.post("/analyze-teeth", skipMulterForJson, handleAnalyzeTeeth);
  app.post("/api/analyze-teeth", skipMulterForJson, handleAnalyzeTeeth);
};
