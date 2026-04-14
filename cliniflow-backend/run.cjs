#!/usr/bin/env node
/**
 * DEPRECATED — this shim now forwards to the single authoritative entry point:
 *   root/index.cjs  (repo root, cliniflow-server@1.0.0)
 *
 * DO NOT add logic here.  All code lives in /index.cjs.
 */
const path = require("path");

const rootIndex = path.resolve(__dirname, "..", "index.cjs");
console.warn(
  "[cliniflow-backend/run.cjs] DEPRECATED shim — forwarding to root index.cjs:",
  rootIndex
);

require(rootIndex);
