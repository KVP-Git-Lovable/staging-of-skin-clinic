-- Brings the STAGING database to the schema production runs.
--
-- Built from a read-only look at production's catalog (information_schema /
-- pg_catalog SELECTs only) compared against staging's own catalog. Nothing in
-- here points at production: no project ref, no URL, no key.
--
-- Deliberately NOT included:
--   * Salesforce sync: no pg_cron jobs, no sf_fire_function, no sf_clinical_catchup,
--     no promote_billing_lines, no sf_billing_* / sf_price_book_entries tables.
--     (Two tiny local tables, sf_deleted_records and sf_suppressed_inserts, and the
--     two helpers that read them are kept, because production's move_to_trash /
--     restore_from_trash / stamp_record_owner call them. They make no outside calls.)
--   * Production's one-off data fixes and *_backup_* snapshot tables.
--   * The attendance-photos bucket privacy change (needs its storage policies first).
--
-- Whole file is one transaction: if any statement fails nothing is applied.

begin;

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- new tables
create table public.ai_repository (id uuid not null default gen_random_uuid(), patient_id uuid not null, appointment_id uuid, kind text not null, title text not null, content jsonb not null, created_by uuid default auth.uid(), created_at timestamp with time zone not null default now());
create table public.appointment_sticky_notes (id uuid not null default gen_random_uuid(), appointment_id uuid not null, title text, content text not null default ''::text, created_by uuid, updated_by uuid, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), sf_id text);
create table public.attendance_config (id uuid not null default gen_random_uuid(), require_selfie boolean not null default true, capture_location boolean not null default true, face_match_threshold integer not null default 75, face_max_attempts integer not null default 3, updated_at timestamp with time zone not null default now(), updated_by uuid, singleton boolean not null default true);
create table public.google_review_opens (id uuid not null default gen_random_uuid(), patient_id uuid not null, appointment_id uuid, opened_by uuid, opened_at timestamp with time zone not null default now());
create table public.holidays (id uuid not null default gen_random_uuid(), date date not null, name text not null, description text, created_at timestamp with time zone not null default now(), created_by uuid);
create table public.impersonation_log (id uuid not null default gen_random_uuid(), actor_user_id uuid not null, actor_email text, target_user_id uuid not null, target_email text, target_name text, started_at timestamp with time zone not null default now(), ended_at timestamp with time zone);
create table public.knowledge_ai_state (id text not null default 'knowledge'::text, reason text not null, status_code integer not null, updated_at timestamp with time zone not null default now());
create table public.knowledge_article_categories (id uuid not null default gen_random_uuid(), name text not null, description text, is_active boolean not null default true, sort_order integer not null default 0, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.knowledge_articles (id uuid not null default gen_random_uuid(), service_id uuid not null, category_id uuid not null, title text not null, summary text not null default ''::text, gender text not null default 'both'::text, age_rule text not null default 'all_ages'::text, min_age integer, max_age integer, is_critical boolean not null default false, clinical_protocol text not null default ''::text, contraindications text not null default ''::text, pre_post_care text not null default ''::text, complications_management text not null default ''::text, sources text not null default ''::text, status text not null default 'draft'::text, is_active boolean not null default true, reviewed_by uuid, reviewed_at timestamp with time zone, ai_generated boolean not null default false, ai_change_summary text not null default ''::text, revision integer not null default 1, created_by uuid, updated_by uuid, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), resources jsonb not null default '[]'::jsonb, deleted_at timestamp with time zone, created_by_name text, updated_by_name text);
create table public.knowledge_article_comments (id uuid not null default gen_random_uuid(), article_id uuid not null, user_id uuid not null default auth.uid(), author_name text not null default ''::text, body text not null, created_at timestamp with time zone not null default now());
create table public.knowledge_article_opens (id uuid not null, article_id uuid not null, user_id uuid not null default auth.uid(), opened_at timestamp with time zone not null default now());
create table public.knowledge_article_revisions (id uuid not null default gen_random_uuid(), article_id uuid not null, revision integer not null, snapshot jsonb not null, changed_by uuid, changed_at timestamp with time zone not null default now(), changed_by_name text, changes jsonb not null default '{}'::jsonb);
create table public.knowledge_article_votes (id uuid not null default gen_random_uuid(), article_id uuid not null, user_id uuid not null default auth.uid(), vote smallint not null, updated_at timestamp with time zone not null default now());
create table public.list_view_defaults (user_id uuid not null, section text not null, view_id text not null, updated_at timestamp with time zone not null default now());
create table public.treatment_names (name text not null, source text not null, added_at timestamp with time zone not null default now());
create table public.week_off_config (id uuid not null default gen_random_uuid(), day_of_week integer not null, is_off boolean not null default false, alternate_pattern text, updated_at timestamp with time zone not null default now());
create table public.whatsapp_delivery_log (message_sid text not null, patient_id uuid, phone text not null, kind text not null default 'confirmation'::text, body_preview text, status text not null, error_code integer, error_message text, sent_at timestamp with time zone not null, updated_at timestamp with time zone not null default now());
create table public.whatsapp_thread_reads (user_id uuid not null, phone text not null, last_read_at timestamp with time zone not null default now());
-- local-only helpers used by the trash functions (no outside calls)
create table public.sf_deleted_records (object_type text not null, sf_id text not null, record_label text, deleted_at timestamp with time zone not null default now(), deleted_by uuid);
create table public.sf_suppressed_inserts (object_type text not null, sf_id text not null, reason text not null, attempts bigint not null default 1, first_seen timestamp with time zone not null default now(), last_seen timestamp with time zone not null default now());

-- ---------------------------------------------- new columns on existing tables
alter table public.appointments add column if not exists doctor_name text;
alter table public.appointments add column if not exists app_edited_at timestamp with time zone;
alter table public.appointments add column if not exists therapist_id uuid;
alter table public.appointments add column if not exists therapist_name text;
alter table public.attendance_records add column if not exists check_in_face_status text;
alter table public.attendance_records add column if not exists check_in_face_confidence integer;
alter table public.attendance_records add column if not exists check_out_face_status text;
alter table public.attendance_records add column if not exists check_out_face_confidence integer;
alter table public.attendance_records add column if not exists check_in_location jsonb;
alter table public.attendance_records add column if not exists check_out_location jsonb;
alter table public.attendance_records add column if not exists check_in_address text;
alter table public.attendance_records add column if not exists check_out_address text;
alter table public.invoices add column if not exists billed_by text;
alter table public.patient_photos add column if not exists phash text;
alter table public.patients add column if not exists consultation_type text;
alter table public.patients add column if not exists consultation_reasons text[];
alter table public.patients add column if not exists sf_registered_at timestamp with time zone;
alter table public.patients add column if not exists dietary_advice text;
alter table public.patients add column if not exists alternate_phone text;
alter table public.patients add column if not exists is_vip boolean not null default false;
alter table public.patients add column if not exists avatar_url text;
-- generated columns, as in production
alter table public.patients add column if not exists registered_at timestamp with time zone generated always as (COALESCE(sf_registered_at, created_at)) stored;
alter table public.patients add column if not exists phone_last10 text generated always as (NULLIF("right"(regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text), 10), ''::text)) stored;
alter table public.patients add column if not exists alternate_phone_last10 text generated always as (NULLIF("right"(regexp_replace(COALESCE(alternate_phone, ''::text), '\D'::text, ''::text, 'g'::text), 10), ''::text)) stored;
alter table public.procedures add column if not exists additional_instructions text;
alter table public.procedures add column if not exists date_not_recorded boolean not null default false;
alter table public.trash_items add column if not exists child_data jsonb not null default '[]'::jsonb;
alter table public.comms_mailchimp_connection add column if not exists api_key_enc text;
alter table public.comms_mailchimp_connection add column if not exists api_key_last4 text;

create sequence if not exists public.invoice_number_seq start 1;

