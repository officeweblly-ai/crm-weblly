-- ============================================================================
-- Studio CRM — Row Level Security, privileges and storage.
--
-- Model: only active staff (public.is_staff()) can touch CRM data.
-- The anonymous role gets NOTHING. Public questionnaires are served by the
-- Next.js server, which validates the secret token and then uses the service
-- role — so a leaked anon key can never read another client's data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Privileges: strip anon completely (defense in depth on top of RLS)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Helper functions that RLS policies need.
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.workspace_settings  enable row level security;
alter table public.clients             enable row level security;
alter table public.leads               enable row level security;
alter table public.projects            enable row level security;
alter table public.payments            enable row level security;
alter table public.form_templates      enable row level security;
alter table public.form_sections       enable row level security;
alter table public.form_questions      enable row level security;
alter table public.form_submissions    enable row level security;
alter table public.form_answers        enable row level security;
alter table public.files               enable row level security;
alter table public.contracts           enable row level security;
alter table public.tasks               enable row level security;
alter table public.notes               enable row level security;
alter table public.activity_logs       enable row level security;

-- ---------------------------------------------------------------------------
-- Staff full-access tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'leads', 'projects', 'payments', 'form_templates', 'form_sections',
    'form_questions', 'form_submissions', 'files', 'contracts', 'tasks', 'notes'
  ] loop
    execute format(
      'create policy "staff_all_%1$s" on public.%1$I for all to authenticated
         using ((select public.is_staff())) with check ((select public.is_staff()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspace settings: staff read, owner edits
-- ---------------------------------------------------------------------------
create policy "staff_read_settings" on public.workspace_settings
  for select to authenticated using ((select public.is_staff()));
create policy "owner_update_settings" on public.workspace_settings
  for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---------------------------------------------------------------------------
-- Profiles: staff can see the team; you edit yourself, the owner edits anyone.
-- Role / activation changes are owner-only (enforced by trigger).
-- A user who is not (yet) active can still read their own row so the app can
-- explain "your account is pending approval".
-- ---------------------------------------------------------------------------
create policy "read_profiles" on public.profiles
  for select to authenticated
  using ((select public.is_staff()) or id = (select auth.uid()));

create policy "update_profiles" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_owner()))
  with check (id = (select auth.uid()) or (select public.is_owner()));

revoke update on public.profiles from authenticated;
grant update (full_name, role, is_active) on public.profiles to authenticated;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service role / SQL editor (no JWT) may do anything.
  if auth.uid() is null then
    return new;
  end if;
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    if not public.is_owner() then
      raise exception 'Only the owner can change roles' using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'You cannot change your own role or deactivate yourself' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- Answers are immutable: staff can read them and annotate internal_note only.
-- Inserts happen exclusively in finalize_questionnaire (security definer).
-- ---------------------------------------------------------------------------
create policy "staff_read_answers" on public.form_answers
  for select to authenticated using ((select public.is_staff()));
create policy "staff_note_answers" on public.form_answers
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

revoke insert, update, delete on public.form_answers from authenticated;
grant update (internal_note) on public.form_answers to authenticated;

-- ---------------------------------------------------------------------------
-- Activity log: read-only for staff (rows are written by definer functions).
-- ---------------------------------------------------------------------------
create policy "staff_read_activity" on public.activity_logs
  for select to authenticated using ((select public.is_staff()));

revoke insert, update, delete on public.activity_logs from authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket. Objects are reachable only via short-lived
-- signed URLs minted by the server after authorization.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-files',
  'crm-files',
  false,
  26214400, -- 25 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'application/postscript', 'application/illustrator',
    'image/vnd.adobe.photoshop', 'application/x-photoshop',
    'font/ttf', 'font/otf', 'font/woff', 'font/woff2'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "staff_read_crm_files" on storage.objects
  for select to authenticated
  using (bucket_id = 'crm-files' and (select public.is_staff()));

create policy "staff_insert_crm_files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'crm-files' and (select public.is_staff()));

create policy "staff_update_crm_files" on storage.objects
  for update to authenticated
  using (bucket_id = 'crm-files' and (select public.is_staff()));

create policy "staff_delete_crm_files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'crm-files' and (select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Function privileges. PostgreSQL grants EXECUTE to PUBLIC by default, which
-- anon would inherit. Remove it, then grant back to the roles that need it.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.log_activity(text, text, uuid, uuid, text, uuid, jsonb) from authenticated;
revoke execute on function public.finalize_questionnaire(uuid, jsonb, jsonb) from authenticated;
