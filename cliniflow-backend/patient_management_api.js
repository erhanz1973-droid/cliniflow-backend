// ================== PATIENT MANAGEMENT API ENDPOINTS ==================

// GET /api/admin/patients - Enhanced with patient type filtering
app.get("/api/admin/patients", requireAdminAuth, async (req, res) => {
  try {
    const { type, search, page = 1, limit = 50 } = req.query;
    const clinicId = req.clinicId;
    
    console.log(`[PATIENTS] Fetching patients - clinic: ${req.clinicCode}, type: ${type || 'all'}`);
    
    if (isSupabaseEnabled()) {
      let query = supabase
        .from('patients')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId);
      
      // Filter by patient type
      if (type && type !== 'all') {
        query = query.eq('patient_type', type);
      }
      
      // Search functionality
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      
      // Pagination
      const offset = (page - 1) * limit;
      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      return res.json({
        ok: true,
        patients: data || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      });
    }
    
    // Fallback to file-based system
    const patients = readJson(PAT_FILE, {});
    let patientList = Object.values(patients);
    
    // Filter by clinic
    patientList = patientList.filter(p => 
      p.clinicCode === req.clinicCode || p.clinic_code === req.clinicCode
    );
    
    // Filter by patient type (file-based fallback)
    if (type && type !== 'all') {
      patientList = patientList.filter(p => (p.patient_type || 'manual') === type);
    }
    
    // Search
    if (search) {
      const searchLower = search.toLowerCase();
      patientList = patientList.filter(p => 
        (p.firstName && p.firstName.toLowerCase().includes(searchLower)) ||
        (p.lastName && p.lastName.toLowerCase().includes(searchLower)) ||
        (p.email && p.email.toLowerCase().includes(searchLower)) ||
        (p.phone && p.phone.includes(search))
      );
    }
    
    // Sort and paginate
    patientList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const offset = (page - 1) * limit;
    const paginatedList = patientList.slice(offset, offset + limit);
    
    res.json({
      ok: true,
      patients: paginatedList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: patientList.length,
        pages: Math.ceil(patientList.length / limit)
      }
    });
    
  } catch (error) {
    console.error('[PATIENTS] Error:', error);
    res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});

// POST /api/admin/patients - Create manual patient
app.post("/api/admin/patients", requireAdminAuth, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      notes,
      address
    } = req.body || {};
    
    if (!firstName || !lastName) {
      return res.status(400).json({ 
        ok: false, 
        error: 'missing_fields',
        message: 'First name and last name are required' 
      });
    }
    
    const clinicId = req.clinicId;
    const patientId = `patient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[PATIENTS] Creating manual patient: ${firstName} ${lastName}`);
    
    if (isSupabaseEnabled()) {
      const { data, error } = await supabase
        .from('patients')
        .insert({
          id: crypto.randomUUID(),
          patient_id: patientId,
          clinic_id: clinicId,
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: phone || null,
          date_of_birth: dateOfBirth || null,
          address: address || null,
          notes: notes || null,
          patient_type: 'manual',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`[PATIENTS] Manual patient created: ${data.id}`);
      return res.json({ ok: true, patient: data });
    }
    
    // Fallback to file-based
    const patients = readJson(PAT_FILE, {});
    const newPatient = {
      patientId,
      firstName,
      lastName,
      email: email || '',
      phone: phone || '',
      dateOfBirth: dateOfBirth || null,
      address: address || '',
      notes: notes || '',
      clinicCode: req.clinicCode,
      patient_type: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    patients[patientId] = newPatient;
    writeJson(PAT_FILE, patients);
    
    console.log(`[PATIENTS] Manual patient created (file): ${patientId}`);
    res.json({ ok: true, patient: newPatient });
    
  } catch (error) {
    console.error('[PATIENTS] Create error:', error);
    res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});

// POST /api/admin/patients/:patientId/invite - Create invite token
app.post("/api/admin/patients/:patientId/invite", requireAdminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const adminId = req.adminId;
    const { expiresInHours = 168 } = req.body; // 7 days default
    
    console.log(`[PATIENTS] Creating invite for patient: ${patientId}`);
    
    if (isSupabaseEnabled()) {
      // Get patient UUID
      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id, patient_type')
        .eq('patient_id', patientId)
        .eq('clinic_id', req.clinicId)
        .single();
      
      if (patientError || !patient) {
        return res.status(404).json({ ok: false, error: 'patient_not_found' });
      }
      
      if (patient.patient_type !== 'manual') {
        return res.status(400).json({ 
          ok: false, 
          error: 'already_connected',
          message: 'Patient is already connected to the app' 
        });
      }
      
      // Create invite token using Supabase function
      const { data, error } = await supabase.rpc('create_patient_invite', {
        patient_uuid: patient.id,
        admin_uuid: adminId,
        expires_hours: expiresInHours
      });
      
      if (error) throw error;
      
      // Get the token for the invite link
      const { data: tokenData } = await supabase
        .from('invite_tokens')
        .select('token')
        .eq('id', data)
        .single();
      
      const inviteLink = `https://cliniflow.app/invite/${tokenData.token}`;
      
      console.log(`[PATIENTS] Invite created: ${inviteLink}`);
      return res.json({ 
        ok: true, 
        inviteLink,
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
      });
    }
    
    // Fallback for file-based system
    const patients = readJson(PAT_FILE, {});
    const patient = patients[patientId];
    
    if (!patient) {
      return res.status(404).json({ ok: false, error: 'patient_not_found' });
    }
    
    if (patient.patient_type === 'connected') {
      return res.status(400).json({ 
        ok: false, 
        error: 'already_connected',
        message: 'Patient is already connected to the app' 
      });
    }
    
    // Generate simple token (file-based fallback)
    const token = crypto.randomBytes(32).toString('hex');
    const inviteLink = `https://cliniflow.app/invite/${token}`;
    
    // Store invite in file (simplified)
    const invites = readJson('invites.json', {});
    invites[token] = {
      patientId,
      clinicCode: req.clinicCode,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresInHours * 60 * 60 * 1000
    };
    writeJson('invites.json', invites);
    
    // Update patient
    patient.invited_at = Date.now();
    writeJson(PAT_FILE, patients);
    
    console.log(`[PATIENTS] Invite created (file): ${inviteLink}`);
    res.json({ 
      ok: true, 
      inviteLink,
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    });
    
  } catch (error) {
    console.error('[PATIENTS] Invite error:', error);
    res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});

