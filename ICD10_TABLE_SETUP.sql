-- ================== ICD-10 TABLE SETUP ==================
-- RUN THIS IN SUPABASE SQL EDITOR: https://app.supabase.com/project/_/sql

-- 1️⃣ Create ICD-10 Master Table
CREATE TABLE IF NOT EXISTS icd10_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,
  category VARCHAR(5) NOT NULL,
  title_tr TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ka TEXT NOT NULL,
  title_ru TEXT NOT NULL,
  description_tr TEXT,
  description_en TEXT,
  description_ka TEXT,
  description_ru TEXT,
  is_dental BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2️⃣ Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_icd10_codes_code ON icd10_codes(code);
CREATE INDEX IF NOT EXISTS idx_icd10_codes_category ON icd10_codes(category);

-- 3️⃣ Enable RLS (Row Level Security)
ALTER TABLE icd10_codes ENABLE ROW LEVEL SECURITY;

-- 4️⃣ RLS Policy - Everyone can read ICD codes
CREATE POLICY "Public read access for ICD-10 codes" ON icd10_codes
  FOR SELECT USING (true);

-- 5️⃣ Insert Dental Codes (K00-K14) - WHO Source
INSERT INTO icd10_codes (code, category, title_tr, title_en, title_ka, title_ru, description_tr, description_en, description_ka, description_ru, is_dental) VALUES
-- K00: Disorders of tooth development and eruption
('K00.0', 'K00', 'Anodonti', 'Anodontia', 'ანოდონტია', 'Анодонтия', 'Doğuştan diş eksikliği', 'Congenital absence of teeth', 'კონგენიტალური კბილების არარსებობა', 'Врожденное отсутствие зубов', true),
('K00.1', 'K00', 'Süpernümerer dişler', 'Supernumerary teeth', 'ზედმეტი კბილები', 'Сверхкомплектные зубы', 'Normal diş sayısından fazla diş', 'Teeth in excess of the normal complement', 'ნორმაზე მეტი კბილების რაოდენობა', 'Зубы в избытке нормального количества', true),
('K00.2', 'K00', 'Makrodonti', 'Macrodontia', 'მაკროდონტია', 'Макродонтия', 'Anormal büyük dişler', 'Abnormally large teeth', 'ანომალურად დიდი კბილები', 'Аномально большие зубы', true),
('K00.3', 'K00', 'Mikrodonti', 'Microdontia', 'მიკროდონტია', 'Микродонтия', 'Anormal küçük dişler', 'Abnormally small teeth', 'ანომალურად პატარა კბილები', 'Аномально маленькие зубы', true),
('K00.4', 'K00', 'Dislazi', 'Dysplasia of enamel', 'ემალის დისპლაზია', 'Дисплазия эмали', 'Mineralizasyon bozukluğu', 'Disturbance of enamel formation', 'ემალის ფორმირების დარღვევა', 'Нарушение формирования эмали', true),
('K00.5', 'K00', 'Diş mine bozuklukları', 'Other hereditary dentine defects', 'სხვა მემკვიდერული დენტინის დეფექტები', 'Другие наследственные дефекты дентина', 'Diğer kalıtsal dentin defektleri', 'Other hereditary dentine defects', 'სხვა მემკვიდერული დენტინის დეფექტები', true),
('K00.6', 'K00', 'Diş gelişim bozuklukları', 'Disturbances in tooth eruption', 'კბილების გამოჩენების დარღვევები', 'Нарушения прорезывания зубов', 'Diş çıkma bozuklukları', 'Disturbances in tooth eruption', 'კბილების გამოჩენების დარღვევები', true),

-- K01: Impacted and embedded teeth
('K01.0', 'K01', 'Gömülü dişler', 'Embedded teeth', 'ჩამჯერთესული კბილები', 'Ретенированные зубы', 'Kemik içinde kalmış dişler', 'Teeth embedded within the jaw', 'კბილები ჩამჯერთესული ყბილში', 'Зубы, заключенные в челюсти', true),
('K01.1', 'K01', 'Çıkmamış dişler', 'Impacted teeth', 'ჩაჭირვნილი კბილები', 'Ретенированные зубы', 'Çıkmamış dişler', 'Teeth impacted within the jaw', 'ჩაჭირვნილი კბილები ყბილში', 'Зубы, ретенированные в челюсти', true),

