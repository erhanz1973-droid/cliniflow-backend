-- Append-only encounter notes (multi-doctor safe)
-- Safe to run multiple times

CREATE TABLE IF NOT EXISTS encounter_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  doctor_id TEXT NOT NULL,
  content TEXT NOT NULL,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at TIMESTAMPTZ NULL,
  edited_by TEXT NULL,
  is_correction BOOLEAN NOT NULL DEFAULT FALSE,
  correction_for UUID NULL REFERENCES encounter_notes(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL DEFAULT 'DOCTOR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encounter_notes_encounter_id ON encounter_notes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_notes_doctor_id ON encounter_notes(doctor_id);
CREATE INDEX IF NOT EXISTS idx_encounter_notes_created_at ON encounter_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_encounter_notes_correction_for ON encounter_notes(correction_for);

CREATE TABLE IF NOT EXISTS encounter_note_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NULL,
  encounter_id UUID NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encounter_note_audit_logs_encounter_id ON encounter_note_audit_logs(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_note_audit_logs_note_id ON encounter_note_audit_logs(note_id);
CREATE INDEX IF NOT EXISTS idx_encounter_note_audit_logs_created_at ON encounter_note_audit_logs(created_at);
