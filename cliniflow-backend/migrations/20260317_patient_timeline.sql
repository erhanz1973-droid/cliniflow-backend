-- patient_timeline: unified timeline for appointments + travel

CREATE TABLE IF NOT EXISTS patient_timeline (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  UUID        NOT NULL,
  type        TEXT        NOT NULL, -- 'appointment' | 'flight' | 'hotel' | 'transfer'
  title       TEXT,
  description TEXT,
  start_date  TIMESTAMPTZ,
  end_date    TIMESTAMPTZ,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_timeline_patient_id ON patient_timeline(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_timeline_patient_start ON patient_timeline(patient_id, start_date);

-- Backfill from appointments (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
  ) THEN
    INSERT INTO patient_timeline (
      patient_id,
      type,
      title,
      description,
      start_date,
      end_date,
      metadata
    )
    SELECT
      a.patient_id,
      'appointment'::text,
      COALESCE(a.title, 'Appointment'),
      COALESCE(a.reason, a.notes, ''),
      -- Combine date + time if both exist; otherwise cast date to timestamptz
      CASE
        WHEN a.date IS NOT NULL AND a.time IS NOT NULL
          THEN (a.date::timestamptz + a.time)
        WHEN a.date IS NOT NULL
          THEN a.date::timestamptz
        ELSE NULL
      END AS start_date,
      NULL::timestamptz AS end_date,
      to_jsonb(a) - 'id' -- keep full original row (minus id) in metadata
    FROM appointments a
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Backfill from patient_travel (if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'patient_travel'
  ) THEN
    -- Flights
    INSERT INTO patient_timeline (
      patient_id,
      type,
      title,
      description,
      start_date,
      end_date,
      metadata
    )
    SELECT
      pt.patient_id,
      'flight'::text,
      COALESCE(
        (f ->> 'from') || ' → ' || (f ->> 'to'),
        'Flight'
      ) AS title,
      COALESCE(f ->> 'notes', ''),
      -- start_date from flight date/time if present
      CASE
        WHEN (f ? 'date') AND (f ? 'time')
          THEN ( (f ->> 'date') || ' ' || (f ->> 'time') )::timestamptz
        WHEN (f ? 'date')
          THEN (f ->> 'date')::timestamptz
        ELSE NULL
      END AS start_date,
      NULL::timestamptz AS end_date,
      jsonb_build_object('flight', f) || jsonb_build_object('schemaVersion', pt.schema_version, 'source', 'patient_travel')
    FROM patient_travel pt,
         LATERAL jsonb_array_elements(COALESCE(pt.travel_data->'flights', '[]'::jsonb)) AS f
    ON CONFLICT DO NOTHING;

    -- Hotel
    INSERT INTO patient_timeline (
      patient_id,
      type,
      title,
      description,
      start_date,
      end_date,
      metadata
    )
    SELECT
      pt.patient_id,
      'hotel'::text,
      COALESCE(hotel ->> 'name', 'Hotel'),
      COALESCE(hotel ->> 'notes', ''),
      COALESCE((hotel ->> 'checkIn')::timestamptz, NULL),
      COALESCE((hotel ->> 'checkOut')::timestamptz, NULL),
      jsonb_build_object('hotel', hotel) || jsonb_build_object('schemaVersion', pt.schema_version, 'source', 'patient_travel')
    FROM patient_travel pt,
         LATERAL (pt.travel_data->'hotel') AS hotel
    WHERE hotel IS NOT NULL
      AND hotel <> 'null'::jsonb
    ON CONFLICT DO NOTHING;

    -- Transfers / airport pickups
    INSERT INTO patient_timeline (
      patient_id,
      type,
      title,
      description,
      start_date,
      end_date,
      metadata
    )
    SELECT
      pt.patient_id,
      'transfer'::text,
      COALESCE(pickup ->> 'name', 'Airport Transfer'),
      COALESCE(pickup ->> 'notes', ''),
      COALESCE((pickup ->> 'date')::timestamptz, NULL),
      NULL::timestamptz,
      jsonb_build_object('airportPickup', pickup) || jsonb_build_object('schemaVersion', pt.schema_version, 'source', 'patient_travel')
    FROM patient_travel pt,
         LATERAL (pt.travel_data->'airportPickup') AS pickup
    WHERE pickup IS NOT NULL
      AND pickup <> 'null'::jsonb
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

