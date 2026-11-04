-- Throw the switch that 20260910000000 built and never threw.
--
-- The clinic reported doctors seeing each other's invoices, and a patient's
-- phone number showing where it should have been masked. None of the
-- machinery was missing. invoices has carried RESTRICTIVE select/update/delete
-- policies since 20260910000000; PatientDetail masks phone and e-mail through
-- is_my_patient(); Billing and the invoice reports hide the doctor filter. All
-- of it keys off one value, and has_full_data_scope() returns true unless the
-- role says exactly 'own' - so with the Doctor role left on 'all', every
-- restrictive policy passed and the masking never engaged.
--
-- 20260910000000 ends with this same UPDATE. Its column, its function and its
-- policies are all present in this database, but the UPDATE is not: that
-- migration was applied by hand rather than through the runner, and
-- supabase_migrations.schema_migrations stops at 20260909171720. So the last
-- statement was simply never run here. Nothing changed it back - the
-- application only ever reads data_scope (useAuth.tsx), never writes it.
--
-- Dr Vindhya Pai is on the Admin role, so she keeps the full billing view,
-- which is exactly the arrangement the clinic asked for.
--
-- This does not touch clinical records. 20260923000000 deliberately unscoped
-- appointments, procedures, prescriptions, photos, attachments, surveys and
-- notes so doctors can cover for each other, and that stands. Billing is what
-- stays private.

UPDATE public.user_roles_config
   SET data_scope = 'own'
 WHERE lower(name) = 'doctor';