-- K02: Dental caries
('K02.0', 'K02', 'Diş çürüğü', 'Dental caries', 'კარიესი', 'Кариес', 'Diş çürüğü', 'Dental caries', 'კარიესი', 'Кариес', true),
('K02.1', 'K02', 'Mine çürüğü', 'Caries of enamel', 'ემალის კარიესი', 'Кариес эмали', 'Mine çürüğü', 'Caries of enamel', 'ემალის კარიესი', 'Кариес эмали', true),
('K02.2', 'K02', 'Dentin çürüğü', 'Caries of dentine', 'დენტინის კარიესი', 'Кариес дентина', 'Dentin çürüğü', 'Caries of dentine', 'დენტინის კარიესი', 'Кариес дентина', true),
('K02.3', 'K02', 'Sement çürüğü', 'Caries of cementum', 'ცემენტის კარიესი', 'Кариес цемента', 'Sement çürüğü', 'Caries of cementum', 'ცემენტის კარიესი', 'Кариес цемента', true),
('K02.4', 'K02', 'Durmuş çürüğü', 'Arrested dental caries', 'შეჩერებული კარიესი', 'Приостановленный кариес', 'Durmuş çürüğü', 'Arrested dental caries', 'შეჩერებული კარიესი', 'Приостановленный кариес', true),
('K02.5', 'K02', 'Diş çürğü kökenli diş absesi', 'Odontogenic abscess, sinus tract', 'კბილის წარმომომავლი აბსცესი, სინუსური ტრაქტი', 'Одонтогенный абсцесс, свищевой ход', 'Diş çürüğü kökenli diş absesi', 'Odontogenic abscess, sinus tract', 'კბილის წარმომომავლი აბსცესი, სინუსური ტრაქტი', 'Одонтогенный абсцесс, свищевой ход', true),
('K02.6', 'K02', 'Diş çürüğü kökenli kist', 'Odontogenic cyst, sinus tract', 'კბილის წარმომომავლი კისტა, სინუსური ტრაქტი', 'Одонтогенная киста, свищевой ход', 'Diş çürüğü kökenli kist', 'Odontogenic cyst, sinus tract', 'კბილის წარმომომავლი კისტა, სინუსური ტრაქტი', 'Одонтогенная киста, свищевой ход', true),
('K02.7', 'K02', 'Diş kökü erozyonu', 'Dental erosion', 'კბილის ფესვის ეროზია', 'Эрозия зубов', 'Diş kökü erozyonu', 'Dental erosion', 'კბილის ფესვის ეროზია', 'Эрозия зубов', true),
('K02.8', 'K02', 'Diş kökü aşınımı', 'Other specified dental caries', 'კბილის სხვა მიზედ კარიესი', 'Другой уточненный кариес зубов', 'Diş kökü aşınımı', 'Other specified dental caries', 'კბილის სხვა მიზედ კარიესი', 'Другой уточненный кариес зубов', true),
('K02.9', 'K02', 'Belirtilmemiş diş çürüğü', 'Dental caries, unspecified', 'კბილის კარიესი, არადგანილი', 'Кариес зубов неуточненный', 'Belirtilmemiş diş çürüğü', 'Dental caries, unspecified', 'კბილის კარიესი, არადგანილი', 'Кариес зубов неуточненный', true),

