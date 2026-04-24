#!/usr/bin/env node
/**
 * Forward to the single server entry: repository root `index.cjs`.
 * On Railway: Service "Root directory" must be the repo root (where root `index.cjs` lives),
 * not `cliniflow-backend/`, otherwise parent `index.cjs` is not in the deploy.
 */
const path = require("path");
const fs = require("fs");

const candidates = [
  path.resolve(__dirname, "..", "index.cjs"),
  path.resolve(process.cwd(), "index.cjs"),
  path.resolve(process.cwd(), "..", "index.cjs"),
  "/app/index.cjs",
  path.resolve(process.cwd(), "..", "..", "index.cjs"),
];

let rootIndex = null;
for (const c of candidates) {
  try {
    if (fs.existsSync(c)) {
      rootIndex = c;
      break;
    }
  } catch (_) {
    /* ignore */
  }
}

if (!rootIndex) {
  console.error("FATAL: Could not find repository root index.cjs. Tried:", candidates);
  console.error(
    "Railway: open the service → Settings → set Root Directory to / (repository root), not cliniflow-backend."
  );
  console.error("Then set Start Command to: node index.cjs (or rely on root package.json \"start\").");
  process.exit(1);
}

console.warn("[cliniflow-backend/run.cjs] Loading server from:", rootIndex);
require(rootIndex);
