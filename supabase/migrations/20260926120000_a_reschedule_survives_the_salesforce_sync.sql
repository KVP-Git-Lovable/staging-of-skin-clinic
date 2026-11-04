-- Why Dr Punya's Monday reschedules came back, and who fixes it.
--
-- At 16:17:13 IST on 26 Sep one write touched 107 appointments across four
-- doctors, spanning appointment dates from Oct 2025 to Oct 2026, and her twenty
-- Monday (28 Sep) slots came back holding Salesforce's original times. One
-- write, one second, four doctors, a year of dates: sf-import-clinical's
-- date-window refresh. syncPatient gets refreshExisting = (mode === "recent"),
-- and that branch overwrites start_time and end_time straight from
-- Start_Time__c for every Salesforce-origin appointment in the window - which
-- is what the "Today / Last 7 days / Next 7 days / Next 30 days" buttons send.
-- The five-minute catch-up is not involved: it runs with no mode, so it only
-- inserts.
--
-- I first made this trigger preserve start_time/end_time on any row with
-- app_edited_at set, so the importer could never move an appointment a person
-- had edited. That is WITHDRAWN here, and this restores the plain body, for a
-- good reason: drizzle/migrations/0014 plus the LastModifiedDate check now in
-- sf-import-clinical decide this far better than a trigger can. The importer
-- skips the refresh when app_edited_at is newer than Salesforce's
-- LastModifiedDate, so staff edits win, but a visit genuinely rescheduled IN
-- Salesforce still comes through. A blanket trigger block had no way to tell
-- those apart and would have re-broken the case 0012 had just fixed - staff
-- delete the old slot, the clinic moves the visit in Salesforce, and the new
-- time must appear.
--
-- Residual gap, worth a future prompt: the importer compares
-- LastModifiedDate, so if a Salesforce record is touched for an unrelated
-- reason after an app-side reschedule, the refresh still proceeds and the old
-- time returns. Comparing Start_Time__c itself would close that.

create or replace function public.stamp_appointment_app_edit()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.app_edited_at := now();
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;