-- K03: Other diseases of hard tissues of teeth
('K03.0', 'K03', 'Diş aşınımı', 'Excessive attrition of teeth', 'კბილების ჭარბილი დაზვრება', 'Чрезмерное стирание зубов', 'Diş aşınımı', 'Excessive attrition of teeth', 'კბილების ჭარბილი დაზვრება', 'Чрезмерное стирание зубов', true),
('K03.1', 'K03', 'Diş aşınması (abrazyon)', 'Excessive abrasion of teeth', 'კბილების გაპრედამეტება', 'Чрезмерная абразия зубов', 'Diş aşınması (abrazyon)', 'Excessive abrasion of teeth', 'კბილების გაპრედამეტება', 'Чрезмерная абразия зубов', true),
('K03.2', 'K03', 'Diş erozyonu', 'Erosion of teeth', 'კბილების ეროზია', 'Эрозия зубов', 'Diş erozyonu', 'Erosion of teeth', 'კბილების ეროზია', 'Эрозия зубов', true),
('K03.3', 'K03', 'Diş aşınması (abrazyon)', 'Pathological resorption of teeth', 'კბილების პათოლოგიური რეზორფსია', 'Патологическая резорбция зубов', 'Diş aşınımı (abrazyon)', 'Pathological resorption of teeth', 'კბილების პათოლოგიური რეზორფსია', 'Патологическая резорбция зубов', true),
('K03.4', 'K03', 'Hiperasentez', 'Hypercementosis', 'ჰიპერცემენტოზისი', 'Гиперцементоз', 'Hiperasentez', 'Hypercementosis', 'ჰიპერცემენტოზისი', 'Гиперцементоз', true),
('K03.5', 'K03', 'Ankiloz', 'Ankylosis of teeth', 'კბილების ანკილოზი', 'Анкилоз зубов', 'Ankiloz', 'Ankylosis of teeth', 'კბილების ანკილოზი', 'Анкилоз зубов', true),
('K03.6', 'K03', 'Diş kökü depozisyonları', 'Deposits on teeth', 'კბილებზე დეპოზიტები', 'Отложения на зубах', 'Diş kökü depozisyonları', 'Deposits on teeth', 'კბილებზე დეპოზიტები', 'Отложения на зубах', true),
('K03.7', 'K03', 'Diş kökü renk değişikliği', 'Changes in colour of teeth', 'კბილების ფერის ცვლილება', 'Изменения цвета зубов', 'Diş kökü renk değişikliği', 'Changes in colour of teeth', 'კბილების ფერის ცვლილება', 'Изменения цвета зубов', true),
('K03.8', 'K03', 'Diş kökü değişikliği', 'Other specified diseases of hard tissues of teeth', 'კბილების მყარი ქსოვლების სხვა მიზედ დაავადება', 'Другие уточненные болезни твердых тканей зубов', 'Diş kökü değişikliği', 'Other specified diseases of hard tissues of teeth', 'კბილების მყარი ქსოვლების სხვა მიზედ დაავადება', 'Другие уточненные болезни твердых тканей зубов', true),
('K03.9', 'K03', 'Belirtilmemiş diş kökü hastalığı', 'Disease of hard tissues of teeth, unspecified', 'კბილების მყარი ქსოვლების დაავადება, არადგანილი', 'Болезнь твердых тканей зубов неуточненная', 'Belirtilmemiş diş kökü hastalığı', 'Disease of hard tissues of teeth, unspecified', 'კბილების მყარი ქსოვლების დაავადება, არადგანილი', 'Болезнь твердых тканей зубов неуточненная', true),

-- K04: Pulp and periapical tissues
('K04.0', 'K04', 'Pulpit', 'Pulpitis', 'პულპიტი', 'Пульпит', 'Pulpit', 'Pulpitis', 'პულპიტი', 'Пульпит', true),
('K04.1', 'K04', 'Nekrotik pulpit', 'Necrosis of pulp', 'პულპის ნეკროზი', 'Некроз пульпы', 'Nekrotik pulpit', 'Necrosis of pulp', 'პულპის ნეკროზი', 'Некроз пульпы', true),
('K04.2', 'K04', 'Diş pulpası dejenerasyonu', 'Degeneration of pulp', 'პულპის დეგენერაცია', 'Дегенерация пульпы', 'Diş pulpası dejenerasyonu', 'Degeneration of pulp', 'პულპის დეგენერაცია', 'Дегенерация пульпы', true),
('K04.3', 'K04', 'Diş pulpası sertleşmesi', 'Hardening of pulp', 'პულპის გამაგრძლობა', 'Уплотнение пульпы', 'Diş pulpası sertleşmesi', 'Hardening of pulp', 'პულპის გამაგრძლობა', 'Уплотнение пульпы', true),
('K04.4', 'K04', 'Apikal periodontit', 'Acute apical periodontitis', 'აპიკალური პერიოდონტიტი', 'Острый апикальный периодонтит', 'Apikal periodontit', 'Acute apical periodontitis', 'აპიკალური პერიოდონტიტი', 'Острый апикальный периодонтит', true),
('K04.5', 'K04', 'Kronik apikal periodontit', 'Chronic apical periodontitis', 'ქრონიკური აპიკალური პერიოდონტიტი', 'Хронический апикальный периодонтит', 'Kronik apikal periodontit', 'Chronic apical periodontitis', 'ქრონიკური აპიკალური პერიოდონტიტი', 'Хронический апикальный периодонтит', true),
('K04.6', 'K04', 'Periapikal abs', 'Periapical abscess without sinus tract', 'აპიკალური აბსცესი სინუსური ტრაქტის გარეშე', 'Апикальный абсцесс без свищевого хода', 'Periapikal abs', 'Periapical abscess without sinus tract', 'აპიკალური აბსცესი სინუსური ტრაქტის გარეშე', 'Апикальный абсцесс без свищевого хода', true),
('K04.7', 'K04', 'Periapikal abs', 'Periapical abscess with sinus tract', 'აპიკალური აბსცესი სინუსური ტრაქტით', 'Апикальный абсцесс со свищевым ходом', 'Periapikal abs', 'Periapical abscess with sinus tract', 'აპიკალური აბსცესი სინუსური ტრაქტით', 'Апикальный абсцесс со свищевым ходом', true),
('K04.8', 'K04', 'Radiküler kist', 'Radicular cyst', 'რადიკულური კისტა', 'Радикулярная киста', 'Radiküler kist', 'Radicular cyst', 'რადიკულური კისტა', 'Радикулярная киста', true),
('K04.9', 'K04', 'Belirtilmemiş pulpa ve apikal periodontal hastalıklar', 'Other and unspecified diseases of pulp and periapical tissues', 'პულპისა და აპიკალური ქსოვლების სხვა და არადგანილი დაავადება', 'Другие и неуточненные болезни пульпы и периапикальных тканей', 'Belirtilmemiş pulpa ve apikal periodontal hastalıklar', 'Other and unspecified diseases of pulp and periapical tissues', 'პულპისა და აპიკალური ქსოვლების სხვა და არადგანილი დაავადება', 'Другие и неуточненные болезни пульпы и периапикальных тканей', true),