-- ------------------------------------------------------------- constraints
alter table public.ai_repository add constraint ai_repository_pkey PRIMARY KEY (id);
alter table public.ai_repository add constraint ai_repository_kind_check CHECK ((kind = ANY (ARRAY['case_analysis'::text, 'skin_analysis'::text])));
alter table public.ai_repository add constraint ai_repository_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
alter table public.ai_repository add constraint ai_repository_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
alter table public.appointment_sticky_notes add constraint appointment_sticky_notes_pkey PRIMARY KEY (id);
alter table public.appointment_sticky_notes add constraint appointment_sticky_notes_sf_id_key UNIQUE (sf_id);
alter table public.appointment_sticky_notes add constraint appointment_sticky_notes_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;
alter table public.attendance_config add constraint attendance_config_pkey PRIMARY KEY (id);
alter table public.attendance_config add constraint attendance_config_attempts CHECK (((face_max_attempts >= 1) AND (face_max_attempts <= 10)));
alter table public.attendance_config add constraint attendance_config_single CHECK (singleton);
alter table public.attendance_config add constraint attendance_config_singleton UNIQUE (singleton);
alter table public.attendance_config add constraint attendance_config_threshold CHECK (((face_match_threshold >= 0) AND (face_match_threshold <= 100)));
alter table public.attendance_config add constraint attendance_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.google_review_opens add constraint google_review_opens_pkey PRIMARY KEY (id);
alter table public.google_review_opens add constraint google_review_opens_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
alter table public.google_review_opens add constraint google_review_opens_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.google_review_opens add constraint google_review_opens_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
alter table public.holidays add constraint holidays_pkey PRIMARY KEY (id);
alter table public.holidays add constraint holidays_date_key UNIQUE (date);
alter table public.holidays add constraint holidays_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.impersonation_log add constraint impersonation_log_pkey PRIMARY KEY (id);
alter table public.knowledge_ai_state add constraint knowledge_ai_state_pkey PRIMARY KEY (id);
alter table public.knowledge_ai_state add constraint knowledge_ai_state_id_check CHECK ((id = 'knowledge'::text));
alter table public.knowledge_article_categories add constraint knowledge_article_categories_pkey PRIMARY KEY (id);
alter table public.knowledge_article_categories add constraint knowledge_article_categories_name_key UNIQUE (name);
alter table public.knowledge_articles add constraint knowledge_articles_pkey PRIMARY KEY (id);
alter table public.knowledge_articles add constraint knowledge_age_range CHECK ((((age_rule = 'all_ages'::text) AND (min_age IS NULL) AND (max_age IS NULL)) OR ((age_rule = 'custom_range'::text) AND (min_age IS NOT NULL) AND (max_age IS NOT NULL) AND (min_age >= 0) AND (max_age >= min_age) AND (max_age <= 150))));
alter table public.knowledge_articles add constraint knowledge_articles_age_rule_check CHECK ((age_rule = ANY (ARRAY['all_ages'::text, 'custom_range'::text])));
alter table public.knowledge_articles add constraint knowledge_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES knowledge_article_categories(id);
alter table public.knowledge_articles add constraint knowledge_articles_gender_check CHECK ((gender = ANY (ARRAY['both'::text, 'female'::text, 'male'::text, 'other'::text])));
alter table public.knowledge_articles add constraint knowledge_articles_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
alter table public.knowledge_articles add constraint knowledge_articles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'published'::text])));
alter table public.knowledge_article_comments add constraint knowledge_article_comments_pkey PRIMARY KEY (id);
alter table public.knowledge_article_comments add constraint knowledge_article_comments_article_id_fkey FOREIGN KEY (article_id) REFERENCES knowledge_articles(id);
alter table public.knowledge_article_comments add constraint knowledge_article_comments_body_check CHECK (((length(btrim(body)) >= 1) AND (length(btrim(body)) <= 4000)));
alter table public.knowledge_article_opens add constraint knowledge_article_opens_pkey PRIMARY KEY (id);
alter table public.knowledge_article_opens add constraint knowledge_article_opens_article_id_fkey FOREIGN KEY (article_id) REFERENCES knowledge_articles(id);
alter table public.knowledge_article_revisions add constraint knowledge_article_revisions_pkey PRIMARY KEY (id);
alter table public.knowledge_article_revisions add constraint knowledge_article_revisions_article_id_fkey FOREIGN KEY (article_id) REFERENCES knowledge_articles(id);
alter table public.knowledge_article_revisions add constraint knowledge_article_revisions_article_id_revision_key UNIQUE (article_id, revision);
alter table public.knowledge_article_votes add constraint knowledge_article_votes_pkey PRIMARY KEY (id);
alter table public.knowledge_article_votes add constraint knowledge_article_votes_article_id_fkey FOREIGN KEY (article_id) REFERENCES knowledge_articles(id);
alter table public.knowledge_article_votes add constraint knowledge_article_votes_article_id_user_id_key UNIQUE (article_id, user_id);
alter table public.knowledge_article_votes add constraint knowledge_article_votes_vote_check CHECK ((vote = ANY (ARRAY['-1'::integer, 1])));
alter table public.list_view_defaults add constraint list_view_defaults_pkey PRIMARY KEY (user_id, section);
alter table public.list_view_defaults add constraint list_view_defaults_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.treatment_names add constraint treatment_names_pkey PRIMARY KEY (name);
alter table public.week_off_config add constraint week_off_config_pkey PRIMARY KEY (id);
alter table public.week_off_config add constraint week_off_config_alternate_pattern_check CHECK ((alternate_pattern = ANY (ARRAY['all'::text, '1st_3rd'::text, '2nd_4th'::text])));
alter table public.week_off_config add constraint week_off_config_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
alter table public.week_off_config add constraint week_off_config_day_of_week_key UNIQUE (day_of_week);
alter table public.whatsapp_delivery_log add constraint whatsapp_delivery_log_pkey PRIMARY KEY (message_sid);
alter table public.whatsapp_delivery_log add constraint whatsapp_delivery_log_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
alter table public.whatsapp_thread_reads add constraint whatsapp_thread_reads_pkey PRIMARY KEY (user_id, phone);
alter table public.whatsapp_thread_reads add constraint whatsapp_thread_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.sf_deleted_records add constraint sf_deleted_records_pkey PRIMARY KEY (object_type, sf_id);
alter table public.sf_suppressed_inserts add constraint sf_suppressed_inserts_pkey PRIMARY KEY (object_type, sf_id);

