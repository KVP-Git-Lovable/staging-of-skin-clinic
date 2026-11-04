-- Dietary Advice, as a field of its own
--
-- The clinic asked for a Dietary Advice box on the prescription, in the slot
-- Allergies used to hold, and for "Skin Concerns" to become it.
--
-- Renaming skin_concerns would have been wrong. That column does not hold skin
-- concerns: it holds the Salesforce consultation category, "Aesthetic" on 3,958
-- patients, "Clinical" on 1,203 and "Aesthetic and Clinical" on 203, with real
-- concern text on exactly one patient out of 27,117. Relabelling it would have
-- printed "Aesthetic" as those patients' dietary advice.
--
-- So this is a new column, empty for everyone, which is the truth: nobody has
-- been given dietary advice through this system yet. skin_concerns and
-- allergies keep their values and their meaning; they are simply no longer
-- asked for on the prescription screens.

alter table public.patients add column if not exists dietary_advice text;

comment on column public.patients.dietary_advice is
  'Dietary advice given to the patient. Shown on the prescription screens in place of Allergies.';
