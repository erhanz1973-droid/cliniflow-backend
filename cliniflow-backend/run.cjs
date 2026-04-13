#!/usr/bin/env node
/**
 * Production entry for Render (use: npm start, or `node run.cjs`).
 * Loads root ../index.cjs — no .env file required; platform env vars only in production.
 */
const path = require("path");
const fs = require("fs");

process.on("uncaughtException", (err) => {
  console.error("[cliniflow-backend] uncaughtException:", err && err.stack ? err.stack : err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[cliniflow-backend] unhandledRejection:", reason);
  process.exit(1);
});

console.log("[cliniflow-backend] run.cjs bootstrap (no .env file required on Render)");
console.log("[cliniflow-backend] cwd:", process.cwd());
console.log("[cliniflow-backend] __dirname:", __dirname);

if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch (_) {
    /* dotenv optional */
  }
}

// Load cliniflow-backend/index.cjs (same directory as this file).
// All npm deps (sharp, express, etc.) are installed HERE in cliniflow-backend/
// so require() resolution works correctly regardless of Render root-dir setting.
const localIndex = path.resolve(__dirname, "index.cjs");
console.log("[cliniflow-backend] loading:", localIndex);
console.log("[cliniflow-backend] index exists:", fs.existsSync(localIndex));

if (!fs.existsSync(localIndex)) {
  console.error(`[cliniflow-backend] FATAL: index.cjs not found at: ${localIndex}`);
  process.exit(1);
}

console.log("==> CLINIFLOW BACKEND v8 — programmatic teeth whitening (NO AI)");

try {
  require(localIndex);
} catch (e) {
  console.error("[cliniflow-backend] FATAL: failed to load index.cjs:", e && e.message ? e.message : e);
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
}
