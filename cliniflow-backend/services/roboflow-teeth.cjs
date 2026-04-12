/**
 * Roboflow Hosted Inference → tooth bounding boxes.
 * https://docs.roboflow.com/deploy/hosted-api
 *
 * Secrets: only from process.env (never hardcode API keys).
 *
 * Env:
 *   ROBOFLOW_API_KEY     (required) Private API key from Roboflow
 *   ROBOFLOW_DETECT_URL  (optional) Full inference URL; defaults to Clinifly deploy URL
 */

const axios = require("axios");
const FormData = require("form-data");

/** Default model endpoint (no secret in code — override via env for other models) */
const DEFAULT_DETECT_URL = "https://detect.roboflow.com/clinifly-tooth-detection/2";

/**
 * @param {Buffer} imageBuffer
 * @param {string} [mimeType]
 * @returns {Promise<object>} Raw Roboflow JSON (predictions, image, …)
 */
async function runRoboflowDetect(imageBuffer, mimeType = "image/jpeg") {
  const apiKey = String(process.env.ROBOFLOW_API_KEY || "").trim();
  const url = String(process.env.ROBOFLOW_DETECT_URL || DEFAULT_DETECT_URL)
    .trim()
    .replace(/\/+$/, "");

  if (!apiKey) {
    const err = new Error("ROBOFLOW_API_KEY is not set");
    err.code = "ROBOFLOW_NOT_CONFIGURED";
    throw err;
  }

  const ext = mimeType.includes("png") ? "png" : "jpg";
  const form = new FormData();
  form.append("file", imageBuffer, { filename: `upload.${ext}`, contentType: mimeType });

  let response;
  try {
    response = await axios.post(url, form, {
      params: {
        api_key: apiKey,
        format: "json",
      },
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000,
      validateStatus: () => true,
    });
  } catch (e) {
    if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
      const err = new Error("Roboflow request timed out");
      err.code = "ROBOFLOW_TIMEOUT";
      throw err;
    }
    if (e.response) {
      const err = new Error(e.response.data?.error || e.response.statusText || "Roboflow request failed");
      err.code = "ROBOFLOW_ERROR";
      err.status = e.response.status;
      throw err;
    }
    throw e;
  }

  const data = response.data;
  if (response.status >= 400) {
    const err = new Error(
      (data && (data.error || data.message)) || `HTTP ${response.status}`
    );
    err.code = "ROBOFLOW_ERROR";
    err.status = response.status;
    throw err;
  }

  if (data?.error && !data?.predictions) {
    const err = new Error(String(data.error));
    err.code = "ROBOFLOW_ERROR";
    err.status = 400;
    throw err;
  }

  return data;
}

/**
 * Roboflow uses (x, y) as box center. Output top-left (x, y) for clients.
 * Returns only { x, y, width, height, confidence } per detection.
 */
function normalizeDetections(roboflowJson) {
  const preds = Array.isArray(roboflowJson?.predictions) ? roboflowJson.predictions : [];

  const detections = preds.map((p) => {
    const w = Number(p.width) || 0;
    const h = Number(p.height) || 0;
    const cx = Number(p.x) || 0;
    const cy = Number(p.y) || 0;
    const confidence =
      typeof p.confidence === "number" ? p.confidence : parseFloat(p.confidence) || 0;
    return {
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      confidence,
    };
  });

  return {
    teethCount: detections.length,
    detections,
  };
}

module.exports = {
  runRoboflowDetect,
  normalizeDetections,
};
