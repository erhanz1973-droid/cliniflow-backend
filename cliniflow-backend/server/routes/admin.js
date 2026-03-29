// server/routes/admin.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../../lib/supabase');

const router = express.Router();
router.use(express.urlencoded({ extended: true }));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not defined');
  process.exit(1);
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { email, password, clinicCode } = req.body || {};

  if (!email || !password || !clinicCode) {
    return res.status(400).json({ ok: false, error: 'Missing required fields' });
  }

  const trimmedEmail    = String(email).trim().toLowerCase();
  const trimmedPassword = String(password).trim();
  const trimmedCode     = String(clinicCode).trim().toUpperCase();

  const isBcryptHash = (v) => typeof v === 'string' && /^\$2[aby]\$/.test(v);
  const checkPassword = async (plain, stored) => {
    if (!stored) return false;
    if (isBcryptHash(stored)) return bcrypt.compare(plain, stored);
    return stored === plain;
  };

  try {
    let identity = null;
    let clinic   = null;

    // 1. Try admins table first
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id, email, name, password_hash, clinic_code, status')
      .eq('email', trimmedEmail)
      .eq('clinic_code', trimmedCode)
      .maybeSingle();

    if (!adminError && admin) {
      if (String(admin.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') {
        return res.status(401).json({ ok: false, error: 'invalid_admin_credentials' });
      }
      if (!(await checkPassword(trimmedPassword, admin.password_hash))) {
        return res.status(401).json({ ok: false, error: 'invalid_admin_credentials' });
      }

      const { data: clinicRow } = await supabase
        .from('clinics')
        .select('id, clinic_code, name')
        .eq('clinic_code', trimmedCode)
        .maybeSingle();

      clinic   = clinicRow || null;
      identity = {
        id:        admin.id,
        email:     admin.email,
        name:      admin.name || clinic?.name || '',
        clinicId:  clinic?.id || null,
        clinicCode: trimmedCode,
        clinicName: clinic?.name || '',
      };
    } else {
      // 2. Fallback: try clinics table directly
      const { data: clinicRow, error: clinicError } = await supabase
        .from('clinics')
        .select('id, clinic_code, name, email, password_hash')
        .eq('clinic_code', trimmedCode)
        .maybeSingle();

      if (clinicError || !clinicRow) {
        return res.status(401).json({ ok: false, error: 'invalid_admin_credentials' });
      }
      if (String(clinicRow.email || '').trim().toLowerCase() !== trimmedEmail) {
        return res.status(401).json({ ok: false, error: 'invalid_admin_credentials' });
      }
      if (!(await checkPassword(trimmedPassword, clinicRow.password_hash))) {
        return res.status(401).json({ ok: false, error: 'invalid_admin_credentials' });
      }

      clinic   = clinicRow;
      identity = {
        id:        clinicRow.id,
        email:     clinicRow.email,
        name:      clinicRow.name || '',
        clinicId:  clinicRow.id,
        clinicCode: trimmedCode,
        clinicName: clinicRow.name || '',
      };
    }

    if (!identity || !identity.clinicId) {
      return res.status(401).json({ ok: false, error: 'invalid_admin_credentials' });
    }

    const token = jwt.sign(
      { adminId: identity.id, role: 'ADMIN', clinicId: identity.clinicId, clinicCode: trimmedCode },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      ok:         true,
      token,
      clinicCode: identity.clinicCode,
      clinicName: identity.clinicName,
      user: {
        id:        identity.id,
        email:     identity.email,
        name:      identity.name,
        role:      'ADMIN',
        type:      'admin',
        clinicId:  identity.clinicId,
        clinicCode: identity.clinicCode,
        clinicName: identity.clinicName,
      },
    });

  } catch (err) {
    console.error('[ADMIN LOGIN ERROR]', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;
