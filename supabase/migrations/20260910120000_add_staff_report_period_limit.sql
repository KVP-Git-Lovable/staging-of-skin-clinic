-- Limit an individual account to day-at-a-time reporting.
--
-- This sits on staff rather than on the role, deliberately: the front-desk account
-- ("The Skin Clinic") carries the Admin role, the same role as Dr Vindhya Pai, who
-- must keep unrestricted reporting. A role-level flag could not separate the two.
--
-- It restricts the reporting date range only. Every other module - Appointments,
-- Billing, Procedures, Patients - is untouched, and the account keeps full visibility
-- of all doctors' data there.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS report_period_limit text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_report_period_limit_check'
  ) THEN
    ALTER TABLE public.staff
      ADD CONSTRAINT staff_report_period_limit_check
      CHECK (report_period_limit IN ('none', 'day'));
  END IF;
END $$;

COMMENT ON COLUMN public.staff.report_period_limit IS
  'none = any reporting date range; day = reports are limited to a single day at a time. Affects the Reports module only.';

-- Apply it to the front-desk account. Safe to re-run, and a no-op if the address
-- differs - set it from User Management instead in that case.
UPDATE public.staff
   SET report_period_limit = 'day'
 WHERE lower(email) = 'theskinclinic30@gmail.com';
