-- Drop the "(Dr. …)" the old importer glued onto the Investigation text.
--
-- sf-import-clinical used to append the appointment's doctor to
-- reason_for_consultation as "(Dr. <name>)", on top of a Salesforce name that
-- already began with "Dr" - so the Appointments list reads
-- "Review (Dr. Dr PUNYA SUVARNA)", with the doctor repeated twice beside a
-- column that already shows the doctor. Where Salesforce recorded no
-- Investigation__c or Description__c at all, the cell is ONLY the suffix:
-- "(Dr. Dr PUNYA SUVARNA)", which tells the front desk nothing.
--
-- The importer no longer appends it, but nothing rewrites rows already stored:
-- an existing appointment is only refreshed by a recent-mode sync covering its
-- own date, which for a 2020 appointment will never happen. Without this, those
-- rows carry the duplicated name forever.
--
-- ONLY A TRAILING "(Dr. " PARENTHETICAL IS REMOVED, and the period matters.
-- The clinic writes its own parenthetical notes, which have to survive:
--
--   "Review (Dr. Dr PUNYA SUVARNA)"
--     -> "Review"
--   "(Dr. Dr PUNYA SUVARNA)"
--     -> NULL, so the column shows an em dash rather than an empty cell
--   "…Photofractional Treatment (Only IPL was done) last session on 20/8/2026 (Dr. Dr PUNYA SUVARNA)"
--     -> keeps "(Only IPL was done)"
--   "Complimentary Laser Toning (Dr V pai has to be there) (Dr. Dr. Vindhya Pai  M.B.B.S. MD)"
--     -> keeps "(Dr V pai has to be there)"
--
-- That last one is why the pattern requires "Dr." with the period: the clinic
-- writes "(Dr V pai has to be there)" - "Dr" with no period - as a real
-- instruction to staff, and only the importer's own suffix uses "(Dr. ".
--
-- public.clean_investigation_text() is deliberately NOT reused here. It strips
-- every parenthetical anywhere in the string, which is correct for deciding
-- whether a visit was a consultation but would destroy "(Only IPL was done)"
-- and "(V Pai has to be there always)". Two different jobs, two rules.
--
-- A ROW WHOSE DOCTOR ISN'T RECORDED ANYWHERE ELSE IS LEFT ALONE.
--
-- The suffix is only safe to remove because the doctor already has their own
-- column. On 1,582 appointments in this clinic's data it does not: staff_id is
-- null because buildDoctorMap() in the importer could not match the Salesforce
-- name to any staff row (a doctor who has since left, or a name spelt
-- differently). For those the text is the ONLY record of who saw the patient,
-- so the ugly suffix stays - a duplicated name is worth far less than a lost
-- one, and this is a clinical record.
--
-- The guard is deliberately the blunt "staff_id IS NOT NULL" rather than
-- "only when the cell would end up empty": "Review (Dr. Dr X)" on a row with no
-- staff_id loses the doctor just as surely as "(Dr. Dr X)" does.
--
-- Re-running this changes nothing: once the suffix is gone the WHERE no longer
-- matches. That also makes it the right thing to run AGAIN after those doctors
-- are matched to staff records - the rows skipped today clean themselves up
-- then, with no edit to this file.

UPDATE public.appointments
   SET reason_for_consultation =
         nullif(btrim(regexp_replace(reason_for_consultation, '\s*\(Dr\.\s[^()]*\)\s*$', '')), '')
 WHERE source = 'salesforce'
   AND staff_id IS NOT NULL
   AND reason_for_consultation ~ '\(Dr\.\s[^()]*\)\s*$';
