-- ============================================================================
-- Studio CRM — business logic: activity logging, lead conversion,
-- questionnaire finalization, ordering helpers, dashboard metrics.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Labels used in activity descriptions
-- ---------------------------------------------------------------------------
create or replace function public.project_status_label(s public.project_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'lead' then 'ליד'
    when 'questionnaire_sent' then 'אפיון נשלח'
    when 'questionnaire_received' then 'אפיון התקבל'
    when 'awaiting_deposit' then 'ממתין למקדמה'
    when 'design' then 'עיצוב'
    when 'development' then 'פיתוח'
    when 'testing' then 'בדיקות'
    when 'awaiting_approval' then 'ממתין לאישור לקוח'
    when 'awaiting_final_payment' then 'ממתין ליתרת תשלום'
    when 'completed' then 'הסתיים'
  end;
$$;

create or replace function public.format_ils(amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₪' || to_char(amount, 'FM999,999,990.##');
$$;

-- ---------------------------------------------------------------------------
-- Activity log writer. Silently drops the reference when the parent row is
-- gone (e.g. during a cascading delete of the whole client).
-- ---------------------------------------------------------------------------
create or replace function public.log_activity(
  p_type text,
  p_description text,
  p_client_id uuid,
  p_project_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if p_client_id is not null and not exists (select 1 from public.clients where id = p_client_id) then
    return; -- parent client is being deleted; nothing meaningful to log
  end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id) then
    p_project_id := null;
  end if;
  if v_actor is not null and not exists (select 1 from public.profiles where id = v_actor) then
    v_actor := null;
  end if;

  insert into public.activity_logs (type, description, actor_id, client_id, project_id, entity_type, entity_id, metadata)
  values (p_type, p_description, v_actor, p_client_id, p_project_id, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.log_activity(text, text, uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activity triggers
-- ---------------------------------------------------------------------------
create or replace function public.trg_log_leads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('lead.created', 'ליד חדש: ' || new.name, null, null, 'lead', new.id,
      jsonb_build_object('source', new.source));
  end if;
  return null;
end;
$$;

create trigger leads_activity after insert on public.leads
  for each row execute function public.trg_log_leads();

create or replace function public.trg_log_clients()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('client.created', 'נפתח תיק לקוח: ' || new.name, new.id, null, 'client', new.id, '{}');
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.log_activity('client.status_changed',
        case when new.status = 'archived' then 'הלקוח הועבר לארכיון' else 'סטטוס הלקוח עודכן' end,
        new.id, null, 'client', new.id, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.name is distinct from old.name then changed := changed || 'שם'; end if;
    if new.business_name is distinct from old.business_name then changed := changed || 'עסק'; end if;
    if new.phone is distinct from old.phone then changed := changed || 'טלפון'; end if;
    if new.email is distinct from old.email then changed := changed || 'אימייל'; end if;
    if new.website is distinct from old.website then changed := changed || 'אתר'; end if;
    if array_length(changed, 1) > 0 then
      perform public.log_activity('client.updated', 'פרטי הלקוח עודכנו: ' || array_to_string(changed, ', '),
        new.id, null, 'client', new.id, jsonb_build_object('fields', to_jsonb(changed)));
    end if;
  end if;
  return null;
end;
$$;

create trigger clients_activity after insert or update on public.clients
  for each row execute function public.trg_log_clients();

create or replace function public.trg_log_projects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('project.created', 'נפתח פרויקט: ' || new.name, new.client_id, new.id, 'project', new.id, '{}');
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.log_activity('project.status_changed',
        'סטטוס הפרויקט "' || new.name || '" שונה ל' || public.project_status_label(new.status),
        new.client_id, new.id, 'project', new.id,
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.total_price is distinct from old.total_price or new.deposit_amount is distinct from old.deposit_amount then
      perform public.log_activity('project.pricing_changed',
        'תמחור הפרויקט "' || new.name || '" עודכן: ' || public.format_ils(new.total_price) || ', מקדמה ' || public.format_ils(new.deposit_amount),
        new.client_id, new.id, 'project', new.id,
        jsonb_build_object('total_price', new.total_price, 'deposit_amount', new.deposit_amount,
                           'old_total_price', old.total_price, 'old_deposit_amount', old.deposit_amount));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_activity('project.deleted', 'הפרויקט "' || old.name || '" נמחק', old.client_id, null, 'project', old.id, '{}');
  end if;
  return null;
end;
$$;

create trigger projects_activity after insert or update or delete on public.projects
  for each row execute function public.trg_log_projects();

create or replace function public.trg_log_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_client uuid;
  v_project_name text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select client_id, name into v_client, v_project_name from public.projects where id = r.project_id;
  if v_client is null then
    return null; -- project deleted along with its payments
  end if;

  if tg_op = 'INSERT' then
    perform public.log_activity('payment.added', 'התקבל תשלום של ' || public.format_ils(new.amount) || ' עבור "' || v_project_name || '"',
      v_client, new.project_id, 'payment', new.id, jsonb_build_object('amount', new.amount, 'method', new.method, 'paid_at', new.paid_at));
  elsif tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount or new.paid_at is distinct from old.paid_at or new.method is distinct from old.method then
      perform public.log_activity('payment.updated', 'תשלום עודכן: ' || public.format_ils(old.amount) || ' ← ' || public.format_ils(new.amount),
        v_client, new.project_id, 'payment', new.id, jsonb_build_object('old_amount', old.amount, 'amount', new.amount));
    end if;
  else
    perform public.log_activity('payment.deleted', 'תשלום של ' || public.format_ils(old.amount) || ' נמחק',
      v_client, old.project_id, 'payment', old.id, jsonb_build_object('amount', old.amount));
  end if;
  return null;
end;
$$;

create trigger payments_activity after insert or update or delete on public.payments
  for each row execute function public.trg_log_payments();

create or replace function public.trg_log_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'done' then
      perform public.log_activity('task.completed', 'משימה הושלמה: ' || new.title, new.client_id, new.project_id, 'task', new.id, '{}');
    elsif old.status = 'done' then
      perform public.log_activity('task.reopened', 'משימה נפתחה מחדש: ' || new.title, new.client_id, new.project_id, 'task', new.id, '{}');
    end if;
  end if;
  return null;
end;
$$;

create trigger tasks_activity after update on public.tasks
  for each row execute function public.trg_log_tasks();

create or replace function public.trg_log_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Questionnaire uploads are logged once, on submission.
    if new.source = 'staff' and new.client_id is not null then
      perform public.log_activity('file.uploaded', 'הועלה קובץ: ' || new.original_name, new.client_id, new.project_id, 'file', new.id,
        jsonb_build_object('category', new.category));
    end if;
  elsif tg_op = 'DELETE' then
    if old.client_id is not null then
      perform public.log_activity('file.deleted', 'נמחק קובץ: ' || old.original_name, old.client_id, old.project_id, 'file', old.id, '{}');
    end if;
  end if;
  return null;
end;
$$;

create trigger files_activity after insert or delete on public.files
  for each row execute function public.trg_log_files();

create or replace function public.trg_log_contracts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('contract.created', 'נוסף חוזה: ' || new.title, new.client_id, new.project_id, 'contract', new.id, '{}');
  elsif new.status is distinct from old.status then
    perform public.log_activity('contract.status_changed',
      case new.status when 'signed' then 'החוזה "' || new.title || '" נחתם'
                      when 'sent' then 'החוזה "' || new.title || '" נשלח ללקוח'
                      when 'cancelled' then 'החוזה "' || new.title || '" בוטל'
                      else 'סטטוס החוזה "' || new.title || '" עודכן' end,
      new.client_id, new.project_id, 'contract', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;

create trigger contracts_activity after insert or update on public.contracts
  for each row execute function public.trg_log_contracts();

-- Questionnaire lifecycle + automatic project status progression.
create or replace function public.trg_form_submissions_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('questionnaire.created', 'נוצר קישור לשאלון: ' || new.title, new.client_id, new.project_id, 'form_submission', new.id, '{}');
    return null;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'sent' then
      perform public.log_activity('questionnaire.sent', 'השאלון "' || new.title || '" נשלח ללקוח', new.client_id, new.project_id, 'form_submission', new.id, '{}');
      update public.projects set status = 'questionnaire_sent'
        where id = new.project_id and status = 'lead';
    elsif new.status = 'in_progress' and old.status in ('created', 'sent') then
      perform public.log_activity('questionnaire.started', 'הלקוח התחיל למלא את "' || new.title || '"', new.client_id, new.project_id, 'form_submission', new.id, '{}');
    elsif new.status = 'completed' then
      perform public.log_activity('questionnaire.submitted', 'הלקוח שלח את השאלון "' || new.title || '"', new.client_id, new.project_id, 'form_submission', new.id, '{}');
      update public.projects set status = 'questionnaire_received'
        where id = new.project_id and status in ('lead', 'questionnaire_sent');
    elsif new.status = 'cancelled' then
      perform public.log_activity('questionnaire.cancelled', 'השאלון "' || new.title || '" בוטל', new.client_id, new.project_id, 'form_submission', new.id, '{}');
    end if;
  end if;
  return null;
end;
$$;

create trigger form_submissions_after after insert or update on public.form_submissions
  for each row execute function public.trg_form_submissions_after();

-- ---------------------------------------------------------------------------
-- Lead -> client (+ optional project), atomically.
-- Reuses an existing client when the email or phone already belongs to one.
-- ---------------------------------------------------------------------------
create or replace function public.convert_lead(
  p_lead_id uuid,
  p_create_project boolean default true,
  p_project_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
  v_client_id uuid;
  v_project_id uuid;
  v_reused boolean := false;
begin
  if not public.is_staff() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;
  if l.converted_client_id is not null then
    raise exception 'Lead already converted' using errcode = 'P0001', hint = 'already_converted';
  end if;

  select c.id into v_client_id
  from public.clients c
  where (l.email is not null and lower(c.email) = lower(l.email))
     or (l.phone_digits is not null and length(l.phone_digits) >= 7 and c.phone_digits = l.phone_digits)
  order by c.created_at
  limit 1;

  if v_client_id is null then
    insert into public.clients (name, business_name, phone, email, source, notes, is_demo)
    values (l.name, l.business_name, l.phone, l.email, l.source, l.notes, l.is_demo)
    returning id into v_client_id;
  else
    v_reused := true;
  end if;

  if p_create_project then
    insert into public.projects (client_id, name, project_type, total_price, status, notes)
    values (
      v_client_id,
      coalesce(nullif(trim(p_project_name), ''), coalesce(l.business_name, l.name)),
      coalesce(l.project_type, 'business_site'),
      coalesce(l.estimated_value, 0),
      'lead',
      null
    )
    returning id into v_project_id;
  end if;

  update public.leads
     set status = 'converted',
         converted_client_id = v_client_id,
         converted_project_id = v_project_id,
         converted_at = now()
   where id = p_lead_id;

  perform public.log_activity('lead.converted',
    case when v_reused then 'הליד "' || l.name || '" צורף ללקוח קיים' else 'הליד "' || l.name || '" הומר ללקוח' end,
    v_client_id, v_project_id, 'lead', l.id, jsonb_build_object('lead_id', l.id, 'reused_client', v_reused));

  return jsonb_build_object('client_id', v_client_id, 'project_id', v_project_id, 'reused_client', v_reused);
end;
$$;

revoke all on function public.convert_lead(uuid, boolean, text) from public, anon;
grant execute on function public.convert_lead(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Questionnaire finalization. Called only by the server (service role) AFTER
-- the answers were validated against the frozen snapshot.
--   p_answers: [{question_id, section_title, section_position, question_label,
--               question_type, position, value}]
--   p_client:  {name, business_name, email, phone, website} (from maps_to)
-- ---------------------------------------------------------------------------
create or replace function public.finalize_questionnaire(
  p_submission_id uuid,
  p_answers jsonb,
  p_client jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.form_submissions;
  v_client_id uuid;
  v_created_client boolean := false;
  v_file_ids uuid[];
  v_orphans text[];
  v_email text := nullif(trim(p_client ->> 'email'), '');
  v_phone text := nullif(trim(p_client ->> 'phone'), '');
  v_phone_digits text := nullif(regexp_replace(coalesce(p_client ->> 'phone', ''), '\D', '', 'g'), '');
begin
  select * into s from public.form_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if s.status in ('completed', 'cancelled') then
    raise exception 'Submission is closed' using errcode = 'P0001', hint = 'closed';
  end if;

  v_client_id := s.client_id;

  -- No client yet: attach to an existing one (email/phone) or create it.
  if v_client_id is null then
    select c.id into v_client_id
    from public.clients c
    where (v_email is not null and lower(c.email) = lower(v_email))
       or (v_phone_digits is not null and length(v_phone_digits) >= 7 and c.phone_digits = v_phone_digits)
    order by c.created_at
    limit 1;

    if v_client_id is null then
      if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_email := null;
      end if;
      insert into public.clients (name, business_name, phone, email, website, source)
      values (
        coalesce(nullif(trim(p_client ->> 'name'), ''), nullif(trim(p_client ->> 'business_name'), ''), 'לקוח מהשאלון'),
        nullif(trim(p_client ->> 'business_name'), ''),
        v_phone,
        v_email,
        nullif(trim(p_client ->> 'website'), ''),
        'website'
      )
      returning id into v_client_id;
      v_created_client := true;
    end if;
  end if;

  insert into public.form_answers (submission_id, question_id, section_title, section_position, question_label, question_type, position, value)
  select
    p_submission_id,
    (a ->> 'question_id')::uuid,
    coalesce(a ->> 'section_title', ''),
    coalesce((a ->> 'section_position')::int, 0),
    coalesce(a ->> 'question_label', ''),
    (a ->> 'question_type')::public.question_type,
    coalesce((a ->> 'position')::int, 0),
    a -> 'value'
  from jsonb_array_elements(p_answers) a;

  -- Files referenced by upload answers belong to this client/project now.
  select coalesce(array_agg(distinct (f ->> 'file_id')::uuid), '{}')
    into v_file_ids
  from jsonb_array_elements(p_answers) a
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(a -> 'value') = 'array' and (a ->> 'question_type') in ('image_upload', 'file_upload')
         then a -> 'value' else '[]'::jsonb end
  ) f;

  update public.files
     set client_id = v_client_id,
         project_id = coalesce(s.project_id, project_id)
   where submission_id = p_submission_id
     and id = any (v_file_ids);

  -- Uploads the client removed before submitting are cleaned up.
  with gone as (
    delete from public.files
     where submission_id = p_submission_id
       and not (id = any (v_file_ids))
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_orphans from gone;

  update public.form_submissions
     set status = 'completed',
         client_id = v_client_id,
         completed_at = now(),
         last_saved_at = now(),
         draft_answers = '{}'::jsonb
   where id = p_submission_id;

  if v_created_client then
    perform public.log_activity('client.created_from_questionnaire', 'הלקוח נוצר אוטומטית מתוך השאלון', v_client_id, s.project_id,
      'form_submission', p_submission_id, '{}');
  end if;

  if coalesce(array_length(v_file_ids, 1), 0) > 0 then
    perform public.log_activity('file.uploaded', 'הלקוח העלה ' || array_length(v_file_ids, 1) || ' קבצים דרך השאלון', v_client_id, s.project_id,
      'form_submission', p_submission_id, jsonb_build_object('count', array_length(v_file_ids, 1)));
  end if;

  return jsonb_build_object('client_id', v_client_id, 'created_client', v_created_client, 'orphan_paths', to_jsonb(v_orphans));
end;
$$;

revoke all on function public.finalize_questionnaire(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_questionnaire(uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Ordering helpers for the form builder (RLS applies — security invoker).
-- ---------------------------------------------------------------------------
create or replace function public.reorder_form_sections(p_template_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.form_sections s
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.template_id = p_template_id;
end;
$$;

-- Also moves questions into p_section_id (drag between sections).
create or replace function public.reorder_form_questions(p_section_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_template uuid;
begin
  select template_id into v_template from public.form_sections where id = p_section_id;
  if v_template is null then
    raise exception 'Section not found' using errcode = 'P0002';
  end if;

  update public.form_questions q
     set section_id = p_section_id,
         position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where q.id = o.id
     and exists (
       select 1 from public.form_sections s
       where s.id = q.section_id and s.template_id = v_template
     );
end;
$$;

revoke all on function public.reorder_form_sections(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_form_questions(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_form_sections(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_form_questions(uuid, uuid[]) to authenticated;

-- Deep copy of a template, remapping conditional-question references.
create or replace function public.duplicate_form_template(p_template_id uuid, p_name text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new_template uuid;
  sec record;
  v_new_section uuid;
  q record;
  v_map jsonb := '{}'::jsonb;
  v_new_q uuid;
begin
  insert into public.form_templates (name, description, project_type)
  select coalesce(nullif(trim(p_name), ''), name || ' (עותק)'), description, project_type
  from public.form_templates where id = p_template_id
  returning id into v_new_template;

  if v_new_template is null then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;

  for sec in select * from public.form_sections where template_id = p_template_id order by position loop
    insert into public.form_sections (template_id, title, description, position)
    values (v_new_template, sec.title, sec.description, sec.position)
    returning id into v_new_section;

    for q in select * from public.form_questions where section_id = sec.id order by position loop
      insert into public.form_questions (section_id, type, label, description, placeholder, required, options, condition, maps_to, position)
      values (v_new_section, q.type, q.label, q.description, q.placeholder, q.required, q.options, q.condition, q.maps_to, q.position)
      returning id into v_new_q;
      v_map := v_map || jsonb_build_object(q.id::text, v_new_q::text);
    end loop;
  end loop;

  update public.form_questions nq
     set condition = jsonb_set(nq.condition, '{question_id}', to_jsonb(v_map ->> (nq.condition ->> 'question_id')))
   where nq.condition is not null
     and v_map ? (nq.condition ->> 'question_id')
     and nq.section_id in (select id from public.form_sections where template_id = v_new_template);

  return v_new_template;
end;
$$;

revoke all on function public.duplicate_form_template(uuid, text) from public, anon;
grant execute on function public.duplicate_form_template(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard metrics — computed in one round-trip, respecting RLS.
-- "Month" is the calendar month in Israel time.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select
      date_trunc('month', (now() at time zone 'Asia/Jerusalem'))::date as month_start,
      (now() at time zone 'Asia/Jerusalem')::date as today
  ),
  fin as (
    select f.*, p.status, p.deadline, p.status_changed_at
    from public.project_financials f
    join public.projects p on p.id = f.project_id
  )
  select jsonb_build_object(
    'revenue_this_month', (
      select coalesce(sum(amount), 0) from public.payments, bounds
      where paid_at >= bounds.month_start and paid_at < (bounds.month_start + interval '1 month')::date
    ),
    'revenue_last_month', (
      select coalesce(sum(amount), 0) from public.payments, bounds
      where paid_at >= (bounds.month_start - interval '1 month')::date and paid_at < bounds.month_start
    ),
    'outstanding_balance', (
      select coalesce(sum(greatest(balance_due, 0)), 0) from fin where status <> 'lead'
    ),
    'active_projects', (
      select count(*) from public.projects where status not in ('lead', 'completed')
    ),
    'questionnaires_pending', (
      select count(*) from public.form_submissions where status in ('created', 'sent', 'in_progress')
    ),
    'clients_awaiting_payment', (
      select count(distinct client_id) from fin
      where status in ('awaiting_deposit', 'awaiting_final_payment') and balance_due > 0
    ),
    'open_tasks', (
      select count(*) from public.tasks where status <> 'done'
    ),
    'overdue_tasks', (
      select count(*) from public.tasks, bounds where status <> 'done' and due_date < bounds.today
    ),
    'projects_attention', (
      select count(*) from fin, bounds
      where status not in ('lead', 'completed')
        and (
          (deadline is not null and deadline < bounds.today)
          or status_changed_at < now() - interval '14 days'
        )
    )
  )
  from bounds;
$$;

revoke all on function public.dashboard_metrics() from public, anon;
grant execute on function public.dashboard_metrics() to authenticated;
