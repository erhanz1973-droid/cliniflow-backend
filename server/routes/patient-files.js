// server/routes/patient-files.js
// POST /api/patient/:patientId/upload  — upload a file to Supabase Storage + save DB record
// GET  /api/patient/:patientId/files   — list patient's files from DB

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const { createClient } = require('@supabase/supabase-js');

const JWT_SECRET = process.env.JWT_SECRET;
const BUCKET     = 'patient-files';

// Supabase admin client (service role bypasses RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// multer — keep file in memory, max 20 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── Auth helper ──────────────────────────────────────────────────────────────
function decodeBearer(req) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try   { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ── Look up patient UUID + clinic UUID by URL param ──────────────────────────
// The URL param may be the actual patients.id UUID or the patients.name string.
async function resolvePatient(patientId, decodedToken) {
  // 1) Try by UUID (patients.id)
  const byId = await supabase
    .from('patients')
    .select('id, clinic_id')
    .eq('id', patientId)
    .maybeSingle();

  if (!byId.error && byId.data) return byId.data;

  // 2) Fall back to patients.name
  const byName = await supabase
    .from('patients')
    .select('id, clinic_id')
    .eq('name', patientId)
    .maybeSingle();

  if (!byName.error && byName.data) return byName.data;

  // 3) Can't find patient row — use param as-is (best-effort)
  return {
    id:        patientId,
    clinic_id: decodedToken?.clinicId || null,
  };
}

// ── POST /:patientId/upload ──────────────────────────────────────────────────
router.post('/:patientId/upload', upload.single('file'), async (req, res) => {
  try {
    const decoded = decodeBearer(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const file = req.file;
    if (!file) return res.status(400).json({ ok: false, error: 'no_file', message: 'Attach a file as multipart field "file".' });

    const { patientId } = req.params;
    const patient       = await resolvePatient(patientId, decoded);
    const patientUUID   = patient.id;
    const clinicUUID    = patient.clinic_id || decoded.clinicId || '';

    if (!clinicUUID) {
      return res.status(400).json({ ok: false, error: 'clinic_not_found', message: 'Could not determine clinic for this patient.' });
    }

    // ── 1. Build storage path ───────────────────────────────────────────────
    const ext         = path.extname(file.originalname || 'photo.jpg') || '.jpg';
    const rand        = Math.random().toString(36).slice(2, 10);
    const storagePath = `patient-uploads/${clinicUUID}/patient-${patientId}-${Date.now()}-${rand}${ext}`;

    // ── 2. Upload to Supabase Storage ───────────────────────────────────────
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || 'image/jpeg',
        upsert: false,
      });

    if (storageErr) {
      console.error('[UPLOAD] Storage error:', storageErr.message);
      return res.status(500).json({ ok: false, error: 'storage_error', message: storageErr.message });
    }

    // ── 3. Build public URL ─────────────────────────────────────────────────
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = urlData?.publicUrl || `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

    // ── 4. Determine file metadata ──────────────────────────────────────────
    const baseName = path.basename(file.originalname || '', ext);
    const fileType = (file.mimetype || '').startsWith('image/') ? 'image' : 'file';

    // ── 5. Insert record into patient_files ─────────────────────────────────
    const { data: record, error: dbErr } = await supabase
      .from('patient_files')
      .insert([{
        patient_id:   patientUUID,
        clinic_id:    clinicUUID,
        file_url:     publicUrl,
        file_name:    file.originalname || `${baseName}${ext}`,
        file_type:    fileType,
        file_subtype: baseName || null,
        mime_type:    file.mimetype || 'image/jpeg',
        file_size:    file.size,
        from_role:    'patient',
        source:       'guided_camera',
      }])
      .select()
      .single();

    if (dbErr) {
      // File is already in storage — log the DB miss but don't fail the request
      console.warn('[UPLOAD] DB insert failed (file still in Storage):', dbErr.message);
    } else {
      console.log('[UPLOAD] ✅ Saved:', record?.id, '→', publicUrl);
    }

    return res.json({
      ok:   true,
      file: {
        id:      record?.id   || null,
        url:     publicUrl,
        name:    file.originalname,
        subtype: baseName || null,
        size:    file.size,
      },
    });

  } catch (err) {
    console.error('[UPLOAD] Unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message });
  }
});

// ── GET /:patientId/files ────────────────────────────────────────────────────
router.get('/:patientId/files', async (req, res) => {
  try {
    const decoded = decodeBearer(req);
    if (!decoded) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const { patientId } = req.params;
    const patient       = await resolvePatient(patientId, decoded);
    const patientUUID   = patient.id;

    const { data: rows, error: dbErr } = await supabase
      .from('patient_files')
      .select('*')
      .eq('patient_id', patientUUID)
      .order('created_at', { ascending: false });

    if (dbErr) {
      console.error('[FILES] DB error:', dbErr.message);
      return res.status(500).json({ ok: false, error: 'db_error', message: dbErr.message });
    }

    const files = (rows || []).map(r => ({
      id:        r.id,
      name:      r.file_name || '',
      url:       r.file_url  || '',
      mimeType:  r.mime_type || 'application/octet-stream',
      fileType:  r.file_type || 'file',
      subtype:   r.file_subtype || null,
      size:      r.file_size    || null,
      createdAt: new Date(r.created_at).getTime(),
      from:      r.from_role === 'patient' ? 'PATIENT' : 'CLINIC',
      source:    r.source || null,
    }));

    console.log(`[FILES] Patient ${patientId} → ${files.length} file(s)`);
    return res.json({ ok: true, files });

  } catch (err) {
    console.error('[FILES] Unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'server_error', message: err.message });
  }
});

module.exports = router;
