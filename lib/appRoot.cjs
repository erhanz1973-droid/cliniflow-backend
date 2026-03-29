"use strict";

/**
 * Monorepo server root: the directory that contains root `index.cjs` and `package.json`.
 * Use `appPath(...)` from route modules so requires do not depend on `../../` depth.
 */
const path = require("path");

const APP_ROOT = path.resolve(__dirname, "..");

function appPath(...parts) {
  return path.join(APP_ROOT, ...parts);
}

module.exports = { APP_ROOT, appPath };
