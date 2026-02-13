-- 1️⃣ Mevcut Unique Constraint'leri kontrol et
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'doctors' 
    AND (indexdef LIKE '%UNIQUE%' OR indexname LIKE '%unique%')
ORDER BY indexname;
