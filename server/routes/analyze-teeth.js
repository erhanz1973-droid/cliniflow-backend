/**
 * POST /analyze-teeth — JSON { image: base64, type?: string } → Roboflow inference.
 * req.body is already parsed by express.json() — do NOT JSON.parse(req.body).
 *
 * Fake-AI mode: set USE_FAKE_AI=true in .env (or leave ROBOFLOW_API_KEY empty)
 * to bypass Roboflow and return realistic dummy detections instead.
 * Re-enable real AI by setting USE_FAKE_AI=false and providing ROBOFLOW_API_KEY.
 */

const DEFAULT_DETECT_URL =
  "https://detect.roboflow.com/clinifly-tooth-detection/2";

// ─── Fake AI ──────────────────────────────────────────────────────────────────

/**
 * Returns realistic fake tooth detections for a given photo type.
 *
 * Coordinates are NORMALIZED (0–1) in CROP SPACE — the frontend's
 * analyzeTeethUri() remaps y back to full-image space via:
 *   y_full = MOUTH_CROP_TOP (0.40) + y_crop * MOUTH_CROP_RATIO (0.35)
 *
 * The response uses Shape A ({ ok: true, teeth: [...] }) which the frontend
 * recognises and skips the pixel→normalized conversion step.
 */
function fakeResponse(type) {
  const t = (id, x, y, status = "healthy") => ({ id, status, x, y, w: 0.08, h: 0.10 });

  switch (String(type || "").trim()) {

    case "front_smile":
      return {
        ok: true,
        teeth: [
          // Upper row (FDI 14–24)
          t(14, 0.18, 0.22), t(13, 0.26, 0.19), t(12, 0.34, 0.18),
          t(11, 0.43, 0.17), t(21, 0.52, 0.17), t(22, 0.61, 0.18),
          t(23, 0.69, 0.19), t(24, 0.77, 0.22),
          // Lower row (FDI 44–34)
          t(44, 0.20, 0.63), t(43, 0.28, 0.64), t(42, 0.37, 0.65),
          t(41, 0.46, 0.65), t(31, 0.54, 0.65), t(32, 0.63, 0.65),
          t(33, 0.71, 0.64), t(34, 0.79, 0.63),
        ],
      };

    case "upper_teeth":
      return {
        ok: true,
        teeth: [
          t(17, 0.10, 0.35), t(16, 0.20, 0.29), t(15, 0.30, 0.25),
          t(14, 0.40, 0.22, "caries"),
          t(13, 0.50, 0.21), t(12, 0.60, 0.22), t(11, 0.70, 0.25),
          t(21, 0.80, 0.29), t(22, 0.88, 0.35),
        ],
      };

    case "lower_teeth":
      return {
        ok: true,
        teeth: [
          t(47, 0.10, 0.42), t(46, 0.21, 0.39, "caries"),
          t(45, 0.32, 0.37), t(44, 0.42, 0.36),
          t(43, 0.50, 0.35), t(42, 0.58, 0.36),
          t(41, 0.66, 0.37), t(31, 0.74, 0.38),
          t(32, 0.82, 0.40), t(33, 0.89, 0.43),
        ],
      };

    case "right_bite":
      return {
        ok: true,
        teeth: [
          // Upper (right side)
          t(16, 0.18, 0.24), t(15, 0.31, 0.28), t(14, 0.44, 0.31),
          t(13, 0.57, 0.33), t(12, 0.70, 0.34),
          // Lower (right side)
          t(46, 0.18, 0.59), t(45, 0.31, 0.62, "caries"),
          t(44, 0.44, 0.64), t(43, 0.57, 0.66), t(42, 0.70, 0.66),
        ],
      };

    case "left_bite":
      return {
        ok: true,
        teeth: [
          // Upper (left side)
          t(26, 0.18, 0.24), t(25, 0.31, 0.28), t(24, 0.44, 0.31),
          t(23, 0.57, 0.33), t(22, 0.70, 0.34),
          // Lower (left side)
          t(36, 0.18, 0.59, "caries"), t(35, 0.31, 0.62),
          t(34, 0.44, 0.64), t(33, 0.57, 0.66), t(32, 0.70, 0.66),
        ],
      };

    default:
      return {
        ok: true,
        teeth: [
          t(11, 0.38, 0.28), t(21, 0.50, 0.28), t(12, 0.30, 0.31),
          t(22, 0.58, 0.31), t(13, 0.22, 0.35), t(23, 0.66, 0.35),
          t(41, 0.42, 0.60), t(31, 0.54, 0.60),
          t(42, 0.34, 0.63), t(32, 0.62, 0.63),
        ],
      };
  }
}

function stripDataUrlBase64(input) {
  if (input == null || typeof input !== "string") return "";
  const s = input.trim();
  const m = s.match(/^data:image\/[^;]+;base64,(.+)$/is);
  return (m ? m[1] : s).replace(/\s/g, "");
}