-- ----------------------------------------------------------------- indexes
CREATE INDEX ai_repository_appt_idx ON public.ai_repository USING btree (appointment_id, created_at DESC);
CREATE INDEX ai_repository_patient_idx ON public.ai_repository USING btree (patient_id, created_at DESC);
CREATE INDEX appointment_sticky_notes_appointment_updated_idx ON public.appointment_sticky_notes USING btree (appointment_id, updated_at DESC);
CREATE INDEX google_review_opens_patient_idx ON public.google_review_opens USING btree (patient_id, opened_at DESC);
CREATE INDEX holidays_date_idx ON public.holidays USING btree (date);
CREATE INDEX idx_impersonation_log_actor ON public.impersonation_log USING btree (actor_user_id, ended_at);
CREATE INDEX idx_impersonation_log_started_at ON public.impersonation_log USING btree (started_at DESC);
CREATE INDEX knowledge_comments_article ON public.knowledge_article_comments USING btree (article_id, created_at DESC);
CREATE INDEX knowledge_opens_article ON public.knowledge_article_opens USING btree (article_id);
CREATE INDEX knowledge_service_status ON public.knowledge_articles USING btree (service_id, status, is_active);
CREATE INDEX whatsapp_delivery_log_patient_idx ON public.whatsapp_delivery_log USING btree (patient_id, sent_at DESC);
CREATE INDEX whatsapp_delivery_log_sent_idx ON public.whatsapp_delivery_log USING btree (sent_at DESC);
CREATE INDEX appointments_patient_staff_idx ON public.appointments USING btree (patient_id, staff_id);
CREATE UNIQUE INDEX appointments_sf_id_uniq ON public.appointments USING btree (sf_id) WHERE (sf_id IS NOT NULL);
CREATE INDEX appointments_therapist_id_idx ON public.appointments USING btree (therapist_id);
CREATE UNIQUE INDEX attendance_records_staff_date_uniq ON public.attendance_records USING btree (staff_id, date);
CREATE INDEX idx_appointments_patient_start ON public.appointments USING btree (patient_id, start_time);
CREATE INDEX idx_patients_alternate_phone_trgm ON public.patients USING gin (alternate_phone gin_trgm_ops);
CREATE INDEX idx_patients_email_raw_trgm ON public.patients USING gin (email gin_trgm_ops);
CREATE INDEX idx_patients_email_trgm ON public.patients USING gin (lower(email) gin_trgm_ops);
CREATE INDEX idx_patients_first_name_raw_trgm ON public.patients USING gin (first_name gin_trgm_ops);
CREATE INDEX idx_patients_first_name_trgm ON public.patients USING gin (lower(first_name) gin_trgm_ops);
CREATE INDEX idx_patients_last_name_raw_trgm ON public.patients USING gin (last_name gin_trgm_ops);
CREATE INDEX idx_patients_last_name_trgm ON public.patients USING gin (lower(last_name) gin_trgm_ops);
CREATE INDEX idx_patients_phone_trgm ON public.patients USING gin (phone gin_trgm_ops);
CREATE INDEX idx_procedures_appointment_id ON public.procedures USING btree (appointment_id);
CREATE INDEX idx_trash_items_sf_id ON public.trash_items USING btree (((record_data ->> 'sf_id'::text))) WHERE (status = 'trashed'::text);
CREATE UNIQUE INDEX invoices_invoice_number_uniq ON public.invoices USING btree (invoice_number);
CREATE INDEX patient_photos_unhashed_idx ON public.patient_photos USING btree (taken_at DESC) WHERE (phash IS NULL);
CREATE INDEX patients_alternate_phone_last10_idx ON public.patients USING btree (alternate_phone_last10);
CREATE INDEX patients_last_visit_date_desc_idx ON public.patients USING btree (last_visit_date DESC NULLS LAST);
CREATE INDEX patients_phone_last10_idx ON public.patients USING btree (phone_last10);
CREATE INDEX patients_registered_at_desc_idx ON public.patients USING btree (registered_at DESC);
CREATE INDEX procedures_patient_staff_idx ON public.procedures USING btree (patient_id, staff_id);

-- --------------------------------------------------------------- functions
CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff s
      JOIN public.user_roles_config urc ON urc.id = s.role_id
     WHERE s.auth_user_id = auth.uid()
       AND s.is_active IS NOT FALSE
       AND lower(urc.name) = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_knowledge()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.staff s JOIN public.user_roles_config r ON r.id=s.role_id WHERE s.auth_user_id=auth.uid() AND s.is_active IS NOT FALSE AND lower(r.name) IN ('admin','doctor'));
$function$;

CREATE OR REPLACE FUNCTION public.is_knowledge_staff()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.staff WHERE auth_user_id=auth.uid() AND is_active IS NOT FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.is_my_patient(_patient_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_full_data_scope()
      OR (
        _patient_id IS NOT NULL
        AND public.current_staff_id() IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.appointments a
             WHERE a.patient_id = _patient_id
               AND a.staff_id = public.current_staff_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.procedures p
             WHERE p.patient_id = _patient_id
               AND (
                     p.staff_id = public.current_staff_id()
                  OR p.assisted_by = public.current_staff_id()
                  OR public.current_staff_id() = ANY (p.assisted_by_ids)
                  )
          )
        )
      );
$function$;

CREATE OR REPLACE FUNCTION public.can_restore_trash_item(_trash_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_full_data_scope()
      OR EXISTS (
           SELECT 1 FROM public.trash_items t
            WHERE t.id = _trash_id AND t.deleted_by = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.can_trash_record(_object_type text, _record_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_full_data_scope() THEN
    RETURN true;
  END IF;

  IF _object_type = 'appointments' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.id = _record_id AND a.staff_id = public.current_staff_id());

  ELSIF _object_type = 'procedures' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.procedures p
       WHERE p.id = _record_id
         AND (p.staff_id = public.current_staff_id()
           OR p.assisted_by = public.current_staff_id()
           OR public.current_staff_id() = ANY (p.assisted_by_ids)));

  ELSIF _object_type = 'invoices' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.invoices i
       WHERE i.id = _record_id
         AND (i.doctor_id = public.current_staff_id()
           OR i.appointment_id IN (
                SELECT a.id FROM public.appointments a
                 WHERE a.staff_id = public.current_staff_id())));

  ELSIF _object_type = 'prescriptions' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.prescriptions r
       WHERE r.id = _record_id
         AND (r.procedure_id IS NULL OR public.can_see_procedure(r.procedure_id)));

  ELSIF _object_type IN ('patient_photos', 'survey_responses') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.patient_photos x
       WHERE _object_type = 'patient_photos' AND x.id = _record_id
         AND public.is_my_patient(x.patient_id))
      OR EXISTS (
      SELECT 1 FROM public.survey_responses y
       WHERE _object_type = 'survey_responses' AND y.id = _record_id
         AND public.is_my_patient(y.patient_id));
  END IF;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.knowledge_file_visible(_path text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.can_manage_knowledge() OR (public.is_knowledge_staff() AND EXISTS(SELECT 1 FROM public.knowledge_articles a,jsonb_array_elements(a.resources) r WHERE a.deleted_at IS NULL AND a.status='published' AND a.is_active AND r->>'path'=_path)); $function$;

CREATE OR REPLACE FUNCTION public.knowledge_article_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb; actor text;
BEGIN
 IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only active doctors and admins can manage knowledge articles' USING ERRCODE='42501'; END IF;
 IF btrim(NEW.title)='' THEN RAISE EXCEPTION 'Article title is required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.knowledge_article_categories WHERE id=NEW.category_id AND is_active) AND (TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN RAISE EXCEPTION 'Choose an active category'; END IF;
 IF jsonb_typeof(NEW.resources)<>'array' OR jsonb_array_length(NEW.resources)>50 THEN RAISE EXCEPTION 'Invalid article resources'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(NEW.resources) LOOP
  IF coalesce(r->>'kind','') NOT IN ('file','image','link','video','article') OR coalesce(btrim(r->>'title'),'')='' THEN RAISE EXCEPTION 'Resource title and type are required'; END IF;
  IF r->>'path' IS NOT NULL THEN
   IF r->>'path' !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,8}$' THEN RAISE EXCEPTION 'Invalid attachment path'; END IF;
  ELSIF r->>'kind'='article' THEN
   IF NOT EXISTS(SELECT 1 FROM public.knowledge_articles WHERE id::text=r->>'article_id' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Related article not found'; END IF;
  ELSIF coalesce(r->>'url','') !~ '^https?://[^[:space:]]+$' THEN RAISE EXCEPTION 'Resource links must use http or https'; END IF;
 END LOOP;
 SELECT coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),'Staff member') INTO actor FROM public.staff WHERE auth_user_id=auth.uid() LIMIT 1;
 NEW.updated_at=clock_timestamp(); NEW.updated_by=auth.uid(); NEW.updated_by_name=actor;
 IF TG_OP='INSERT' THEN NEW.created_by=auth.uid(); NEW.created_at=clock_timestamp(); NEW.created_by_name=actor; NEW.revision=1;
 ELSE NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at; NEW.created_by_name=OLD.created_by_name; NEW.revision=OLD.revision+1; END IF;
 IF NEW.status IN ('reviewed','published') THEN
  IF btrim(NEW.summary)='' OR btrim(NEW.clinical_protocol)='' THEN RAISE EXCEPTION 'Summary and clinical protocol are required before review or publication'; END IF;
  NEW.reviewed_by=auth.uid(); NEW.reviewed_at=clock_timestamp();
 ELSE NEW.reviewed_by=NULL; NEW.reviewed_at=NULL; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.knowledge_article_snapshot()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE diff jsonb;
