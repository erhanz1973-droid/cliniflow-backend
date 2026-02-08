-- ICD-10 tablolarını kontrol et
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name LIKE '%icd%' OR table_name LIKE '%diagnosis%' 
ORDER BY table_name, ordinal_position;

-- Mevcut tabloları listele
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- ICD-10 verisi var mı kontrol et
SELECT COUNT(*) as total_records 
FROM information_schema.tables 
WHERE table_name LIKE '%icd%' OR table_name LIKE '%diagnosis%';
