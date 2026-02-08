-- ICD-10 Dental Codes (K00-K14) - WHO Source
INSERT INTO icd10_codes (code, category, title_tr, title_en, title_ka, title_ru, description_tr, description_en, description_ka, description_ru, is_dental) VALUES
-- K00: Disorders of tooth development and eruption
('K00.0', 'K00', 'Anodonti', 'Anodontia', 'ანოდონტია', 'Анодонтия', 'Doğuştan diş eksikliği', 'Congenital absence of teeth', 'კონგენიტალური კბილების არარსებობა', 'Врожденное отсутствие зубов', true),
('K00.1', 'K00', 'Süpernümerer dişler', 'Supernumerary teeth', 'ზედმეტი კბილები', 'Сверхкомплектные зубы', 'Normal diş sayısından fazla diş', 'Teeth in excess of the normal complement', 'ნორმაზე მეტი კბილების რაოდენობა', 'Зубы в избытке нормального количества', true),
('K00.2', 'K00', 'Makrodonti', 'Macrodontia', 'მაკროდონტია', 'Макродонтия', 'Anormal büyük dişler', 'Abnormally large teeth', 'ანომალურად დიდი კბილები', 'Аномально большие зубы', true),
('K00.3', 'K00', 'Mikrodonti', 'Microdontia', 'მიკროდონტია', 'Микродонтия', 'Anormal küçük dişler', 'Abnormally small teeth', 'ანომალურად პატარა კბილები', 'Аномально маленькие зубы', true),
('K00.4', 'K00', 'Dislazi', 'Dysplasia of enamel', 'ემალის დისპლაზია', 'Дисплазия эмали', 'Mineralizasyon bozukluğu', 'Disturbance of enamel formation', 'ემალის ფორმირების დარღვევა', 'Нарушение формирования эмали', true),

-- K01: Impacted and embedded teeth
('K01.0', 'K01', 'Çıkmamış diş', 'Impacted teeth', 'ჩარჩობილი კბილები', 'Ретенированные зубы', 'Dişin çıkamaması', 'Failure of tooth eruption', 'კბილის არ ამოსვლა', 'Невозможность прорезывания зуба', true),
('K01.1', 'K01', 'Gömülü diş', 'Embedded teeth', 'ჩარჩობილი კბილები', 'Вколоченные зубы', 'Dişin kemik içinde kalması', 'Tooth completely embedded in bone', 'კბილის ძვლის შიგნით სრულად მოთავსება', 'Зуб полностью погружен в кость', true),

-- K02: Dental caries
('K02.0', 'K02', 'Mine çürüğü', 'Caries limited to enamel', 'ემალის კარიესი', 'Кариес, ограниченный эмалью', 'Sadece mineyi etkileyen çürük', 'Caries confined to enamel', 'კარიესი, რომელიც შემოფარულია ემალით', 'Кариес, ограниченный эмалью', true),
('K02.1', 'K02', 'Dentin çürüğü', 'Caries of dentine', 'დენტინის კარიესი', 'Кариес дентина', 'Mine ve dentini etkileyen çürük', 'Caries involving dentine', 'კარიესი, რომელიც მოიცავს დენტინს', 'Кариес, вовлекающий дентин', true),
('K02.2', 'K02', 'Pulpa çürüğü', 'Caries of pulp', 'პულპის კარიესი', 'Кариес пульпы', 'Pulpayı etkileyen çürük', 'Caries of pulp', 'პულპის კარიესი', 'Кариес пульпы', true),
('K02.3', 'K02', 'İleri çürük', 'Arrested dental caries', 'შეჩერებული დენტალური კარიესი', 'Приостановленный кариес', 'Durmuş çürük lezyonu', 'Inactive dental caries', 'არააქტიური დენტალური კარიესი', 'Неактивный кариес', true),

-- K03: Other diseases of hard tissues of teeth
('K03.0', 'K03', 'Aşınma', 'Attrition of teeth', 'კბილების ატრიბუცია', 'Атрития зубов', 'Diş yüzeyinin aşınması', 'Wear of teeth', 'კბილების დაცემა', 'Износ зубов', true),
('K03.1', 'K03', 'Abrasyon', 'Abrasion of teeth', 'კბილების აბრაზია', 'Абразия зубов', 'Mekanik aşınma', 'Loss of tooth substance from mechanical factors', 'მექანიკური ფაქტორებისგან კბილის ნივთიერების დაკარგვა', 'Потеря вещества зуба от механических факторов', true),
('K03.2', 'K03', 'Erozyon', 'Erosion of teeth', 'კბილების ეროზია', 'Эрозия зубов', 'Kimyasal aşınma', 'Loss of tooth substance from non-bacterial chemical agents', 'არაბაქტერიული ქიმიური აგენტებისგან კბილის ნივთიერების დაკარგვა', 'Потеря вещества зуба от небактериальных химических агентов', true),

-- K04: Pulp and periapical diseases
('K04.0', 'K04', 'Pulpit', 'Pulpitis', 'პულპიტი', 'Пульпит', 'Pulpa iltihabı', 'Inflammation of the pulp', 'პულპის ანთება', 'Воспаление пульпы', true),
('K04.1', 'K04', 'Nekroz', 'Necrosis of pulp', 'პულპის ნეკროზი', 'Некроз пульпы', 'Pulpa ölümü', 'Death of pulp', 'პულპის სიკვდილი', 'Смерть пульпы', true),
('K04.2', 'K04', 'Apikal periodontit', 'Periapical abscess without sinus', 'პერიაპიკალური აბსცესი ურთიერთობის გარეშე', 'Периапикальный абсцесс без свища', 'Apikal abs', 'Periapical abscess with sinus', 'პერიაპიკალური აბსცესი ურთიერთობით', 'Периапикальный абсцесс со свищом', true),