BEGIN
 IF TG_OP='INSERT' THEN diff=jsonb_build_object('created',jsonb_build_object('before',null,'after',NEW.title));
 ELSE SELECT coalesce(jsonb_object_agg(n.key,jsonb_build_object('before',o.value,'after',n.value)),'{}'::jsonb) INTO diff FROM jsonb_each(to_jsonb(NEW)) n LEFT JOIN jsonb_each(to_jsonb(OLD)) o ON n.key=o.key WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('updated_at','updated_by','updated_by_name','revision','reviewed_at','reviewed_by'); END IF;
 INSERT INTO public.knowledge_article_revisions(article_id,revision,snapshot,changed_by,changed_by_name,changes) VALUES(NEW.id,NEW.revision,to_jsonb(NEW),auth.uid(),NEW.updated_by_name,diff); RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.knowledge_article_stats(_ids uuid[])
 RETURNS TABLE(article_id uuid, likes bigint, dislikes bigint, comments bigint, opens bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ SELECT a.id,(SELECT count(*) FROM public.knowledge_article_votes v WHERE v.article_id=a.id AND vote=1),(SELECT count(*) FROM public.knowledge_article_votes v WHERE v.article_id=a.id AND vote=-1),(SELECT count(*) FROM public.knowledge_article_comments c WHERE c.article_id=a.id),(SELECT count(*) FROM public.knowledge_article_opens o WHERE o.article_id=a.id) FROM public.knowledge_articles a WHERE a.id=ANY(_ids); $function$;

CREATE OR REPLACE FUNCTION public.knowledge_comment_stamp()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$ BEGIN NEW.user_id=auth.uid(); NEW.created_at=clock_timestamp(); SELECT coalesce(nullif(btrim(concat_ws(' ',first_name,last_name)),''),'Doctor') INTO NEW.author_name FROM public.staff WHERE auth_user_id=auth.uid() LIMIT 1; RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION public.trash_knowledge_article(_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE a public.knowledge_articles; actor text; BEGIN
 IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only doctors and admins can delete articles' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.knowledge_articles WHERE id=_id AND deleted_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Article not found'; END IF;
 SELECT btrim(concat_ws(' ',first_name,last_name)) INTO actor FROM public.staff WHERE auth_user_id=auth.uid() LIMIT 1;
 INSERT INTO public.trash_items(object_type,record_id,record_label,record_data,child_data,deleted_by,deleted_by_name) VALUES('knowledge_articles',a.id,a.title,to_jsonb(a),'[]'::jsonb,auth.uid(),actor);
 UPDATE public.knowledge_articles SET deleted_at=clock_timestamp() WHERE id=_id;
END $function$;

CREATE OR REPLACE FUNCTION public.whatsapp_message_is_foreign(body text)
 RETURNS boolean LANGUAGE sql IMMUTABLE
AS $function$
  select coalesce(body, '') ilike any (array[
           '%Trayi%','%jewel%','%diamond%','%हीरे%','%Making Charges%','%Gold Coin%',
           '%Field Sales Assistant%','%StoreOps%','%QuickApp%','%Your Store Details%',
           '%Indian Food Stores%','%Laxmi Medical Stores%','%Aushadi Dhanvantari%',
           '%Ramakanti Stores%','%Sharma store%','%{{contact.name}}%',
           '%I do not have that information%','%couldn''t assist with that request%',
           '%INV2026-%','%Available Schemes%','%Daily Chai%','%retailer%',
           '%continued patro%','%bestie%','%finely crafted%','%Order Confirmation%'
         ])
     and coalesce(body, '') not ilike '%The Skin Clinic%'
     and coalesce(body, '') not ilike '%DermaCare%'
     and coalesce(body, '') not ilike '%appointment%'
     and coalesce(body, '') not ilike '%consultation%'
     and coalesce(body, '') not ilike '%doctor%'
     and coalesce(body, '') not ilike '%patient%'
     and coalesce(body, '') not ilike '%survey%'
     and coalesce(body, '') not ilike '%prescription%';
$function$;

CREATE OR REPLACE FUNCTION public.whatsapp_delivery_log_only_ours()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
begin
  if public.whatsapp_message_is_foreign(new.body_preview) then
    return null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sf_note_suppressed_insert(_object_type text, _sf_id text, _reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  insert into public.sf_suppressed_inserts (object_type, sf_id, reason)
  values (_object_type, _sf_id, _reason)
  on conflict (object_type, sf_id) do update
    set attempts  = public.sf_suppressed_inserts.attempts + 1,
        last_seen = now(),
        reason    = excluded.reason;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sf_suppression_reason(_object_type text, _sf_id text)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_dupe boolean;
begin
  if _sf_id is null then
    return null;
  end if;

  if _object_type not in ('appointments', 'procedures', 'invoices') then
    return null;
  end if;

  if exists (
    select 1 from public.sf_deleted_records d
     where d.object_type = _object_type and d.sf_id = _sf_id
  ) then
    return 'deleted_here';
  end if;

  if exists (
    select 1 from public.trash_items t
     where t.object_type = _object_type
       and t.status = 'trashed'
       and t.record_data->>'sf_id' = _sf_id
  ) then
    return 'deleted_here';
  end if;

  execute format('select exists (select 1 from public.%I t where t.sf_id = $1)', _object_type)
    into v_dupe using _sf_id;

  if v_dupe then
    return 'duplicate_sf_id';
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trash_capture_children(_object_type text, _record_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  out_data   jsonb := '[]'::jsonb;
  queue      jsonb := jsonb_build_array(jsonb_build_object('table', _object_type, 'ids', jsonb_build_array(_record_id)));
  next_queue jsonb;
  node       jsonb;
  fk         record;
  tbl        text;
  ids        uuid[];
  groups     jsonb;
  rows_json  jsonb;
  kid_ids    uuid[];
  depth      int := 0;
  has_id     boolean;
begin
  while jsonb_array_length(queue) > 0 and depth < 4 loop
    next_queue := '[]'::jsonb;

    for node in select * from jsonb_array_elements(queue) loop
      tbl := node->>'table';
      select coalesce(array_agg(v::uuid), '{}'::uuid[]) into ids
        from jsonb_array_elements_text(node->'ids') v;
      continue when cardinality(ids) = 0;

      for fk in
        select cl.relname as child_table,
               ca.attname as child_col,
               c.confdeltype as del
          from pg_constraint c
          join pg_class     cl on cl.oid = c.conrelid
          join pg_namespace n  on n.oid  = cl.relnamespace
          join pg_attribute ca on ca.attrelid = c.conrelid  and ca.attnum = c.conkey[1]
          join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
         where c.contype = 'f'
           and c.confrelid = to_regclass('public.' || tbl)
           and n.nspname = 'public'
           and cardinality(c.conkey) = 1
           and pa.attname = 'id'
           and c.confdeltype in ('n', 'c')
      loop
        select exists (
          select 1 from pg_attribute x
           where x.attrelid = to_regclass('public.' || fk.child_table)
             and x.attname = 'id' and x.attnum > 0 and not x.attisdropped
        ) into has_id;
        continue when not has_id;

        if fk.del = 'n' then
          execute format(
            'select coalesce(jsonb_agg(jsonb_build_object(''parent'', p, ''ids'', i)), ''[]''::jsonb)
               from (select t.%I as p, jsonb_agg(t.id) as i
                       from public.%I t
                      where t.%I = any($1)
                      group by t.%I) g',
            fk.child_col, fk.child_table, fk.child_col, fk.child_col)
            into groups using ids;

          if jsonb_array_length(groups) > 0 then
            out_data := out_data || jsonb_build_object(
              'table', fk.child_table, 'column', fk.child_col,
              'rule', 'set_null', 'groups', groups);
          end if;

        else
          execute format(
            'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.%I = any($1)',
            fk.child_table, fk.child_col)
            into rows_json using ids;

          if jsonb_array_length(rows_json) > 0 then
            out_data := out_data || jsonb_build_object(
              'table', fk.child_table, 'column', fk.child_col,
              'rule', 'cascade', 'rows', rows_json);

            select coalesce(array_agg((r->>'id')::uuid), '{}'::uuid[]) into kid_ids
              from jsonb_array_elements(rows_json) r
             where r->>'id' is not null;

            if cardinality(kid_ids) > 0 then
              next_queue := next_queue || jsonb_build_object(
                'table', fk.child_table, 'ids', to_jsonb(kid_ids));
            end if;
          end if;
        end if;
      end loop;
    end loop;

    queue := next_queue;
    depth := depth + 1;
  end loop;

  return out_data;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trash_restore_children(_child_data jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  entry jsonb;
  grp   jsonb;
  ids   uuid[];
begin
  for entry in select * from jsonb_array_elements(coalesce(_child_data, '[]'::jsonb)) loop
    if entry->>'rule' = 'set_null' then
      for grp in select * from jsonb_array_elements(entry->'groups') loop
        select coalesce(array_agg(v::uuid), '{}'::uuid[]) into ids
          from jsonb_array_elements_text(grp->'ids') v;
        continue when cardinality(ids) = 0;

        execute format('update public.%I set %I = $1 where id = any($2) and %I is null',
                       entry->>'table', entry->>'column', entry->>'column')
          using (grp->>'parent')::uuid, ids;
      end loop;
    else
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                     entry->>'table', entry->>'table')
        using entry->'rows';
    end if;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_trash(_object_type text, _record_id uuid, _label text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  row_json jsonb;
  kids     jsonb;
  new_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.trash_allowed_object(_object_type) then
    raise exception 'Object % is not enabled for trash', _object_type;
  end if;

  if not public.can_trash_record(_object_type, _record_id) then
    raise exception 'You can only delete your own records';
  end if;

  execute format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', _object_type)
    into row_json using _record_id;

  if row_json is null then
    raise exception 'Record not found';
  end if;

  kids := public.trash_capture_children(_object_type, _record_id);

  insert into public.trash_items (object_type, record_id, record_label, record_data, child_data, deleted_by, deleted_by_name)
  values (_object_type, _record_id, _label, row_json, kids, auth.uid(),
          (select email from auth.users where id = auth.uid()))
  returning id into new_id;

  if row_json ? 'sf_id' and row_json->>'sf_id' is not null then
    insert into public.sf_deleted_records (object_type, sf_id, record_label, deleted_at, deleted_by)
    values (_object_type, row_json->>'sf_id', _label, now(), auth.uid())
    on conflict (object_type, sf_id) do update
      set record_label = excluded.record_label,
          deleted_at   = excluded.deleted_at,
          deleted_by   = excluded.deleted_by;
  end if;

  execute format('DELETE FROM public.%I WHERE id = $1', _object_type) using _record_id;

  return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.purge_trash_item(_trash_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  item public.trash_items;
  days integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO item FROM public.trash_items WHERE id = _trash_id;
  IF NOT FOUND OR item.status <> 'trashed' THEN
    RAISE EXCEPTION 'Trash item not available for deletion';
  END IF;

  SELECT retention_days INTO days FROM public.trash_settings WHERE id;
  days := COALESCE(days, 30);

  IF item.deleted_at > now() - make_interval(days => days) THEN
    RAISE EXCEPTION 'This item can only be permanently deleted after % day(s) in trash (available on %)',
      days, to_char((item.deleted_at + make_interval(days => days)) AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY');
  END IF;

  IF item.object_type = 'knowledge_articles' THEN
    IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only doctors and admins can purge knowledge articles'; END IF;
    DELETE FROM public.knowledge_article_votes WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_article_comments WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_article_opens WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_article_revisions WHERE article_id=item.record_id;
    DELETE FROM public.knowledge_articles WHERE id=item.record_id AND deleted_at IS NOT NULL;
  END IF;
  UPDATE public.trash_items
     SET status = 'purged', purged_at = now(), purged_by = auth.uid(), record_data = '{}'::jsonb
   WHERE id = _trash_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_from_trash(_trash_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  item     public.trash_items;
  v_sf     text;
  v_back   boolean;
  v_has_id boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_restore_trash_item(_trash_id) then
    raise exception 'You can only restore records you deleted';
  end if;

  select * into item from public.trash_items where id = _trash_id;
  if not found or item.status <> 'trashed' then
    raise exception 'Trash item not available for restore';
  end if;

  IF item.object_type = 'knowledge_articles' THEN
    IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only doctors and admins can restore articles'; END IF;
    UPDATE public.knowledge_articles SET deleted_at=NULL WHERE id=item.record_id AND deleted_at IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Article is already restored or unavailable'; END IF;
    UPDATE public.trash_items SET status='restored',restored_at=now(),restored_by=auth.uid() WHERE id=_trash_id;
    RETURN;
  END IF;
  v_sf := item.record_data->>'sf_id';

  if v_sf is not null then
    delete from public.sf_deleted_records
     where object_type = item.object_type
       and sf_id = v_sf;

    if public.sf_suppression_reason(item.object_type, v_sf) = 'duplicate_sf_id' then
      raise exception 'That % is already back in the app (Salesforce id %) - nothing to restore',
        item.object_type, v_sf;
    end if;
  end if;

  update public.trash_items
     set status = 'restored', restored_at = now(), restored_by = auth.uid()
   where id = _trash_id;

  execute format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
                 item.object_type, item.object_type) using item.record_data;

  select exists (
    select 1 from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = item.object_type
       and c.column_name = 'id'
  ) into v_has_id;

  if v_has_id then
    execute format('select exists (select 1 from public.%I t where t.id = $1)', item.object_type)
      into v_back using item.record_id;
    if not v_back then
      raise exception 'The % could not be put back - nothing has been changed', item.object_type;
    end if;
  end if;

  perform public.trash_restore_children(item.child_data);
end;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_record_owner()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  incoming_sf_id text;
  suppression    text;
begin
  if TG_OP = 'INSERT' then
    incoming_sf_id := to_jsonb(NEW) ->> 'sf_id';
    if incoming_sf_id is not null then
      suppression := public.sf_suppression_reason(TG_TABLE_NAME::text, incoming_sf_id);
      if suppression is not null then
        perform public.sf_note_suppressed_insert(TG_TABLE_NAME::text, incoming_sf_id, suppression);
        return null;
      end if;
    end if;

    NEW.owner_id := coalesce(NEW.owner_id, auth.uid());
  else
    NEW.owner_id := coalesce(NEW.owner_id, OLD.owner_id, auth.uid());
  end if;
  return NEW;
end;
$function$;

-- The clinic double-books doctors on purpose: this check is off in production.
CREATE OR REPLACE FUNCTION public.validate_appointment_no_overlap()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
begin
  -- Overlap checking is off at the clinic's request (same as production).
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS appointments_no_overlap ON public.appointments;

CREATE OR REPLACE FUNCTION public.recalc_patient_visit_rollups(_patient_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _patient_id IS NULL THEN RETURN; END IF;
  UPDATE public.patients p
     SET total_visits          = sub.visits,
         days_since_last_visit = sub.days_since,
         last_visit_date       = sub.last_visit
    FROM (
      SELECT count(*) FILTER (WHERE attended) AS visits,
             max(start_time) FILTER (WHERE attended) AS last_visit,
             (EXTRACT(day FROM (now() - max(start_time) FILTER (WHERE attended)))::int) AS days_since
        FROM (
          SELECT a.start_time,
                 ( a.status IN ('Completed','Checked-in','In Progress')
                   OR ( a.start_time < now()
                        AND EXISTS (SELECT 1 FROM public.invoices i
                                     WHERE i.appointment_id = a.id AND COALESCE(i.paid_amount,0) > 0) )
                 ) AS attended
            FROM public.appointments a WHERE a.patient_id = _patient_id
        ) marked
    ) sub
   WHERE p.id = _patient_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.autolink_invoice_appointment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _ids uuid[];
BEGIN
  IF NEW.appointment_id IS NULL AND NEW.patient_id IS NOT NULL AND NEW.sf_id IS NULL THEN
    SELECT array_agg(a.id) INTO _ids FROM public.appointments a
    WHERE a.patient_id = NEW.patient_id
      AND coalesce(a.status,'') <> 'Cancelled'
      AND (a.start_time AT TIME ZONE 'Asia/Kolkata')::date = (coalesce(NEW.created_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
    IF array_length(_ids,1) = 1 THEN NEW.appointment_id := _ids[1]; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clean_investigation_text(_text text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$
  SELECT btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(coalesce(_text, ''), '\([^()]*\)', ' ', 'g'),
                 '\mlast session\s+on\M.*$', ' ', 'i'),
               '\?+', ' ', 'g'),
             '\s+', ' ', 'g')
         );
$function$;

CREATE OR REPLACE FUNCTION public.drop_import_source_stamp()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(btrim(coalesce(NEW.source, ''))) = 'salesforce' THEN
    NEW.source := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_patient_visit_rollups()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_visits integer; v_last_visit timestamptz;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.total_visits          IS NOT DISTINCT FROM OLD.total_visits
     AND NEW.last_visit_date       IS NOT DISTINCT FROM OLD.last_visit_date
     AND NEW.days_since_last_visit IS NOT DISTINCT FROM OLD.days_since_last_visit
  THEN RETURN NEW; END IF;

  SELECT count(*) FILTER (WHERE attended), max(start_time) FILTER (WHERE attended)
    INTO v_visits, v_last_visit
    FROM ( SELECT a.start_time,
                  ( a.status IN ('Completed','Checked-in','In Progress')
                    OR ( a.start_time < now()
                         AND EXISTS (SELECT 1 FROM public.invoices i
                                      WHERE i.appointment_id = a.id
                                        AND COALESCE(i.paid_amount,0) > 0) ) ) AS attended
             FROM public.appointments a WHERE a.patient_id = NEW.id ) marked;

  NEW.total_visits          := COALESCE(v_visits, 0);
  NEW.last_visit_date       := v_last_visit;
  NEW.days_since_last_visit := CASE WHEN v_last_visit IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(day FROM (now() - v_last_visit))::int) END;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.is_pure_consultation(_text text)
 RETURNS boolean LANGUAGE sql IMMUTABLE
AS $function$
  WITH cleaned AS (
    SELECT btrim(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(coalesce(_text, ''), '\([^()]*\)', ' ', 'g'),
                   '\mlast session\s+on\M.*$', ' ', 'i'),
                 '\?+', ' ', 'g'),
               '\s+', ' ', 'g')
           ) AS t
  ), parts AS (
    SELECT btrim(p) AS part FROM cleaned, unnest(string_to_array(cleaned.t, '+')) AS p
     WHERE btrim(p) <> ''
  )
  SELECT EXISTS (SELECT 1 FROM parts)
     AND NOT EXISTS (
       SELECT 1 FROM parts
        WHERE part !~* '^(?:(?:new|old|re)\s*)?consult(?:ation)?$'
          AND part !~* '^review$'
     );
$function$;

CREATE OR REPLACE FUNCTION public.next_invoice_numbers(_count integer DEFAULT 1)
 RETURNS SETOF text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select 'INV-' || nextval('public.invoice_number_seq')::text
    from generate_series(1, greatest(coalesce(_count, 1), 1))
$function$;

CREATE OR REPLACE FUNCTION public.normalize_name(_text text)
 RETURNS text LANGUAGE sql IMMUTABLE
AS $function$
  SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(_text, '')), '[^a-z0-9 ]', ' ', 'g'),
                              '\s+', ' ', 'g'));
