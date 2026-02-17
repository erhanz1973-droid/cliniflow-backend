-- Remove suggested procedures table and data
DROP TABLE IF EXISTS diagnosis_procedure_suggestions;

-- Also remove any related indexes or constraints
DROP INDEX IF EXISTS idx_diagnosis_procedure_suggestions_icd10_code;
DROP INDEX IF EXISTS idx_diagnosis_procedure_suggestions_priority;
DROP INDEX IF EXISTS unique_diagnosis_procedure_suggestion;
