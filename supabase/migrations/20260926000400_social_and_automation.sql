-- ============================================================================
-- Studio CRM — v1.1
--  * client lifecycle: "maintenance" (תפעול אתר) status
--  * file categories: references, site texts, social
--  * multi-select "choose up to N"
--  * general (public) questionnaire link per template
--  * questionnaire submission auto-creates the project (and client) if missing
--  * Social: albums of build-process media for content creation
-- ============================================================================

alter type public.client_status add value if not exists 'maintenance' after 'active';
alter type public.file_category add value if not exists 'references' after 'branding';
alter type public.file_category add value if not exists 'site_texts' after 'references';
alter type public.file_category add value if not exists 'social' after 'deliverables';

-- ---------------------------------------------------------------------------
-- Questionnaires
-- ---------------------------------------------------------------------------
alter table public.form_questions
  add column if not exists max_choices smallint check (max_choices is null or max_choices >= 1);

-- A template can have one shareable link. Anyone with it can START a new
-- questionnaire (the server then creates a private per-person submission).
alter table public.form_templates
  add column if not exists public_token text unique check (public_token is null or length(public_token) >= 32);

create or replace function public.project_type_label(t public.project_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case t
    when 'business_site' then 'אתר תדמית'
    when 'landing_page' then 'דף נחיתה'
    when 'ecommerce' then 'חנות אונליין'
    when 'web_app' then 'מערכת'
    else 'פרויקט'
  end;
$$;

-- Same contract as before, plus: when the submission has no project, one is
-- opened for the client automatically (type taken from the template).
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
  v_project_id uuid;
  v_created_client boolean := false;
  v_created_project boolean := false;
  v_type public.project_type;
  v_client_label text;
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
  v_project_id := s.project_id;

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

  if v_project_id is null then
    select coalesce(t.project_type, 'business_site') into v_type
    from public.form_templates t where t.id = s.template_id;
    v_type := coalesce(v_type, 'business_site');
    select coalesce(c.business_name, c.name) into v_client_label from public.clients c where c.id = v_client_id;

    insert into public.projects (client_id, name, project_type, status, description, next_action)
    values (
      v_client_id,
      public.project_type_label(v_type) || ' — ' || coalesce(v_client_label, 'לקוח חדש'),
      v_type,
      'questionnaire_received',
      'נפתח אוטומטית כשהלקוח שלח את השאלון "' || s.title || '".',
      'לעבור על האפיון ולשלוח הצעת מחיר'
    )
    returning id into v_project_id;
    v_created_project := true;
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

  select coalesce(array_agg(distinct (f ->> 'file_id')::uuid), '{}')
    into v_file_ids
  from jsonb_array_elements(p_answers) a
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(a -> 'value') = 'array' and (a ->> 'question_type') in ('image_upload', 'file_upload')
         then a -> 'value' else '[]'::jsonb end
  ) f;

  update public.files
     set client_id = v_client_id,
         project_id = v_project_id
   where submission_id = p_submission_id
     and id = any (v_file_ids);

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
         project_id = v_project_id,
         completed_at = now(),
         last_saved_at = now(),
         draft_answers = '{}'::jsonb
   where id = p_submission_id;

  if v_created_client then
    perform public.log_activity('client.created_from_questionnaire', 'הלקוח נוצר אוטומטית מתוך השאלון', v_client_id, v_project_id,
      'form_submission', p_submission_id, '{}');
  end if;
  if v_created_project then
    perform public.log_activity('project.created_from_questionnaire', 'נפתח פרויקט אוטומטית מתוך השאלון', v_client_id, v_project_id,
      'form_submission', p_submission_id, '{}');
  end if;
  if coalesce(array_length(v_file_ids, 1), 0) > 0 then
    perform public.log_activity('file.uploaded', 'הלקוח העלה ' || array_length(v_file_ids, 1) || ' קבצים דרך השאלון', v_client_id, v_project_id,
      'form_submission', p_submission_id, jsonb_build_object('count', array_length(v_file_ids, 1)));
  end if;

  return jsonb_build_object(
    'client_id', v_client_id, 'project_id', v_project_id,
    'created_client', v_created_client, 'created_project', v_created_project,
    'orphan_paths', to_jsonb(v_orphans)
  );
end;
$$;

revoke all on function public.finalize_questionnaire(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_questionnaire(uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Social albums
-- ---------------------------------------------------------------------------
create type public.social_album_status as enum ('collecting', 'editing', 'published');

create table public.social_albums (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  description  text,
  client_id    uuid references public.clients (id) on delete set null,
  project_id   uuid references public.projects (id) on delete set null,
  status       public.social_album_status not null default 'collecting',
  notes        text,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index social_albums_created_idx on public.social_albums (created_at desc);

create trigger social_albums_updated_at before update on public.social_albums
  for each row execute function public.set_updated_at();

alter table public.files
  add column if not exists album_id uuid references public.social_albums (id) on delete cascade,
  add column if not exists album_section text check (album_section is null or album_section in ('process', 'before_after', 'final', 'behind_scenes', 'other'));

create index if not exists files_album_idx on public.files (album_id, created_at);

alter table public.social_albums enable row level security;
create policy "staff_all_social_albums" on public.social_albums for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
revoke all on public.social_albums from anon;

-- Videos for social content; 50 MB is the Supabase free-plan ceiling.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = allowed_mime_types || array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
 where id = 'crm-files'
   and not ('video/mp4' = any (allowed_mime_types));

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.log_activity(text, text, uuid, uuid, text, uuid, jsonb) from authenticated;
revoke execute on function public.finalize_questionnaire(uuid, jsonb, jsonb) from authenticated;