$function$;

CREATE OR REPLACE FUNCTION public.portal_patients_by_phone(p_last10 text)
 RETURNS TABLE(id uuid, first_name text, last_name text, portal_pin_hash text, portal_pin_failed_attempts integer, portal_pin_locked_until timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select p.id, p.first_name, p.last_name,
         p.portal_pin_hash, p.portal_pin_failed_attempts, p.portal_pin_locked_until
  from public.patients p
  where length(coalesce(p_last10, '')) = 10
    and (p.phone_last10 = p_last10 or p.alternate_phone_last10 = p_last10)
  order by p.registered_at desc nulls last, p.id;
$function$;

CREATE OR REPLACE FUNCTION public.propagate_patient_name()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _old text := regexp_replace(trim(COALESCE(OLD.first_name,'') || ' ' || COALESCE(OLD.last_name,'')), '\s+', ' ', 'g');
  _new text := regexp_replace(trim(COALESCE(NEW.first_name,'') || ' ' || COALESCE(NEW.last_name,'')), '\s+', ' ', 'g');
BEGIN
  IF _old = _new THEN RETURN NEW; END IF;

  UPDATE appointments SET patient_name = _new, updated_at = updated_at
  WHERE patient_id = NEW.id
    AND COALESCE(patient_name, '') IS DISTINCT FROM _new;

  UPDATE invoices SET patient_name = _new, updated_at = updated_at
  WHERE patient_id = NEW.id
    AND COALESCE(patient_name, '') IS DISTINCT FROM _new;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.route_treatments_to_services()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare key text := lower(regexp_replace(btrim(new.medicine_name), '\s+', ' ', 'g'));
begin
  if new.product_id is not null then return new; end if;
  if key = '' or not exists (select 1 from treatment_names t where t.name = key) then return new; end if;
  insert into procedure_services (procedure_id, service_id, service_name, procedure_notes, sort_order)
  select new.procedure_id,
         (select s.id from services s where lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) = key limit 1),
         btrim(new.medicine_name),
         nullif(btrim(coalesce(new.instructions, '')), ''),
         coalesce((select max(ps.sort_order) from procedure_services ps where ps.procedure_id = new.procedure_id), -1) + 1
  where not exists (
    select 1 from procedure_services ps
    where ps.procedure_id = new.procedure_id
      and lower(regexp_replace(btrim(ps.service_name), '\s+', ' ', 'g')) = key);
  return null;
