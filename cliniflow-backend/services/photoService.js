const { createClient } = require('@supabase/supabase-js');

// You may want to move these to a config file or pass as params
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'patient-files';
const JWT_SECRET = process.env.JWT_SECRET;
const jwt = require('jsonwebtoken');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function handleIntraoralPhotoUpload(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.headers['x-patient-token'];
    if (!token) return res.status(401).json({ ok: false, error: 'missing_token' });

    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); } catch {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }
    if (decoded.role !== 'PATIENT') return res.status(403).json({ ok: false, error: 'patient_only' });
    const patientUuid = decoded.patientId;
    if (!patientUuid) return res.status(401).json({ ok: false, error: 'invalid_token' });

    if (!req.files || req.files.length === 0) return res.status(400).json({ ok: false, error: 'no_files' });

    const uploadedUrls = [];
    for (const file of req.files) {
      const ext = file.originalname.split('.').pop() || 'jpg';
      const filename = `patient-profiles/${patientUuid}/intraoral_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(filename, file.buffer, { contentType: file.mimetype, upsert: true });
      if (storageErr) {
        console.error('[INTRAORAL PHOTO] Storage error:', storageErr);
        return res.status(500).json({ ok: false, error: 'storage_error', details: storageErr.message });
      }
      const { data: urlData } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(filename);
      const publicUrl = urlData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${filename}`;
      uploadedUrls.push(publicUrl);
    }

    // Optionally: Save photo URLs to patient history here
    // ...

    res.json({ ok: true, photoUrls: uploadedUrls });
  } catch (err) {
    console.error('[INTRAORAL PHOTO] Error:', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

module.exports = { handleIntraoralPhotoUpload };
