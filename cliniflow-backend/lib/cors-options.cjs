/**
 * CORS for Cliniflow API
 * - React Native / Expo: often no `Origin` header → allow
 * - Expo Go / Metro / Web: localhost, 127.0.0.1, LAN IPs (192.168.x, 10.x, 172.16–31.x)
 * - Development: permissive (Expo testing on local network)
 * - Production: set CORS_ORIGINS for public web apps; LAN still allowed if CORS_ALLOW_LAN=1 (default)
 */

function isPrivateOrLocalOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  try {
    if (/^exp:\/\//i.test(origin)) return true;
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return true;
    const p = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
    if (!p) return /\.exp\.direct$/i.test(h);
    const a = +p[1];
    const b = +p[2];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  } catch {
    return false;
  }
}

function buildCorsOptions() {
  const isProd = process.env.NODE_ENV === "production";

  return {
    origin(origin, callback) {
      // curl, Postman, most React Native fetch calls
      if (!origin) {
        return callback(null, true);
      }

      // Local dev: allow any origin (Expo tunnel, random Metro ports, web)
      if (!isProd) {
        return callback(null, true);
      }

      // Production: explicit list (admin panel, web app domains)
      const whitelist = String(process.env.CORS_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (whitelist.some((w) => origin === w || (w && origin.startsWith(w)))) {
        return callback(null, true);
      }

      // Same Wi‑Fi: phone Expo → laptop API (optional, on by default)
      const allowLan = process.env.CORS_ALLOW_LAN !== "0";
      if (allowLan && isPrivateOrLocalOrigin(origin)) {
        return callback(null, true);
      }

      // Fallback: if no whitelist, keep LAN + localhost only (stricter than "*")
      if (whitelist.length === 0 && isPrivateOrLocalOrigin(origin)) {
        return callback(null, true);
      }

      console.warn("[CORS] blocked origin:", origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "X-Requested-With",
      "X-Patient-Token",
      "X-Actor",
    ],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  };
}

module.exports = { buildCorsOptions };