function buildInferenceUrl(baseUrl, query) {
  const normalized = String(baseUrl || "").trim() || DEFAULT_DETECT_URL;
  const u = new URL(
    /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`
  );
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  });
  return u.toString();
}

/** Roboflow often returns x,y as box center — convert to top-left */
function predictionToDetection(p) {
  const w = Number(p.width) || 0;
  const h = Number(p.height) || 0;
  const cx = Number(p.x) || 0;
  const cy = Number(p.y) || 0;
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
    confidence:
      typeof p.confidence === "number"
        ? p.confidence
        : Number(p.confidence) || 0,
    class: p.class != null ? String(p.class) : undefined,
  };
}

function parseRoboflowJson(text, res) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("[analyze-teeth] Roboflow JSON parse error:", e);
    console.error(
      "[analyze-teeth] ROBOFLOW RAW RESPONSE (truncated):",
      String(text).slice(0, 800)
    );
    res.status(500).json({
      ok: false,
      error: "roboflow_invalid_json",
      message: "Roboflow response was not valid JSON",
    });
    return null;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function handleAnalyzeTeeth(req, res) {
  console.log("HEADERS:", req.headers);
  console.log("BODY TYPE:", typeof req.body);
  console.log("BODY:", req.body);

  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().includes("application/json")) {
    return res.status(400).json({
      ok: false,
      error: "invalid_content_type",
      message: 'Use Content-Type: application/json with body { "image": "<base64>" }',
    });
  }

  if (!req.body || req.body.image === undefined || req.body.image === null) {
    return res.status(400).json({
      ok: false,
      error: "missing_image",
    });
  }

  // ── Fake-AI bypass ──────────────────────────────────────────────────────────
  // Activated when:  USE_FAKE_AI=true  OR  ROBOFLOW_API_KEY is not set
  // Disable by:      USE_FAKE_AI=false AND providing ROBOFLOW_API_KEY
  const apiKey   = process.env.ROBOFLOW_API_KEY;
  const useFakeAI = process.env.USE_FAKE_AI === "true" || !apiKey || !String(apiKey).trim();

  if (useFakeAI) {
    const imageType = String(req.body.type || "").trim() || "front_smile";
    console.log("[FAKE AI] Using fake response for:", imageType);
    return res.json(fakeResponse(imageType));
  }
  // ────────────────────────────────────────────────────────────────────────────

  const rawImage = req.body.image;
  if (typeof rawImage !== "string" && typeof rawImage !== "number") {
    return res.status(400).json({
      ok: false,
      error: "missing_image",
      message: "image must be a base64 string",
    });
  }

  const b64 = stripDataUrlBase64(String(rawImage));
  if (!b64.length) {
    return res.status(400).json({
      ok: false,
      error: "image_empty",
      message: "image must be a non-empty base64 string",
    });
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return res.status(400).json({
      ok: false,
      error: "image_invalid_base64",
      message: "Could not decode base64 image",
    });
  }

  if (!buffer.length) {
    return res.status(400).json({
      ok: false,
      error: "image_empty_buffer",
    });
  }

  const detectBase =
    process.env.ROBOFLOW_DETECT_URL?.trim() || DEFAULT_DETECT_URL;
  const inferenceUrl = buildInferenceUrl(detectBase, {
    api_key: apiKey.trim(),
    format: "json",
  });

  const logDebug =
    process.env.DEBUG_ANALYZE_TEETH === "1" || process.env.NODE_ENV !== "production";
  if (logDebug) {
    console.log("[analyze-teeth] content-type:", req.headers["content-type"]);
    console.log("[analyze-teeth] image length (chars):", String(rawImage).length);
  }

  console.log("[analyze-teeth] Sending to Roboflow...");
  console.log("[analyze-teeth] Image (raw field) length:", String(rawImage).length);
  console.log("[analyze-teeth] Decoded buffer bytes:", buffer.length);

  try {
    /**
     * Attempt 1: multipart/form-data with file field.
     * Roboflow's hosted API reliably accepts this format.
     * Node 22 provides native FormData + Blob.
     */
    const formData = new FormData();
    const blob = new Blob([buffer], { type: "image/jpeg" });
    formData.append("file", blob, "upload.jpg");

    let rfRes = await fetch(inferenceUrl, {
      method: "POST",
      body: formData,
      // Do NOT set Content-Type manually — fetch sets it with the multipart boundary
    });

    let text = await rfRes.text();
    console.log("[analyze-teeth] ROBOFLOW RAW RESPONSE (attempt 1 multipart, truncated):", text.slice(0, 1200));

    /** Attempt 2: raw bytes as application/x-www-form-urlencoded (Roboflow legacy format) */
    if (!rfRes.ok || !text.trim()) {
      console.log("[analyze-teeth] Retrying with raw bytes + x-www-form-urlencoded...");
      rfRes = await fetch(inferenceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buffer,
      });
      text = await rfRes.text();
      console.log("[analyze-teeth] ROBOFLOW RAW RESPONSE (attempt 2 urlencoded, truncated):", text.slice(0, 1200));
    }

    /** Attempt 3: octet-stream */
    if (!rfRes.ok || !text.trim()) {
      console.log("[analyze-teeth] Retrying with application/octet-stream...");
      rfRes = await fetch(inferenceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: buffer,
      });
      text = await rfRes.text();
      console.log("[analyze-teeth] ROBOFLOW RAW RESPONSE (attempt 3 octet-stream, truncated):", text.slice(0, 1200));
    }

    const data = parseRoboflowJson(text, res);
    if (data === null) return;

    if (!rfRes.ok) {
      console.error("[analyze-teeth] Roboflow HTTP", rfRes.status, data);
      return res.status(502).json({
        ok: false,
        error: "roboflow_error",
        status: rfRes.status,
        details: data,
      });
    }

    const predictions = Array.isArray(data.predictions)
      ? data.predictions
      : Array.isArray(data?.prediction)
        ? data.prediction
        : [];

    const detections = predictions.map(predictionToDetection);
    const imageWidth = data.image?.width ?? data.width;
    const imageHeight = data.image?.height ?? data.height;

    return res.json({
      teethCount: detections.length,
      detections,
      ...(imageWidth != null && imageHeight != null
        ? { imageWidth, imageHeight }
        : {}),
    });
  } catch (err) {
    console.error("[analyze-teeth] fetch error:", err);
    return res.status(500).json({
      ok: false,
      error: "inference_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = { handleAnalyzeTeeth };
