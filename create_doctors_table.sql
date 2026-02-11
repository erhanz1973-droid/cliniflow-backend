-- ================== CREATE DOCTORS TABLE ==================
-- Separate table for doctors to fix registration and auth issues

-- Drop existing doctors table if it exists (for clean recreation)
DROP TABLE IF EXISTS public.doctors CASCADE;

-- Create doctors table
CREATE TABLE public.doctors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    doctor_id TEXT UNIQUE NOT NULL,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    clinic_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    license_number TEXT DEFAULT 'DEFAULT_LICENSE',
    department TEXT,
    specialties TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED')),
    role TEXT DEFAULT 'DOCTOR' CHECK (role = 'DOCTOR'),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_doctors_clinic_id ON public.doctors(clinic_id);
CREATE INDEX idx_doctors_clinic_code ON public.doctors(clinic_code);
CREATE INDEX idx_doctors_status ON public.doctors(status);
CREATE INDEX idx_doctors_doctor_id ON public.doctors(doctor_id);
CREATE UNIQUE INDEX idx_doctors_phone_clinic ON public.doctors(phone, clinic_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Doctors can only see their own clinic's doctors
CREATE POLICY "Clinic doctors can view their clinic doctors" ON public.doctors
    FOR SELECT USING (
        auth.jwt() ->> 'role' = 'ADMIN' AND 
        auth.jwt() ->> 'clinicId'::text = clinic_id::text
    );

-- Create RLS policy: Admins can insert doctors for their clinic
CREATE POLICY "Admins can insert doctors" ON public.doctors
    FOR INSERT WITH CHECK (
        auth.jwt() ->> 'role' = 'ADMIN' AND 
        auth.jwt() ->> 'clinicId'::text = clinic_id::text
    );

-- Create RLS policy: Admins can update doctors in their clinic
CREATE POLICY "Admins can update doctors" ON public.doctors
    FOR UPDATE USING (
        auth.jwt() ->> 'role' = 'ADMIN' AND 
        auth.jwt() ->> 'clinicId'::text = clinic_id::text
    );

-- Create RLS policy: Admins can delete doctors in their clinic
CREATE POLICY "Admins can delete doctors" ON public.doctors
    FOR DELETE USING (
        auth.jwt() ->> 'role' = 'ADMIN' AND 
        auth.jwt() ->> 'clinicId'::text = clinic_id::text
    );

-- Grant permissions
GRANT ALL ON public.doctors TO authenticated;
GRANT SELECT ON public.doctors TO anon;
