-- Lab tests printed twice on the prescription, once labelled Symptoms.
--
-- Dr Nilufer's document showed:
--
--   Symptoms    Lab Tests: Vitamin d3 / Viatmin B12 / TSH / Hb / Serum ferittin
--   Lab Tests   Vitamin d3 / Viatmin B12 / TSH / Hb / Serum ferittin
--
-- The same five tests, one row apart, and neither of them a symptom.
--
-- Why: lab tests used to be folded into the consultation notes blob, before
-- they were given a column of their own. The importer stopped doing it - its
-- own comment says "Lab tests now have their own column (and print on the
-- prescription), so they are no longer folded into the consultation notes
-- blob" - but the rows written before that change still carry the old text.
-- The prescription PDF falls back to consultation_notes when symptoms is
-- empty, under the heading "Symptoms", so out it came.
--
-- 5,354 procedures carry it, and every single one of them also has the
-- lab_tests column filled: it is duplication in all 5,354 cases, not a last
-- remaining copy of anything.
--
-- Removed by exact substring - 'Lab Tests: ' || lab_tests - which matched all
-- 5,354 exactly, so nothing is matched approximately and nothing else in the
-- blob is touched. What is left is tidied of the blank line the removal
-- leaves behind, and set to NULL when the lab tests were all it held.
--
-- Result: 2,807 rows held nothing else and are now empty; 2,547 kept their
-- Advice, History and Payment Instruction content; 0 lost anything else.
-- lab_tests itself is not written here at all - the tests keep their own
-- column, which is what prints on the document.
--
-- Previous values are in procedure_notes_backup_20260923.

UPDATE public.procedures
SET consultation_notes = NULLIF(
      regexp_replace(
        regexp_replace(
          replace(consultation_notes, 'Lab Tests: ' || lab_tests, ''),
          E'[\r\n][ \t]*[\r\n]+', E'\n', 'g'),
        E'^[\\s]+|[\\s]+$', '', 'g'),
      ''),
    updated_at = updated_at
WHERE consultation_notes ILIKE '%Lab Tests:%'
  AND lab_tests IS NOT NULL
  AND trim(lab_tests) <> ''
  -- Only where the column's contents appear verbatim in the blob.
  AND position('Lab Tests: ' || lab_tests IN consultation_notes) > 0;
