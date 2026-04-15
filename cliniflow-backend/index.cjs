#!/usr/bin/env node
/**
 * DEPRECATED — thin shim only.
 *
 * Production and Render MUST use repo root:
 *   node index.cjs
 * from the repository root (see root `package.json` "start").
 *
 * This file exists so `node cliniflow-backend/index.cjs` still boots the same app.
 * All server logic lives in `/index.cjs` at repo root — do not duplicate code here.
 */
require("./run.cjs");
