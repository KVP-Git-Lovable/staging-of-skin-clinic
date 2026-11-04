-- Merge the service rows that were stored twice.
--
-- A doctor entered one service and the visit kept two of it - the screen
-- showed "Service 1 HYDRASIGNATURE" and "Service 2 HYDRASIGNATURE" with the
-- same notes. The cause is fixed in the prescription screen (see
-- matchStoredRows in src/lib/serviceLineSave.ts): a line invented from the
-- parent row carries no id, and saving inserted it rather than writing it
-- back to the row it was really about.
--
-- Seven visits were left holding copies, one of them three. The copy to keep
-- is the one holding the most: the service id, the material percentage - three
-- of the duplicates had lost it, which is what the material cost report reads
-- - or the longer notes where a doctor had gone back and added to them.
--
-- The eight rows to remove are listed by id rather than found by a query. A
-- clever query here could reach a row nobody has looked at; this cannot.
DELETE FROM public.procedure_services WHERE id IN (
  -- REVLITE LASER TONING A, 10 Oct: the copy without the 5% or the service id.
  '34af7c6a-49a0-443b-97c5-03f66b8fae8f',
  -- SCALP BOOSTER, 26 Sep: identical text, but the 45% was lost.
  '67da47a5-0574-4fa8-b1e1-05f77a877f52',
  -- RF under EMLA/LA, 7 Oct: the earlier copy - the doctor added to the notes
  -- in the later one, so that is the one that stays.
  '4cbcc9ae-710d-4cd7-a8ae-1cc6ef8ca18e',
  -- Consultation, 7 Oct: the empty copy; the medicines are on the other.
  '739ddcda-d382-4ac3-a94a-6f889ca74f69',
  -- RF under EMLA/LA, 12 Oct: saved three times in forty seconds. Both copies
  -- without the service id go.
  'adab48fa-906a-4436-bc28-77b917d9cf4e',
  'd4286644-8511-4d1d-b284-af11956dbf74',
  -- EXCIMER, 3 Oct: identical text, the 5% was lost.
  '69c1e018-0978-44cc-b5a7-221b79bdfb51',
  -- RADIANCE A, 2 Oct: identical text, no service id.
  '6fca2804-be40-4d0c-90e7-4a712c1c7f1c'
);
