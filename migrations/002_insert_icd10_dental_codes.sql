-- ICD-10 Dental Sub-Codes Insert
-- Complete dental diagnosis codes with hierarchical structure

-- Clear existing data
TRUNCATE TABLE icd10_dental_codes RESTART IDENTITY;

-- Insert ICD-10 Dental Codes
INSERT INTO icd10_dental_codes (code, parent_code, description) VALUES
-- K02 Dental Caries
('K02', NULL, 'Dental caries'),
('K02.0', 'K02', 'Caries limited to enamel'),
('K02.1', 'K02', 'Caries of dentine'),
('K02.2', 'K02', 'Caries of cementum'),
('K02.3', 'K02', 'Arrested dental caries'),
('K02.9', 'K02', 'Dental caries, unspecified'),

-- K03 Hard tissue disorders
('K03', NULL, 'Other diseases of hard tissues of teeth'),
('K03.0', 'K03', 'Excessive attrition'),
('K03.1', 'K03', 'Abrasion'),
('K03.2', 'K03', 'Erosion of teeth'),
('K03.6', 'K03', 'Deposits on teeth'),

-- K04 Pulp diseases
('K04', NULL, 'Diseases of pulp and periapical tissues'),
('K04.0', 'K04', 'Pulpitis'),
('K04.1', 'K04', 'Necrosis of pulp'),
('K04.4', 'K04', 'Acute apical periodontitis'),
('K04.5', 'K04', 'Chronic apical periodontitis'),

-- K05 Gingival diseases
('K05', NULL, 'Gingivitis and periodontal diseases'),
('K05.0', 'K05', 'Acute gingivitis'),
('K05.1', 'K05', 'Chronic gingivitis'),
('K05.3', 'K05', 'Chronic periodontitis'),

-- K08 Other disorders
('K08', NULL, 'Other disorders of teeth'),
('K08.1', 'K08', 'Loss of teeth due to accident'),
('K08.8', 'K08', 'Other specified disorders'),

-- Additional common dental codes
('K01', NULL, 'Developmental and inherited disorders of teeth'),
('K01.0', 'K01', 'Supernumerary teeth'),
('K01.1', 'K01', 'Mesiodens'),
('K01.2', 'K01', 'Concrescence'),
('K01.3', 'K01', 'Dilaceration'),
('K01.4', 'K01', 'Taurodontism'),

('K06', NULL, 'Other disorders of gingiva and edentulous alveolar ridge'),
('K06.0', 'K06', 'Gingival recession'),
('K06.1', 'K06', 'Gingival hyperplasia'),
('K06.2', 'K06', 'Lesions of gingiva and edentulous alveolar ridge'),

('K07', NULL, 'Jaw disorders'),
('K07.0', 'K07', 'Major anomalies of jaw size'),
('K07.1', 'K07', 'Anomalies of jaw-cranial base relationship'),
('K07.2', 'K07', 'Anomalies of dental arch relationship'),
('K07.3', 'K07', 'Anomalies of tooth position'),
('K07.4', 'K07', 'Anomalies of bite'),
('K07.5', 'K07', 'Anomalies of other temporomandibular joint function'),
('K07.6', 'K07', 'Temporomandibular joint disorders'),

('K09', NULL, 'Cysts of oral region and jaws'),
('K09.0', 'K09', 'Developmental odontogenic cysts'),
('K09.1', 'K09', 'Inflammatory odontogenic cysts'),
('K09.2', 'K09', 'Non-odontogenic cysts'),
('K09.8', 'K09', 'Other cysts of oral region'),
('K09.9', 'K09', 'Cyst of oral region, unspecified'),

('K10', NULL, 'Other diseases of jaws'),
('K10.0', 'K10', 'Disorders of development of jaws'),
('K10.1', 'K10', 'Giant cell lesions of jaws'),
('K10.2', 'K10', 'Inflammatory conditions of jaws'),
('K10.3', 'K10', 'Alveolitis of jaws'),
('K10.4', 'K10', 'Fistula of oral region');

-- Verify insertion
SELECT 
    code,
    parent_code,
    description,
    CASE 
        WHEN parent_code IS NULL THEN 'Main Category'
        ELSE 'Sub-code'
    END as level
FROM icd10_dental_codes 
ORDER BY 
    CASE WHEN parent_code IS NULL THEN 0 ELSE 1 END,
    code;