// GET /api/admin/patients/stats - Patient statistics
app.get("/api/admin/patients/stats", requireAdminAuth, async (req, res) => {
  try {
    const clinicId = req.clinicId;
    
    console.log(`[PATIENTS] Fetching stats for clinic: ${req.clinicCode}`);
    
    if (isSupabaseEnabled()) {
      const { data, error } = await supabase
        .from('patient_stats')
        .select('*')
        .eq('clinic_id', clinicId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }
      
      const stats = data || {
        total_patients: 0,
        connected_patients: 0,
        manual_patients: 0,
        conversion_rate: 0
      };
      
      return res.json({ ok: true, stats });
    }
    
    // Fallback to file-based
    const patients = readJson(PAT_FILE, {});
    const patientList = Object.values(patients).filter(p => 
      p.clinicCode === req.clinicCode || p.clinic_code === req.clinicCode
    );
    
    const total = patientList.length;
    const connected = patientList.filter(p => (p.patient_type || 'manual') === 'connected').length;
    const manual = total - connected;
    const conversionRate = total > 0 ? Math.round((connected / total) * 100) : 0;
    
    const stats = {
      total_patients: total,
      connected_patients: connected,
      manual_patients: manual,
      conversion_rate: conversionRate
    };
    
    res.json({ ok: true, stats });
    
  } catch (error) {
    console.error('[PATIENTS] Stats error:', error);
    res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});

// POST /api/invite/:token - Public endpoint for invite redemption
app.post("/api/invite/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { appUserId } = req.body;
    
    console.log(`[INVITE] Redeeming invite token: ${token}`);
    
    if (isSupabaseEnabled()) {
      // Get invite token
      const { data: inviteData, error: inviteError } = await supabase
        .from('invite_tokens')
        .select('patient_id, expires_at, used_at')
        .eq('token', token)
        .single();
      
      if (inviteError || !inviteData) {
        return res.status(404).json({ ok: false, error: 'invalid_invite' });
      }
      
      if (inviteData.used_at) {
        return res.status(400).json({ ok: false, error: 'invite_already_used' });
      }
      
      if (new Date(inviteData.expires_at) < new Date()) {
        return res.status(400).json({ ok: false, error: 'invite_expired' });
      }
      
      // Convert patient to connected
      const { error: convertError } = await supabase.rpc('convert_manual_to_connected', {
        patient_uuid: inviteData.patient_id,
        app_user_uuid: appUserId
      });
      
      if (convertError) throw convertError;
      
      console.log(`[INVITE] Patient converted to connected: ${inviteData.patient_id}`);
      return res.json({ ok: true, message: 'Patient successfully connected to app' });
    }
    
    // Fallback for file-based
    const invites = readJson('invites.json', {});
    const invite = invites[token];
    
    if (!invite) {
      return res.status(404).json({ ok: false, error: 'invalid_invite' });
    }
    
    if (invite.used_at) {
      return res.status(400).json({ ok: false, error: 'invite_already_used' });
    }
    
    if (Date.now() > invite.expiresAt) {
      return res.status(400).json({ ok: false, error: 'invite_expired' });
    }
    
    // Update patient
    const patients = readJson(PAT_FILE, {});
    const patient = patients[invite.patientId];
    
    if (patient) {
      patient.patient_type = 'connected';
      patient.app_user_id = appUserId;
      patient.connected_at = Date.now();
      writeJson(PAT_FILE, patients);
    }
    
    // Mark invite as used
    invite.used_at = Date.now();
    writeJson('invites.json', invites);
    
    console.log(`[INVITE] Patient converted (file): ${invite.patientId}`);
    res.json({ ok: true, message: 'Patient successfully connected to app' });
    
  } catch (error) {
    console.error('[INVITE] Redeem error:', error);
    res.status(500).json({ ok: false, error: 'internal_error', message: error.message });
  }
});