-- K05: Gingivitis and periodontal diseases
('K05.0', 'K05', 'Akut gingivit', 'Acute gingivitis', 'აკუტური გინგივიტი', 'Острый гингивит', 'Akut gingivit', 'Acute gingivitis', 'აკუტური გინგივიტი', 'Острый гингивит', true),
('K05.1', 'K05', 'Kronik gingivit', 'Chronic gingivitis', 'ქრონიკური გინგივიტი', 'Хронический гингивит', 'Kronik gingivit', 'Chronic gingivitis', 'ქრონიკური გინგივიტი', 'Хронический гингивит', true),
('K05.2', 'K05', 'Agresif periodontit', 'Aggressive periodontitis', 'აგრესიული პერიოდონტიტი', 'Агрессивный периодонтит', 'Agresif periodontit', 'Aggressive periodontitis', 'აგრესიული პერიოდონტიტი', 'Агрессивный периодонтит', true),
('K05.3', 'K05', 'Kronik periodontit', 'Chronic periodontitis', 'ქრონიკური პერიოდონტიტი', 'Хронический периодонтит', 'Kronik periodontit', 'Chronic periodontitis', 'ქრონიკური პერიოდონტიტი', 'Хронический периодонтит', true),
('K05.4', 'K05', 'Periodontit', 'Periodontitis, unspecified', 'პერიოდონტიტი, არადგანილი', 'Периодонтит неуточненный', 'Periodontit', 'Periodontitis, unspecified', 'პერიოდონტიტი, არადგანილი', 'Периодонтит неуточненный', true),
('K05.5', 'K05', 'Diş eti hastalıkları', 'Other diseases of gingiva and periodontium', 'კბილების და პერიოდონტიუმის სხვა დაავადება', 'Другие болезни десен и пародонта', 'Diş eti hastalıkları', 'Other diseases of gingiva and periodontium', 'კბილების და პერიოდონტიუმის სხვა დაავადება', 'Другие болезни десен и пародонта', true),
('K05.6', 'K05', 'Belirtilmemiş diş eti hastalığı', 'Disease of gingiva and periodontium, unspecified', 'კბილების და პერიოდონტიუმის დაავადება, არადგანილი', 'Болезнь десен и пародонта неуточненная', 'Belirtilmemiş diş eti hastalığı', 'Disease of gingiva and periodontium, unspecified', 'კბილების და პერიოდონტიუმის დაავადება, არადგანილი', 'Болезнь десен и пародонта неуточненная', true);

-- 6️⃣ Verify table creation
SELECT code, title_tr, is_dental FROM icd10_codes WHERE code LIKE 'K0%' ORDER BY code LIMIT 5;
