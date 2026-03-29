/**
 * Admin chat routes for server/index.js.
 * Mount paths preserve existing URLs (GET /api/admin/patients, /api/patient/:id/messages, etc.).
 */

const express = require("express");
const { createChatController } = require("../controllers/chatController");

/**
 * Register all admin-chat routes on `app`. Must run before `app.use("/api/patient", patientFileRoutes)`.
 * @param {import("express").Application} app
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient; jwt: typeof import("jsonwebtoken") }} deps
 */
function registerChatRoutes(app, { supabase, jwt }) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || !String(jwtSecret).trim()) {
    throw new Error("JWT_SECRET is required for chat routes");
  }

  const chat = createChatController({ supabase, jwt, jwtSecret });
  const auth = chat.requireServerAdminJwt;
  const unifiedChat = chat.verifyBearerChat;

  const adminRouter = express.Router();
  adminRouter.get("/patients", auth, chat.getPatients);
  adminRouter.get("/clinic", auth, chat.getClinic);
  adminRouter.get("/messages/unread-counts", auth, chat.getUnreadCounts);
  app.use("/api/admin", adminRouter);

  const adminPatientRouter = express.Router();
  adminPatientRouter.post("/:patientId/messages/read", auth, chat.markMessagesRead);
  adminPatientRouter.patch("/:patientId/messages/read", auth, chat.markMessagesRead);
  adminPatientRouter.put("/:patientId/messages/read", auth, chat.markMessagesRead);
  app.use("/api/admin/patient", adminPatientRouter);

  const patientChatRouter = express.Router();
  patientChatRouter.post("/:patientId/messages", unifiedChat, chat.postPatientThreadMessage);
  patientChatRouter.get("/:patientId/messages", auth, chat.getMessages);
  patientChatRouter.post("/:patientId/messages/admin", auth, chat.sendMessage);
  patientChatRouter.post("/:patientId/messages/read", auth, chat.markMessagesRead);
  patientChatRouter.patch("/:patientId/messages/read", auth, chat.markMessagesRead);
  patientChatRouter.put("/:patientId/messages/read", auth, chat.markMessagesRead);
  app.use("/api/patient", patientChatRouter);

  const messagesRoot = express.Router();
  messagesRoot.post("/", unifiedChat, chat.postUnifiedMessage);
  messagesRoot.post("/read", unifiedChat, chat.postUnifiedMarkRead);
  messagesRoot.get("/:patientId", unifiedChat, chat.getUnifiedMessages);
  app.use("/api/messages", messagesRoot);
}

module.exports = { registerChatRoutes };