end; $function$;

CREATE OR REPLACE FUNCTION public.search_patient_photos_by_hash(_hash text, _max_distance integer DEFAULT 10, _limit integer DEFAULT 20)
 RETURNS TABLE(photo_id uuid, patient_id uuid, photo_url text, taken_at timestamp with time zone, distance integer)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  select m.photo_id, m.patient_id, m.photo_url, m.taken_at, m.distance
  from (
    select
      pp.id as photo_id,
      pp.patient_id as patient_id,
      pp.photo_url as photo_url,
      pp.taken_at as taken_at,
      bit_count(
        ('x' || pp.phash)::bit(64) # ('x' || lower(trim(_hash)))::bit(64)
      )::int as distance
    from public.patient_photos pp
    where pp.phash is not null
      and lower(trim(_hash)) ~ '^[0-9a-f]{16}$'
  ) m
  where m.distance <= greatest(0, least(coalesce(_max_distance, 10), 64))
  order by m.distance asc, m.taken_at desc nulls last
  limit greatest(1, least(coalesce(_limit, 20), 100));
$function$;

CREATE OR REPLACE FUNCTION public.set_appointment_doctor_name()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.staff_id IS NOT NULL THEN
    SELECT btrim(s.first_name || ' ' || s.last_name) INTO NEW.doctor_name
      FROM public.staff s WHERE s.id = NEW.staff_id;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.set_appointment_therapist_name()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.therapist_id is not null then
    select btrim(s.first_name || ' ' || coalesce(s.last_name, ''))
      into new.therapist_name
      from public.staff s
     where s.id = new.therapist_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_patient_photo_hashes(_rows jsonb)
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  updated integer;
begin
  with incoming as (
    select (r->>'id')::uuid as id, lower(trim(r->>'phash')) as phash
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) r
  )
  update public.patient_photos p
     set phash = i.phash
    from incoming i
   where p.id = i.id
     and i.phash ~ '^[0-9a-f]{16}$';

  get diagnostics updated = row_count;
  return updated;
end
$function$;

CREATE OR REPLACE FUNCTION public.set_record_patient_name()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    SELECT regexp_replace(trim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '\s+', ' ', 'g')
      INTO NEW.patient_name
      FROM public.patients p
     WHERE p.id = NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stamp_appointment_app_edit()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.app_edited_at := now();
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------ views
create or replace view public.whatsapp_thread_messages with (security_invoker=true) as
 SELECT (c.id)::text AS id, c.phone, c.patient_id, c.direction, c.content, c.created_at, 'reply'::text AS source, NULL::text AS status
   FROM whatsapp_conversations c
