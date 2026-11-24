-- Eighteen backup tables that anyone could read, change or empty.
--
-- On 7 Nov an outside account signed itself up and logged in. Public sign-up
-- was closed on 10 Nov, and 0030_signed_in_must_be_staff.sql added a
-- RESTRICTIVE policy to every table with row-level security switched on.
--
-- These eighteen do not have it switched on, so that policy never runs. A
-- RESTRICTIVE policy is ANDed with the permissive ones only where RLS applies;
-- where RLS is off, Postgres consults no policy at all and the table grants
-- decide. Theirs grant `anon` SELECT, INSERT, UPDATE, DELETE and TRUNCATE.
--
-- `anon` is the public key compiled into the published app. So this was not
-- "any signed-in account" - it was anyone at all who had opened the site, with
-- no login, and the audit still read "161 of 161 tables guarded" because it
-- counted only the tables RLS was on for.
--
-- What is in them: 27,029 patient names, 27,032 demographic records, 37,163
-- invoice HSN rows, 30,816 invoice service names, 28,340 invoice breakdown
-- rows, 9,565 WhatsApp delivery rows, and smaller sets behind those.
--
-- Nothing reads them. Every name below was checked against src/: the only hits
-- are the generated Supabase types, the migrations that created them, and two
-- edge functions - sf-refresh-patient-names and sf-import-demographics - which
-- use SUPABASE_SERVICE_ROLE_KEY. The service role bypasses both RLS and grants,
-- so they are unaffected and so is the currently published build.
--
-- Written as an explicit LIST rather than "every table where relrowsecurity is
-- false". A loop over that condition would silently swallow any table added
-- later that genuinely needs anon - the shop and the public catalogue both rely
-- on anon policies, and a migration that quietly shuts them is worse than the
-- hole it closes.
--
-- Stricter than the 5 and 10 Nov backup tables, which grant staff `select`:
-- these keep nothing but service_role, because nothing in the app looks at
-- them. Restoring from one is a deliberate act through SQL, not a screen.

do $$
declare
  t text;
  v_names text[] := array[
    'invoice_breakdown_backup_20260922',
    'invoice_hsn_backup_20260922',
    'invoice_hsn_topup_backup_20260922',
    'invoice_number_series_20260926',
    'invoice_service_name_backup_20260923',
    'invoices_dummy_backup_20260922',
    'media_dupes_backup_20260922',
    'patient_feedback_backup_20261029',
    'patient_name_backup_20261006',
    'patient_referral_doctor_corrections',
    'patients_demographics_backup_20260921',
    'patients_name_backup_20260921',
    'procedures_date_backup_20260921',
    'procedures_service_backup_20260922',
    'test_appointments_backup_20260922',
    'test_patients_backup_20260922',
    'test_procedures_backup_20260922',
    'whatsapp_delivery_log_backup_20261014'
  ];
  v_locked int := 0;
  v_missing text := '';
  v_leftover text := '';
begin
  foreach t in array v_names loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind in ('r', 'p')
    ) then
      -- Already dropped on this database. Not a failure: the point is that it
      -- is not reachable, and a table that does not exist is not reachable.
      v_missing := v_missing || t || ' ';
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    -- With RLS on and no permissive policy, nothing signed in gets a row
    -- anyway. This is added so the AGENTS.md invariant - every RLS-enabled
    -- public table carries signed_in_must_be_staff - stays literally true, and
    -- a coverage query cannot read 100% while skipping these.
    execute format('drop policy if exists signed_in_must_be_staff on public.%I', t);
    execute format(
      'create policy signed_in_must_be_staff on public.%I as restrictive '
      'for all to authenticated '
      'using ((select public.is_active_staff())) '
      'with check ((select public.is_active_staff()))', t);

    v_locked := v_locked + 1;
  end loop;

  -- Prove it, rather than assume it. A revoke that silently did nothing would
  -- leave the hole open and this file looking like it had closed it.
  select string_agg(distinct table_name, ' ') into v_leftover
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and table_name = any (v_names);

  if v_leftover is not null then
    raise exception 'anon or authenticated still hold privileges on: %', v_leftover;
  end if;

  raise notice 'Locked % tables; already absent: %', v_locked, coalesce(nullif(v_missing, ''), 'none');
end $$;

-- ── The account that let us find all this ────────────────────────────────────
--
-- analarajesh2769@gmail.com created itself through the open sign-up on 7 Nov
-- 2026 and signed in the same day. It is not staff, so since 10 Nov it reaches
-- nothing; the clinic asked for it removed outright.
--
-- Checked first across every uuid column in the public schema named *_by,
-- *user_id* or owner_id: ZERO rows reference it. It created nothing, changed
-- nothing and owns nothing, so the delete orphans nothing.
--
-- The four older test accounts (test123@, test54@, testing@, test-exists@)
-- stay, by the clinic's choice.
--
-- Keyed by id AND email, and only while it still has no staff record - so if
-- that id is ever given to a real person, this does nothing.
do $$
declare
  v_user uuid := 'b8e69e57-e62d-43ed-a3b1-39275adb6f5e';
  v_email text := 'analarajesh2769@gmail.com';
  v_before int;
  v_after int;
begin
  if not exists (select 1 from auth.users where id = v_user and email = v_email) then
    raise notice 'Account % is already gone - nothing to remove', v_email;
    return;
  end if;

  if exists (select 1 from public.staff where auth_user_id = v_user) then
    raise exception 'Account % now has a staff record - refusing to delete it', v_email;
  end if;

  select count(*) into v_before from auth.users;
  delete from auth.users where id = v_user and email = v_email;
  select count(*) into v_after from auth.users;

  if v_before - v_after <> 1 then
    raise exception 'Expected exactly one account to go, but the count moved from % to %',
      v_before, v_after;
  end if;

  raise notice 'Removed the self-signed-up account %', v_email;
end $$;
