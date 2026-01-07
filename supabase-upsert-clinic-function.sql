-- Supabase Stored Procedure: upsert_clinic
-- This function ensures ALL fields are saved, including phone, address, website, logo_url
-- Run this SQL in Supabase SQL Editor FIRST, then update supabase.js to use it

CREATE OR REPLACE FUNCTION upsert_clinic(
  p_clinic_code TEXT,
  p_name TEXT,
  p_email TEXT,
  p_password TEXT,
  p_address TEXT DEFAULT '',
  p_phone TEXT DEFAULT '',
  p_website TEXT DEFAULT '',
  p_logo_url TEXT DEFAULT '',
  p_google_maps_url TEXT DEFAULT '',
  p_default_inviter_discount_percent NUMERIC DEFAULT NULL,
  p_default_invited_discount_percent NUMERIC DEFAULT NULL,
  p_google_reviews JSONB DEFAULT '[]'::jsonb,
  p_trustpilot_reviews JSONB DEFAULT '[]'::jsonb,
  p_created_at BIGINT DEFAULT NULL,
  p_updated_at BIGINT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  clinic_code TEXT,
  name TEXT,
  email TEXT,
  password TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  google_maps_url TEXT,
  default_inviter_discount_percent NUMERIC,
  default_invited_discount_percent NUMERIC,
  google_reviews JSONB,
  trustpilot_reviews JSONB,
  created_at BIGINT,
  updated_at BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_created_at BIGINT;
  v_updated_at BIGINT;
  v_result RECORD;
BEGIN
  -- Set timestamps
  v_updated_at := COALESCE(p_updated_at, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000);
  v_created_at := COALESCE(p_created_at, v_updated_at);
  
  -- INSERT or UPDATE with explicit field mapping
  INSERT INTO clinics (
    clinic_code,
    name,
    email,
    password,
    address,
    phone,
    website,
    logo_url,
    google_maps_url,
    default_inviter_discount_percent,
    default_invited_discount_percent,
    google_reviews,
    trustpilot_reviews,
    created_at,
    updated_at
  )
  VALUES (
    UPPER(p_clinic_code),
    p_name,
    p_email,
    p_password,
    COALESCE(p_address, ''),
    COALESCE(p_phone, ''),
    COALESCE(p_website, ''),
    COALESCE(p_logo_url, ''),
    COALESCE(p_google_maps_url, ''),
    p_default_inviter_discount_percent,
    p_default_invited_discount_percent,
    COALESCE(p_google_reviews, '[]'::jsonb),
    COALESCE(p_trustpilot_reviews, '[]'::jsonb),
    v_created_at,
    v_updated_at
  )
  ON CONFLICT (clinic_code) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    password = EXCLUDED.password,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    website = EXCLUDED.website,
    logo_url = EXCLUDED.logo_url,
    google_maps_url = EXCLUDED.google_maps_url,
    default_inviter_discount_percent = EXCLUDED.default_inviter_discount_percent,
    default_invited_discount_percent = EXCLUDED.default_invited_discount_percent,
    google_reviews = EXCLUDED.google_reviews,
    trustpilot_reviews = EXCLUDED.trustpilot_reviews,
    updated_at = EXCLUDED.updated_at;
  
  -- Return the updated/inserted row
  SELECT * INTO v_result
  FROM clinics
  WHERE clinic_code = UPPER(p_clinic_code);
  
  RETURN QUERY SELECT
    v_result.id,
    v_result.clinic_code,
    v_result.name,
    v_result.email,
    v_result.password,
    v_result.address,
    v_result.phone,
    v_result.website,
    v_result.logo_url,
    v_result.google_maps_url,
    v_result.default_inviter_discount_percent,
    v_result.default_invited_discount_percent,
    v_result.google_reviews,
    v_result.trustpilot_reviews,
    v_result.created_at,
    v_result.updated_at;
END;
$$;

