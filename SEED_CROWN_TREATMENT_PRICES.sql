-- Seed default clinic pricing entries for Crown hierarchy.
-- Works for both schema variants:
--   1) treatment_prices.treatment_code
--   2) treatment_prices.type

BEGIN;

DO $$
DECLARE
  has_treatment_code boolean;
  has_type boolean;
  has_name boolean;
  has_price boolean;
  has_default_price boolean;
  has_currency boolean;
  has_updated_at boolean;
  code_col text;
  amount_col text;
  insert_cols text;
  select_cols text;
  update_set text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'treatment_prices'
      AND column_name = 'treatment_code'
  ) INTO has_treatment_code;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'treatment_prices'
      AND column_name = 'type'
  ) INTO has_type;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'treatment_prices'
      AND column_name = 'name'
  ) INTO has_name;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'treatment_prices'
      AND column_name = 'price'
  ) INTO has_price;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'treatment_prices'
      AND column_name = 'default_price'
  ) INTO has_default_price;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'treatment_prices'
      AND column_name = 'currency'
  ) INTO has_currency;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'treatment_prices'
      AND column_name = 'updated_at'
  ) INTO has_updated_at;

  IF has_treatment_code THEN
    code_col := 'treatment_code';
  ELSIF has_type THEN
    code_col := 'type';
  ELSE
    RAISE EXCEPTION 'treatment_prices table must have either treatment_code or type column';
  END IF;

  IF has_price THEN
    amount_col := 'price';
  ELSIF has_default_price THEN
    amount_col := 'default_price';
  ELSE
    RAISE EXCEPTION 'treatment_prices table must have either price or default_price column';
  END IF;

  insert_cols := format('clinic_id, %I, %I', code_col, amount_col);
  select_cols := format('src.clinic_id, src.code, src.price');
  update_set := format('%I = src.price', amount_col);

  IF has_name THEN
    insert_cols := insert_cols || ', name';
    select_cols := select_cols || ', src.label';
    update_set := update_set || ', name = src.label';
  END IF;

  IF has_currency THEN
    insert_cols := insert_cols || ', currency';
    select_cols := select_cols || ', ''TRY''';
    update_set := update_set || ', currency = ''TRY''';
  END IF;

  IF has_updated_at THEN
    update_set := update_set || ', updated_at = NOW()';
  END IF;

  EXECUTE format(
    'WITH src AS (
       SELECT
         c.id AS clinic_id,
         seed.code,
         seed.label,
         seed.price
       FROM public.clinics c
       CROSS JOIN (
         VALUES
           (''CROWN_ZIRCONIA'', ''Crown Zirconia'', 5500.00),
           (''CROWN_EMAX'', ''Crown EMAX'', 6000.00),
           (''CROWN_PFM'', ''Crown PFM'', 4500.00),
           (''CROWN_METAL'', ''Crown Metal'', 3500.00),
           (''CROWN_TEMPORARY'', ''Crown Temporary'', 1500.00)
       ) AS seed(code, label, price)
     ),
     updated AS (
       UPDATE public.treatment_prices tp
       SET %s
       FROM src
       WHERE tp.clinic_id = src.clinic_id
         AND tp.%I = src.code
       RETURNING tp.clinic_id
     )
     INSERT INTO public.treatment_prices (%s)
     SELECT %s
     FROM src
     WHERE NOT EXISTS (
       SELECT 1
       FROM public.treatment_prices tp
       WHERE tp.clinic_id = src.clinic_id
         AND tp.%I = src.code
     )',
    update_set,
    code_col,
    insert_cols,
    select_cols,
    code_col
  );
END $$;

COMMIT;