UNION ALL
 SELECT ('sent:'::text || d.message_sid) AS id, d.phone, d.patient_id, 'outbound'::text AS direction, COALESCE(d.body_preview, ''::text) AS content, d.sent_at AS created_at, 'sent'::text AS source, d.status
   FROM whatsapp_delivery_log d
  WHERE (NOT (EXISTS ( SELECT 1 FROM whatsapp_conversations c WHERE (c.message_sid = d.message_sid))));

create or replace view public.whatsapp_conversation_threads with (security_invoker=true) as
 WITH per_phone AS (
         SELECT m.phone,
            max(m.created_at) AS last_at,
            count(*) AS message_count,
            (array_agg(m.content ORDER BY m.created_at DESC))[1] AS last_content,
            (array_agg(m.direction ORDER BY m.created_at DESC))[1] AS last_direction,
            (array_agg(m.patient_id ORDER BY m.created_at DESC) FILTER (WHERE (m.patient_id IS NOT NULL)))[1] AS patient_id,
            max(m.created_at) FILTER (WHERE (m.direction = 'inbound'::text)) AS last_inbound_at
           FROM whatsapp_thread_messages m
          GROUP BY m.phone
        )
 SELECT t.phone, t.last_at, t.message_count, t.last_content, t.last_direction, t.patient_id, p.first_name, p.last_name, t.last_inbound_at
   FROM (per_phone t LEFT JOIN patients p ON ((p.id = t.patient_id)));

create or replace view public.visits_needing_review with (security_invoker=true) as
 SELECT id AS appointment_id, patient_id, patient_name, start_time, service, doctor_name, staff_id, status,
    (sf_id IS NOT NULL) AS from_salesforce, created_at
   FROM appointments a
  WHERE ((status = 'Completed'::text) AND (start_time < now()) AND (NOT (EXISTS ( SELECT 1
           FROM invoices i
          WHERE ((i.appointment_id = a.id) AND (COALESCE(i.status, ''::text) <> ALL (ARRAY['Cancelled'::text, 'Merged'::text])))))) AND (NOT (EXISTS ( SELECT 1
           FROM procedures p
          WHERE (p.appointment_id = a.id)))));

create or replace view public.material_cost_lines with (security_invoker=true) as
 SELECT i.id AS invoice_id,
    i.invoice_number,
    i.created_at,
    i.patient_name,
    i.patient_id,
    i.doctor_id,
    i.appointment_id,
    (l.value ->> 'name'::text) AS service_name,
    ((l.value ->> 'price'::text))::numeric AS service_amount,
    COALESCE(((l.value ->> 'material_percent'::text))::numeric, ov.pct, s.material_percent, (0)::numeric) AS material_percent,
    round(((((l.value ->> 'price'::text))::numeric * COALESCE(((l.value ->> 'material_percent'::text))::numeric, ov.pct, s.material_percent, (0)::numeric)) / 100.0), 2) AS material_cost
   FROM (((invoices i
     CROSS JOIN LATERAL jsonb_array_elements(i.line_items) l(value))
     LEFT JOIN services s ON ((lower(regexp_replace(btrim(s.name), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(btrim((l.value ->> 'name'::text)), '\s+'::text, ' '::text, 'g'::text)))))
     LEFT JOIN LATERAL ( SELECT ps.material_percent AS pct
           FROM (procedure_services ps
             JOIN procedures p ON ((p.id = ps.procedure_id)))
          WHERE ((p.appointment_id = i.appointment_id) AND (lower(regexp_replace(btrim(ps.service_name), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(btrim((l.value ->> 'name'::text)), '\s+'::text, ' '::text, 'g'::text))) AND (ps.material_percent IS NOT NULL))
         LIMIT 1) ov ON (true))
  WHERE (i.status IS DISTINCT FROM 'Cancelled'::text);

-- -------------------------------------------------------------------- RLS
alter table public.ai_repository enable row level security;
alter table public.appointment_sticky_notes enable row level security;
alter table public.attendance_config enable row level security;
alter table public.google_review_opens enable row level security;
alter table public.holidays enable row level security;
alter table public.impersonation_log enable row level security;
alter table public.knowledge_ai_state enable row level security;
alter table public.knowledge_article_categories enable row level security;
alter table public.knowledge_article_comments enable row level security;
alter table public.knowledge_article_opens enable row level security;
alter table public.knowledge_article_revisions enable row level security;
alter table public.knowledge_article_votes enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.list_view_defaults enable row level security;
alter table public.treatment_names enable row level security;
alter table public.week_off_config enable row level security;
alter table public.whatsapp_delivery_log enable row level security;
alter table public.whatsapp_thread_reads enable row level security;
alter table public.sf_deleted_records enable row level security;
alter table public.sf_suppressed_inserts enable row level security;

-- Existing tables whose policies differ: replace them with production's set.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname='public'
              and tablename in ('appointments','attendance_records','prescriptions','procedure_attachments','procedure_services','procedure_sticky_notes','procedures','trash_items')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "Authenticated staff can delete appointments" on public.appointments as PERMISSIVE for DELETE to authenticated using (true);
create policy "Authenticated staff can insert appointments" on public.appointments as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Authenticated staff can read appointments" on public.appointments as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated staff can update appointments" on public.appointments as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "Only admins delete attendance" on public.attendance_records as PERMISSIVE for DELETE to authenticated using (is_admin_user());
create policy "Staff close their own day, admins may correct" on public.attendance_records as PERMISSIVE for UPDATE to authenticated using ((is_admin_user() OR (staff_id = current_staff_id()))) with check ((is_admin_user() OR (staff_id = current_staff_id())));
create policy "Staff read own attendance, admins read all" on public.attendance_records as PERMISSIVE for SELECT to authenticated using ((is_admin_user() OR (staff_id = current_staff_id())));
create policy "Staff record their own attendance" on public.attendance_records as PERMISSIVE for INSERT to authenticated with check ((staff_id = current_staff_id()));
create policy "Authenticated staff can delete prescriptions" on public.prescriptions as PERMISSIVE for DELETE to authenticated using (true);
create policy "Authenticated staff can insert prescriptions" on public.prescriptions as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Authenticated staff can read prescriptions" on public.prescriptions as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated staff can update prescriptions" on public.prescriptions as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "Authenticated staff can delete procedure_attachments" on public.procedure_attachments as PERMISSIVE for DELETE to authenticated using (true);
create policy "Authenticated staff can insert procedure_attachments" on public.procedure_attachments as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Authenticated staff can read procedure_attachments" on public.procedure_attachments as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated staff can update procedure_attachments" on public.procedure_attachments as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "Authenticated can add procedure services" on public.procedure_services as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Authenticated can delete procedure services" on public.procedure_services as PERMISSIVE for DELETE to authenticated using (true);
create policy "Authenticated can update procedure services" on public.procedure_services as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "Authenticated can view procedure services" on public.procedure_services as PERMISSIVE for SELECT to authenticated using (true);
create policy "auth manage procedure_sticky_notes" on public.procedure_sticky_notes as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "Authenticated staff can delete procedures" on public.procedures as PERMISSIVE for DELETE to authenticated using (true);
create policy "Authenticated staff can insert procedures" on public.procedures as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Authenticated staff can read procedures" on public.procedures as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated staff can update procedures" on public.procedures as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "Authenticated can insert trash" on public.trash_items as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Authenticated can update trash" on public.trash_items as PERMISSIVE for UPDATE to authenticated using (true) with check (true);
create policy "Authenticated can view trash" on public.trash_items as PERMISSIVE for SELECT to authenticated using (true);
create policy "scope trash_items to own" on public.trash_items as RESTRICTIVE for SELECT to authenticated using ((( SELECT has_full_data_scope() AS has_full_data_scope) OR (deleted_by = auth.uid())));
create policy "scope trash_items to own upd" on public.trash_items as RESTRICTIVE for UPDATE to authenticated using ((( SELECT has_full_data_scope() AS has_full_data_scope) OR (deleted_by = auth.uid()))) with check (true);

-- New tables
create policy "Admins can read impersonation log" on public.impersonation_log as PERMISSIVE for SELECT to authenticated using (is_admin_user());
create policy "Admins change attendance settings" on public.attendance_config as PERMISSIVE for UPDATE to authenticated using (is_admin_user()) with check (is_admin_user());
create policy "Admins change week offs" on public.week_off_config as PERMISSIVE for UPDATE to authenticated using (is_admin_user()) with check (is_admin_user());
create policy "Admins manage holidays" on public.holidays as PERMISSIVE for ALL to authenticated using (is_admin_user()) with check (is_admin_user());
create policy "Admins manage knowledge categories" on public.knowledge_article_categories as PERMISSIVE for ALL to authenticated using (is_admin_user()) with check (is_admin_user());
create policy "Everyone signed in reads attendance settings" on public.attendance_config as PERMISSIVE for SELECT to authenticated using (true);
create policy "Everyone signed in reads holidays" on public.holidays as PERMISSIVE for SELECT to authenticated using (true);
create policy "Everyone signed in reads week offs" on public.week_off_config as PERMISSIVE for SELECT to authenticated using (true);
create policy "Staff add AI repository" on public.ai_repository as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Staff can read knowledge categories" on public.knowledge_article_categories as PERMISSIVE for SELECT to authenticated using (true);
create policy "Staff can record asking" on public.google_review_opens as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = opened_by));
create policy "Staff can see who has been asked" on public.google_review_opens as PERMISSIVE for SELECT to authenticated using (true);
create policy "Staff can view delivery log" on public.whatsapp_delivery_log as PERMISSIVE for SELECT to authenticated using ((has_full_data_scope() OR ((patient_id IS NOT NULL) AND is_my_patient(patient_id))));
create policy "Staff read AI repository" on public.ai_repository as PERMISSIVE for SELECT to authenticated using (true);
create policy "Users can change their own default view" on public.list_view_defaults as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can clear their own default view" on public.list_view_defaults as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Users can clear their own read marks" on public.whatsapp_thread_reads as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Users can mark a thread read" on public.whatsapp_thread_reads as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Users can read their own default view" on public.list_view_defaults as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Users can read their own read marks" on public.whatsapp_thread_reads as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Users can set their own default view" on public.list_view_defaults as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Users can update their own read marks" on public.whatsapp_thread_reads as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "auth manage appointment_sticky_notes" on public.appointment_sticky_notes as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy knowledge_ai_state_read on public.knowledge_ai_state as PERMISSIVE for SELECT to authenticated using (can_manage_knowledge());
create policy knowledge_ai_state_resume on public.knowledge_ai_state as PERMISSIVE for DELETE to authenticated using (is_admin_user());
create policy knowledge_comments_read on public.knowledge_article_comments as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1 FROM knowledge_articles a WHERE (a.id = knowledge_article_comments.article_id))));
create policy knowledge_comments_write on public.knowledge_article_comments as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND can_manage_knowledge() AND (EXISTS ( SELECT 1 FROM knowledge_articles a WHERE (a.id = knowledge_article_comments.article_id)))));
create policy knowledge_create on public.knowledge_articles as PERMISSIVE for INSERT to authenticated with check (can_manage_knowledge());
create policy knowledge_edit on public.knowledge_articles as PERMISSIVE for UPDATE to authenticated using (can_manage_knowledge()) with check (can_manage_knowledge());
create policy knowledge_opens_insert on public.knowledge_article_opens as PERMISSIVE for INSERT to authenticated with check (((user_id = auth.uid()) AND is_knowledge_staff() AND (EXISTS ( SELECT 1 FROM knowledge_articles a WHERE (a.id = knowledge_article_opens.article_id)))));
create policy knowledge_opens_read on public.knowledge_article_opens as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1 FROM knowledge_articles a WHERE (a.id = knowledge_article_opens.article_id))));
create policy knowledge_read on public.knowledge_articles as PERMISSIVE for SELECT to authenticated using (((deleted_at IS NULL) AND (can_manage_knowledge() OR (is_knowledge_staff() AND (status = 'published'::text) AND is_active))));
create policy knowledge_revision_read on public.knowledge_article_revisions as PERMISSIVE for SELECT to authenticated using (can_manage_knowledge());
create policy knowledge_votes_read on public.knowledge_article_votes as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1 FROM knowledge_articles a WHERE (a.id = knowledge_article_votes.article_id))));
create policy knowledge_votes_write on public.knowledge_article_votes as PERMISSIVE for ALL to authenticated using (((user_id = auth.uid()) AND can_manage_knowledge())) with check (((user_id = auth.uid()) AND can_manage_knowledge() AND (EXISTS ( SELECT 1 FROM knowledge_articles a WHERE (a.id = knowledge_article_votes.article_id)))));
create policy treatment_names_read on public.treatment_names as PERMISSIVE for SELECT to authenticated using (true);

