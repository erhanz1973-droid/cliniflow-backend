-- Prosedür seçimlerini doktor satırında saklamak (mobil profil PUT /api/doctor/procedures-list)
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS profile_procedure_ids JSONB DEFAULT '[]'::jsonb;