-- K05: Gingival and periodontal diseases
('K05.0', 'K05', 'Akut gingivit', 'Acute gingivitis', 'მწვავე გინგივიტი', 'Острый гингивит', 'Akut diş eti iltihabı', 'Acute inflammation of the gums', 'ღრძილების მწვავე ანთება', 'Острое воспаление десен', true),
('K05.1', 'K05', 'Kronik gingivit', 'Chronic gingivitis', 'ქრონიკული გინგივიტი', 'Хронический гингивит', 'Kronik diş eti iltihabı', 'Chronic inflammation of the gums', 'ღრძილების ქრონიკული ანთება', 'Хроническое воспаление десен', true),
('K05.2', 'K05', 'Akut periodontit', 'Aggressive periodontitis', 'აგრესიული პერიოდონტიტი', 'Агрессивный периодонтит', 'Hızlı ilerleyen periodontal hastalık', 'Rapidly progressive periodontal disease', 'სწრაფად პროგრესირებადი პერიოდონტული დაავადება', 'Быстро прогрессирующее периодонтальное заболевание', true),

-- K06: Other gingival and edentulous alveolar ridge disorders
('K06.0', 'K06', 'Gingival retraksiyon', 'Gingival recession', 'გინგივალური რეცესია', 'Рецессия десны', 'Diş eti çekilmesi', 'Recession of gingiva', 'გინგივის რეცესია', 'Рецессия десны', true),
('K06.1', 'K06', 'Gingival hiperplazi', 'Gingival hyperplasia', 'გინგივალური ჰიპერპლაზია', 'Гиперплазия десны', 'Diş eti büyümesi', 'Overgrowth of gingiva', 'გინგივის ზრდა', 'Разрастание десны', true),

-- K07: Jaw-closing disorders
('K07.0', 'K07', 'Anormal kapanış', 'Major malocclusion', 'მთავარი მალოკლუზია', 'Основная аномалия прикуса', 'Çene kapanış bozukluğu', 'Major anomalies of jaw size', 'კბილების ზომის მთავარი ანომალიები', 'Основные аномалии размера челюсти', true),

-- K08: Other disorders of teeth and supporting structures
('K08.1', 'K08', 'Diş kırığı', 'Fracture of tooth', 'კბილის მოტეხვა', 'Перелом зуба', 'Dişin kırılması', 'Fracture of tooth', 'კბილის მოტეხვა', 'Перелом зуба', true),
('K08.2', 'K08', 'Diş kaybı', 'Atrophy of edentulous alveolar ridge', 'უკბილო ალვეოლური ქედის ატროფია', 'Атрофия беззубого альвеолярного гребня', 'Dişsiz kemik erimesi', 'Atrophy of alveolar ridge', 'ალვეოლური ქედის ატროფია', 'Атрофия альвеолярного гребня', true),

-- K09: Cysts of oral region
('K09.0', 'K09', 'Radiküler kist', 'Developmental odontogenic cysts', 'დეველოპმენტური ოდონტოგენური კისტები', 'Развивающиеся одонтогенные кисты', 'Gelişimsel diş kistleri', 'Developmental odontogenic cysts', 'დეველოპმენტური ოდონტოგენური კისტები', 'Развивающиеся одонтогенные кисты', true),

-- K10: Diseases of jaws
('K10.0', 'K10', 'Çene kisti', 'Disorders of development of jaws', 'კბილების განვითარების აშლილობები', 'Нарушения развития челюстей', 'Çene gelişim bozuklukları', 'Disorders of development of jaws', 'კბილების განვითარების აშლილობები', 'Нарушения развития челюстей', true),

-- K11: Salivary gland diseases
('K11.0', 'K11', 'Sialolitiazis', 'Atrophy of salivary glands', 'სალივარიული ჯირულების ატროფია', 'Атрофия слюнных желез', 'Tükrük bezi taşları', 'Sialolithiasis', 'სიალოლითიაზი', 'Сиалолитиаз', true),

-- K12: Stomatitis and related lesions
('K12.0', 'K12', 'Aftöz stomatit', 'Recurrent oral aphthae', 'რეციდივირებადი ორალური აფთები', 'Рецидивирующий афтозный стоматит', 'Aftlar', 'Recurrent oral aphthae', 'რეციდივირებადი ორალური აფთები', 'Рецидивирующий афтозный стоматит', true),

-- K13: Other diseases of lip and oral mucosa
('K13.0', 'K13', 'Lezyon', 'Diseases of lips', 'ტუჩების დაავადებები', 'Заболевания губ', 'Dudak hastalıkları', 'Diseases of lips', 'ტუჩების დაავადებები', 'Заболевания губ', true),

-- K14: Diseases of tongue
('K14.0', 'K14', 'Dil lezyonu', 'Glossodynia', 'გლოსოდინია', 'Глоссодиния', 'Dil ağrısı', 'Glossodynia', 'გლოსოდინია', 'Глоссодиния', true);