-- --------------------------------------------------------------- triggers
CREATE TRIGGER appointment_sticky_notes_updated_at BEFORE UPDATE ON public.appointment_sticky_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER stamp_audit_user BEFORE INSERT OR UPDATE ON public.appointment_sticky_notes FOR EACH ROW EXECUTE FUNCTION stamp_audit_user();
CREATE TRIGGER knowledge_article_guard BEFORE INSERT OR UPDATE ON public.knowledge_articles FOR EACH ROW EXECUTE FUNCTION knowledge_article_guard();
CREATE TRIGGER knowledge_article_snapshot AFTER INSERT OR UPDATE ON public.knowledge_articles FOR EACH ROW EXECUTE FUNCTION knowledge_article_snapshot();
CREATE TRIGGER knowledge_comment_stamp BEFORE INSERT ON public.knowledge_article_comments FOR EACH ROW EXECUTE FUNCTION knowledge_comment_stamp();
CREATE TRIGGER trg_kac_updated BEFORE UPDATE ON public.knowledge_article_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER whatsapp_delivery_log_only_ours BEFORE INSERT OR UPDATE ON public.whatsapp_delivery_log FOR EACH ROW EXECUTE FUNCTION whatsapp_delivery_log_only_ours();
CREATE TRIGGER appointments_set_patient_name BEFORE INSERT OR UPDATE OF patient_id ON public.appointments FOR EACH ROW EXECUTE FUNCTION set_record_patient_name();
CREATE TRIGGER set_appointment_doctor_name BEFORE INSERT OR UPDATE OF staff_id ON public.appointments FOR EACH ROW EXECUTE FUNCTION set_appointment_doctor_name();
CREATE TRIGGER set_appointment_therapist_name BEFORE INSERT OR UPDATE OF therapist_id ON public.appointments FOR EACH ROW EXECUTE FUNCTION set_appointment_therapist_name();
CREATE TRIGGER stamp_appointment_app_edit BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION stamp_appointment_app_edit();
CREATE TRIGGER autolink_invoice_appointment BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION autolink_invoice_appointment();
CREATE TRIGGER invoices_set_patient_name BEFORE INSERT OR UPDATE OF patient_id ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_record_patient_name();
CREATE TRIGGER guard_patient_visit_rollups BEFORE INSERT OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION guard_patient_visit_rollups();
CREATE TRIGGER patients_drop_import_source_stamp BEFORE INSERT ON public.patients FOR EACH ROW EXECUTE FUNCTION drop_import_source_stamp();
CREATE TRIGGER patients_propagate_name AFTER UPDATE OF first_name, last_name ON public.patients FOR EACH ROW EXECUTE FUNCTION propagate_patient_name();
CREATE TRIGGER route_treatments_to_services BEFORE INSERT ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION route_treatments_to_services();

-- ------------------------------------------------------ storage (knowledge)
insert into storage.buckets (id, name, public, file_size_limit)
values ('knowledge-attachments', 'knowledge-attachments', false, 20971520)
on conflict (id) do nothing;

create policy knowledge_files_upload on storage.objects for INSERT to authenticated with check (((bucket_id = 'knowledge-attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND can_manage_knowledge()));
create policy knowledge_files_read on storage.objects for SELECT to authenticated using (((bucket_id = 'knowledge-attachments'::text) AND knowledge_file_visible(name)));

commit;
