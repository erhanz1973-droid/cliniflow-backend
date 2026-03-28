// lib/helpers.js
// Shared helper functions extracted from index.cjs.
// Logic is identical — not rewritten.

const fs   = require('fs');
const path = require('path');
const { supabase } = require('./supabase');

/* ================= PATHS ================= */
// __dirname here is <project>/lib — go up one level to reach project root.
const ROOT_DIR        = path.join(__dirname, '..');
const DATA_DIR        = path.join(ROOT_DIR, 'data');
const PATIENTS_DIR    = path.join(DATA_DIR, 'patients');
const TREATMENTS_DIR  = path.join(DATA_DIR, 'treatments');
const TRAVEL_DIR      = path.join(DATA_DIR, 'travel');
const PUBLIC_DIR      = path.join(ROOT_DIR, 'public');

/* ================= FILE-SYSTEM HELPERS ================= */
function ensureDirs() {
  [DATA_DIR, PATIENTS_DIR, TREATMENTS_DIR, TRAVEL_DIR, PUBLIC_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function now() {
  return Date.now();
}

/* ================= SUPABASE COLUMN-PRUNING HELPERS ================= */
function isMissingColumnError(error) {
  const code = String(error?.code || '');
  const msg  = String(error?.message || '');
  // PostgREST missing column codes commonly show as 42703
  return code === '42703' || msg.toLowerCase().includes('does not exist');
}

function getMissingColumnFromError(error) {
  const msg = String(error?.message || '');
  // Example: 'column referrals.invited_patient_name does not exist'
  const m = msg.match(/column\s+referrals\.([a-zA-Z0-9_]+)\s+does\s+not\s+exist/i);
  return m?.[1] || null;
}

function getMissingColumnFromErrorForTable(tableName, error) {
  const table = String(tableName || '').trim();
  const msg   = String(error?.message || '');
  if (!table) return null;

  // Pattern 1: column <table>.<col> does not exist
  const re1 = new RegExp(`column\\s+${table}\\.([a-zA-Z0-9_]+)\\s+does\\s+not\\s+exist`, 'i');
  const m1  = msg.match(re1);
  if (m1?.[1]) return m1[1];

  // Pattern 2: Could not find the 'col' column of '<table>' in the schema cache
  const re2 = new RegExp(`Could not find the '([^']+)' column of '${table}'`, 'i');
  const m2  = msg.match(re2);
  if (m2?.[1]) return m2[1];

  return null;
}

async function insertWithColumnPruning(tableName, payload) {
  const table = String(tableName || '').trim();
  let current = { ...(payload || {}) };
  let lastError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from(table).insert(current).select().single();
    if (!error) return { data, error: null };

    lastError = error;
    if (!isMissingColumnError(error)) return { data: null, error };

    const missing = getMissingColumnFromErrorForTable(table, error);
    if (!missing || !(missing in current)) return { data: null, error };

    console.warn(`[${table}] Missing column on insert, pruning:`, missing);
    delete current[missing];
  }

  return { data: null, error: lastError || new Error('insert_failed') };
}

async function insertReferralWithColumnPruning(payload) {
  let current = { ...(payload || {}) };
  let lastError = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase.from('referrals').insert(current).select().single();
    if (!error) return { data, error: null };

    lastError = error;
    if (!isMissingColumnError(error)) return { data: null, error };

    const missing = getMissingColumnFromError(error);
    if (!missing || !(missing in current)) return { data: null, error };

    console.warn('[REFERRALS] Missing column on insert, pruning:', missing);
    delete current[missing];
  }

  return { data: null, error: lastError || new Error('referral_insert_failed') };
}

/* ================= ID / CODE GENERATORS ================= */
async function generatePatientIdFromName(patientName) {
  if (!patientName || !String(patientName).trim()) {
    // İsim yoksa fallback: random kod
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Türkçe karakterleri dönüştür
  const turkishMap = {
    'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U',
  };

  let normalized = patientName
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (match) => turkishMap[match])
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  // İsim kelimelerini al
  const words = normalized.split(' ');
  let slug = '';

  // Her kelimeden ilk harf al
  for (const word of words) {
    if (word.length > 0) {
      slug += word[0].toUpperCase();
    }
  }

  // Eğer slug boşsa veya 1 karakter ise, ilk kelimenin ilk 3 harfini al
  if (slug.length < 2) {
    slug = normalized.substring(0, 3).toUpperCase();
  }

  // Slug'ı 3 karakterle sınırla
  slug = slug.substring(0, 3);

  // Rastgele 2 haneli sayı ekle
  const randomNum  = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const finalId    = slug + randomNum;

  // Aynı ID varsa sonuna sayı ekle
  let counter = 1;
  let attempts = 0;
  let finalIdWithCounter = finalId;

  while (attempts < 10) {
    const { count, error: checkError } = await supabase
      .from('patients')
      .select('patient_id', { count: 'exact', head: true })
      .eq('patient_id', finalIdWithCounter);

    if (checkError) {
      console.warn('[REGISTER] Error checking patient ID uniqueness:', checkError);
      break;
    }

    if (count === 0) {
      return finalIdWithCounter;
    }

    // Aynı ID varsa sonuna sayı ekle
    counter++;
    finalIdWithCounter = `${slug}_${counter}`;
    attempts++;
  }

  // Fallback: timestamp ekle
  return `${slug}_${Date.now().toString().slice(-6)}`;
}

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = {
  // paths
  DATA_DIR,
  PATIENTS_DIR,
  TREATMENTS_DIR,
  TRAVEL_DIR,
  PUBLIC_DIR,
  // fs helpers
  ensureDirs,
  safeReadJson,
  now,
  // DB helpers
  isMissingColumnError,
  getMissingColumnFromError,
  getMissingColumnFromErrorForTable,
  insertWithColumnPruning,
  insertReferralWithColumnPruning,
  // ID generators
  generatePatientIdFromName,
  generateReferralCode,
};
