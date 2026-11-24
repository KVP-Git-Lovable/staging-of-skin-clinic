-- Security: move_to_trash and restore_from_trash no longer build SQL text
-- from what a caller passes in or from what a Trash row says.
--
-- move_to_trash: the table it reads and deletes from is now picked by a fixed
-- CASE over the Trash allow-list, with a static statement per table. Same
-- signature, same checks, same result, so the published app keeps working.
--
-- restore_from_trash: the re-insert of the saved row moves into
-- trash_reinsert_record, which is SECURITY INVOKER, re-checks the allow-list
-- and the saved id itself, and cannot be called by app users. The definer
-- body itself runs no dynamic SQL.
--
-- patient_visit_notes: still steps past the per-visit notes rule on purpose
-- (a therapist needs the notes from the patient's earlier visits), but now
-- refuses outright unless the caller is a signed-in, active staff member, and
-- still only answers for a visit of a patient whose current appointment the
-- caller may see (via patient_visit_history).

create or replace function public.move_to_trash(_object_type text, _record_id uuid, _label text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  row_json jsonb;
  kids     jsonb;
  new_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_staff() then
    raise exception 'Only clinic staff can delete records' using errcode = '42501';
  end if;
  if not public.trash_allowed_object(_object_type) then
    raise exception 'Object % is not enabled for trash', _object_type;
  end if;

  if not public.can_trash_record(_object_type, _record_id) then
    raise exception 'You can only delete your own records';
  end if;

  case _object_type
    when 'patients' then select to_jsonb(t) into row_json from public.patients t where t.id = _record_id;
    when 'appointments' then select to_jsonb(t) into row_json from public.appointments t where t.id = _record_id;
    when 'procedures' then select to_jsonb(t) into row_json from public.procedures t where t.id = _record_id;
    when 'invoices' then select to_jsonb(t) into row_json from public.invoices t where t.id = _record_id;
    when 'pharma_products' then select to_jsonb(t) into row_json from public.pharma_products t where t.id = _record_id;
    when 'pharma_bills' then select to_jsonb(t) into row_json from public.pharma_bills t where t.id = _record_id;
    when 'expenses' then select to_jsonb(t) into row_json from public.expenses t where t.id = _record_id;
    when 'assets' then select to_jsonb(t) into row_json from public.assets t where t.id = _record_id;
    when 'vendors' then select to_jsonb(t) into row_json from public.vendors t where t.id = _record_id;
    when 'services' then select to_jsonb(t) into row_json from public.services t where t.id = _record_id;
    when 'doctors' then select to_jsonb(t) into row_json from public.doctors t where t.id = _record_id;
    when 'staff' then select to_jsonb(t) into row_json from public.staff t where t.id = _record_id;
    when 'campaigns' then select to_jsonb(t) into row_json from public.campaigns t where t.id = _record_id;
    when 'portal_orders' then select to_jsonb(t) into row_json from public.portal_orders t where t.id = _record_id;
    when 'survey_templates' then select to_jsonb(t) into row_json from public.survey_templates t where t.id = _record_id;
    when 'survey_responses' then select to_jsonb(t) into row_json from public.survey_responses t where t.id = _record_id;
    when 'patient_photos' then select to_jsonb(t) into row_json from public.patient_photos t where t.id = _record_id;
    when 'prescriptions' then select to_jsonb(t) into row_json from public.prescriptions t where t.id = _record_id;
    when 'list_views' then select to_jsonb(t) into row_json from public.list_views t where t.id = _record_id;
    when 'problem_areas' then select to_jsonb(t) into row_json from public.problem_areas t where t.id = _record_id;
    when 'tax_master' then select to_jsonb(t) into row_json from public.tax_master t where t.id = _record_id;
    when 'hsn_tax_master' then select to_jsonb(t) into row_json from public.hsn_tax_master t where t.id = _record_id;
    when 'category_master' then select to_jsonb(t) into row_json from public.category_master t where t.id = _record_id;
    when 'unit_master' then select to_jsonb(t) into row_json from public.unit_master t where t.id = _record_id;
    when 'saved_reports' then select to_jsonb(t) into row_json from public.saved_reports t where t.id = _record_id;
    else raise exception 'Object % is not enabled for trash', _object_type;
  end case;

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

  case _object_type
    when 'patients' then delete from public.patients where id = _record_id;
    when 'appointments' then delete from public.appointments where id = _record_id;
    when 'procedures' then delete from public.procedures where id = _record_id;
    when 'invoices' then delete from public.invoices where id = _record_id;
    when 'pharma_products' then delete from public.pharma_products where id = _record_id;
    when 'pharma_bills' then delete from public.pharma_bills where id = _record_id;
    when 'expenses' then delete from public.expenses where id = _record_id;
    when 'assets' then delete from public.assets where id = _record_id;
    when 'vendors' then delete from public.vendors where id = _record_id;
    when 'services' then delete from public.services where id = _record_id;
    when 'doctors' then delete from public.doctors where id = _record_id;
    when 'staff' then delete from public.staff where id = _record_id;
    when 'campaigns' then delete from public.campaigns where id = _record_id;
    when 'portal_orders' then delete from public.portal_orders where id = _record_id;
    when 'survey_templates' then delete from public.survey_templates where id = _record_id;
    when 'survey_responses' then delete from public.survey_responses where id = _record_id;
    when 'patient_photos' then delete from public.patient_photos where id = _record_id;
    when 'prescriptions' then delete from public.prescriptions where id = _record_id;
    when 'list_views' then delete from public.list_views where id = _record_id;
    when 'problem_areas' then delete from public.problem_areas where id = _record_id;
    when 'tax_master' then delete from public.tax_master where id = _record_id;
    when 'hsn_tax_master' then delete from public.hsn_tax_master where id = _record_id;
    when 'category_master' then delete from public.category_master where id = _record_id;
    when 'unit_master' then delete from public.unit_master where id = _record_id;
    when 'saved_reports' then delete from public.saved_reports where id = _record_id;
    else raise exception 'Object % is not enabled for trash', _object_type;
  end case;

  return new_id;
end;
$function$;

revoke all on function public.move_to_trash(text, uuid, text) from public, anon;
grant execute on function public.move_to_trash(text, uuid, text) to authenticated, service_role;

-- Re-inserts one saved Trash row into its own table. Invoker, not callable by
-- app users: only restore_from_trash (running as owner) reaches it.
create or replace function public.trash_reinsert_record(_object_type text, _record_id uuid, _data jsonb)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_cols   text;
  v_back   boolean;
begin
  if not public.trash_allowed_object(_object_type) then
    raise exception 'The % table is not one this app knows how to restore', _object_type;
  end if;
  if _data is null or jsonb_typeof(_data) <> 'object' then
    raise exception 'This Trash item has no saved record - nothing has been changed';
  end if;
  if _data ? 'id' and _data->>'id' is distinct from _record_id::text then
    raise exception 'This Trash item does not match the record it was saved from - nothing has been changed';
  end if;

  v_cols := public.trash_insertable_columns(_object_type);
  if v_cols is null then
    raise exception 'The % table is not one this app knows how to restore', _object_type;
  end if;

  execute format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
                 _object_type, v_cols, v_cols, _object_type) using _data;

  execute format('select exists (select 1 from public.%I t where t.id = $1)', _object_type)
    into v_back using _record_id;
  if not v_back then
    raise exception 'The % could not be put back - nothing has been changed', _object_type;
  end if;
end;
$function$;

revoke all on function public.trash_reinsert_record(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.trash_reinsert_record(text, uuid, jsonb) to service_role;

create or replace function public.restore_from_trash(_trash_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  item     public.trash_items;
  v_sf     text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_staff() then
    raise exception 'Only clinic staff can restore from Trash' using errcode = '42501';
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

  if not public.trash_allowed_object(item.object_type) then
    raise exception 'The % table is not one this app knows how to restore', item.object_type;
  end if;
  if item.record_data ? 'id' and item.record_data->>'id' is distinct from item.record_id::text then
    raise exception 'This Trash item does not match the record it was saved from - nothing has been changed';
  end if;

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

  perform public.trash_reinsert_record(item.object_type, item.record_id, item.record_data);

  perform public.trash_restore_children(item.object_type, item.record_id, item.child_data);
end;
$function$;

revoke all on function public.restore_from_trash(uuid) from public, anon;
grant execute on function public.restore_from_trash(uuid) to authenticated, service_role;

create or replace function public.patient_visit_notes(p_appointment_id uuid, p_visit_id uuid)
 returns table(id uuid, title text, content text, created_at timestamp with time zone, author_first_name text, author_last_name text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  -- Only a signed-in, active staff member gets an answer at all.
  if auth.uid() is null
     or public.current_staff_id() is null
     or not public.is_active_staff() then
    return;
  end if;

  -- ...and only for a visit in the history of an appointment the caller
  -- may see. One copy of that rule: patient_visit_history.
  if not exists (select 1 from public.patient_visit_history(p_appointment_id) h
                  where h.id = p_visit_id) then
    return;
  end if;

  return query
  select n.id, n.title, n.content, n.created_at, s.first_name, s.last_name
    from public.appointment_sticky_notes n
    left join public.staff s on s.id = n.created_by
   where n.appointment_id = p_visit_id
   order by n.created_at desc;
end;
$function$;

revoke all on function public.patient_visit_notes(uuid, uuid) from public, anon;
grant execute on function public.patient_visit_notes(uuid, uuid) to authenticated, service_role;
