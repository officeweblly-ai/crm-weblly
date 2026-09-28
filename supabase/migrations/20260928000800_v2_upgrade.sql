-- ============================================================================
-- V2 upgrade — additive only. Nothing existing is renamed, dropped or changed
-- in meaning; every new column has a safe default for existing rows.
--
--  * Tasks 2.0: start date, blocking task, internal notes, links, checklist,
--    files attached to a task (assignee = the existing tasks.assigned_to).
--  * Project links + references (inspiration links).
--  * Client presentation: secure per-project token, shareable files,
--    client-visible links, a short progress update for the client.
--  * Approvals & feedback (answered by the client through the token).
--  * AI development handoff packages.
--  * Portfolio built from existing projects.
--  * Small automations (questionnaire received → next action).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tasks 2.0
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists start_date date,
  add column if not exists blocked_by_task_id uuid references public.tasks (id) on delete set null,
  add column if not exists internal_notes text,
  -- [{"label": text, "url": text}]
  add column if not exists links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array');

alter table public.tasks
  add constraint tasks_dates_order check (due_date is null or start_date is null or due_date >= start_date),
  add constraint tasks_not_self_blocked check (blocked_by_task_id is null or blocked_by_task_id <> id);

create index if not exists tasks_assigned_idx on public.tasks (assigned_to) where status <> 'done';
create index if not exists tasks_blocked_by_idx on public.tasks (blocked_by_task_id) where blocked_by_task_id is not null;

create table public.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  is_done     boolean not null default false,
  position    double precision not null default extract(epoch from clock_timestamp()),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index task_checklist_items_task_idx on public.task_checklist_items (task_id, position);

create trigger task_checklist_items_updated_at before update on public.task_checklist_items
  for each row execute function public.set_updated_at();

-- Files can belong to a task (still owned by the client/project as before).
alter table public.files
  add column if not exists task_id uuid references public.tasks (id) on delete set null,
  -- Explicitly chosen by staff to appear in the client presentation.
  add column if not exists is_shared boolean not null default false;

create index if not exists files_task_idx on public.files (task_id) where task_id is not null;

-- Internal notes the staff chose to include in the AI handoff package.
alter table public.notes
  add column if not exists share_with_ai boolean not null default false;

-- Task activity: also log the new statuses (completion was already logged).
create or replace function public.task_status_label(s public.task_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s::text
    when 'todo' then 'לא התחיל'
    when 'in_progress' then 'בעבודה'
    when 'waiting_client' then 'ממתין ללקוח'
    when 'blocked' then 'חסום'
    when 'done' then 'הושלם'
  end;
$$;

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
    elsif new.status::text in ('waiting_client', 'blocked') then
      perform public.log_activity('task.status_changed',
        'המשימה "' || new.title || '" סומנה: ' || public.task_status_label(new.status),
        new.client_id, new.project_id, 'task', new.id, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  end if;
  return null;
end;
$$;


-- ---------------------------------------------------------------------------
-- Projects: tech stack (for the AI handoff) + client presentation fields
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists tech_stack text,
  -- Shown to the client: a short progress update and what we need from them.
  add column if not exists client_update text,
  add column if not exists client_action text,
  add column if not exists portal_token text unique check (portal_token is null or length(portal_token) >= 32),
  add column if not exists portal_enabled_at timestamptz;

create or replace function public.trg_log_project_portal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.portal_token is distinct from old.portal_token then
    perform public.log_activity(
      case when new.portal_token is null then 'project.portal_revoked' else 'project.portal_created' end,
      case when new.portal_token is null then 'קישור הצפייה ללקוח בוטל'
           when old.portal_token is null then 'נוצר קישור צפייה ללקוח'
           else 'קישור הצפייה ללקוח הוחלף בקישור חדש' end,
      new.client_id, new.id, 'project', new.id, '{}');
  end if;
  return null;
end;
$$;

create trigger projects_portal_activity after update of portal_token on public.projects
  for each row execute function public.trg_log_project_portal();

-- ---------------------------------------------------------------------------
-- Project links (one place for every URL of the project)
-- ---------------------------------------------------------------------------
create table public.project_links (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  kind            text not null default 'custom' check (kind in (
                    'github', 'production', 'staging', 'vercel', 'supabase', 'figma', 'claude', 'codex',
                    'analytics', 'search_console', 'google_ads', 'domain', 'custom')),
  label           text,
  url             text not null check (length(trim(url)) > 0),
  note            text,
  -- Only preview-type links may be shown in the client presentation.
  client_visible  boolean not null default false,
  position        double precision not null default extract(epoch from clock_timestamp()),
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index project_links_project_idx on public.project_links (project_id, position);

create trigger project_links_updated_at before update on public.project_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- References (inspiration links; reference *files* stay in public.files)
-- ---------------------------------------------------------------------------
create table public.project_references (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  url         text not null check (length(trim(url)) > 0),
  category    text not null default 'general' check (category in ('hero', 'animation', 'mobile', 'competitor', 'general', 'other')),
  note        text,
  position    double precision not null default extract(epoch from clock_timestamp()),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index project_references_project_idx on public.project_references (project_id, position);

create trigger project_references_updated_at before update on public.project_references
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Approvals & feedback
-- ---------------------------------------------------------------------------
create table public.project_approvals (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.projects (id) on delete cascade,
  title                   text not null check (length(trim(title)) > 0),
  description             text,
  kind                    text not null default 'other' check (kind in ('hero', 'design_desktop', 'design_mobile', 'page', 'full_site', 'other')),
  preview_url             text,
  -- Files shown inside this approval (chosen by staff from the project files).
  file_ids                uuid[] not null default '{}',
  status                  text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'cancelled')),
  create_task_on_changes  boolean not null default true,
  change_task_id          uuid references public.tasks (id) on delete set null,
  responded_at            timestamptz,
  created_by              uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index project_approvals_project_idx on public.project_approvals (project_id, created_at desc);
create index project_approvals_pending_idx on public.project_approvals (status) where status = 'pending';

create trigger project_approvals_updated_at before update on public.project_approvals
  for each row execute function public.set_updated_at();

create table public.approval_feedback (
  id           uuid primary key default gen_random_uuid(),
  approval_id  uuid not null references public.project_approvals (id) on delete cascade,
  decision     text not null check (decision in ('approved', 'changes_requested')),
  comment      text,
  author_name  text,
  created_at   timestamptz not null default now()
);

create index approval_feedback_approval_idx on public.approval_feedback (approval_id, created_at);

create or replace function public.trg_log_approvals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.projects where id = new.project_id;
  if tg_op = 'INSERT' then
    perform public.log_activity('approval.created', 'נשלחה בקשת אישור: ' || new.title, v_client, new.project_id, 'approval', new.id,
      jsonb_build_object('kind', new.kind));
  elsif new.status is distinct from old.status and new.status = 'cancelled' then
    perform public.log_activity('approval.cancelled', 'בקשת האישור "' || new.title || '" בוטלה', v_client, new.project_id, 'approval', new.id, '{}');
  end if;
  return null;
end;
$$;

create trigger project_approvals_activity after insert or update of status on public.project_approvals
  for each row execute function public.trg_log_approvals();

-- The client answers an approval through the presentation link. Called only
-- by the server (service role) after it validated the token format; the token
-- is checked again here so an approval can only be answered from its project.
create or replace function public.respond_to_approval(
  p_token text,
  p_approval_id uuid,
  p_decision text,
  p_comment text default null,
  p_author text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.projects;
  a public.project_approvals;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_author text := nullif(trim(coalesce(p_author, '')), '');
  v_task uuid;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  select * into p from public.projects where portal_token = p_token;
  if not found then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  select * into a from public.project_approvals where id = p_approval_id and project_id = p.id for update;
  if not found then
    raise exception 'Approval not found' using errcode = 'P0002', hint = 'invalid';
  end if;
  if a.status <> 'pending' then
    raise exception 'Approval already answered' using errcode = 'P0001', hint = 'closed';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if p_decision = 'changes_requested' and v_comment is null then
    raise exception 'A comment is required' using errcode = '22023', hint = 'comment_required';
  end if;

  insert into public.approval_feedback (approval_id, decision, comment, author_name)
  values (a.id, p_decision, left(v_comment, 5000), left(v_author, 120));

  if p_decision = 'changes_requested' and a.create_task_on_changes then
    insert into public.tasks (title, description, project_id, priority, status)
    values (left('שינויים מהלקוח: ' || a.title, 300), v_comment, p.id, 'high', 'todo')
    returning id into v_task;
  end if;

  update public.project_approvals
     set status = p_decision, responded_at = now(), change_task_id = coalesce(v_task, change_task_id)
   where id = a.id;

  perform public.log_activity(
    'approval.' || p_decision,
    case when p_decision = 'approved' then 'הלקוח אישר: ' || a.title
         else 'הלקוח ביקש שינויים ב"' || a.title || '"' end,
    p.client_id, p.id, 'approval', a.id,
    jsonb_build_object('comment', v_comment, 'author', v_author, 'task_id', v_task));

  return jsonb_build_object('status', p_decision, 'task_id', v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- AI development handoff
-- ---------------------------------------------------------------------------
create table public.project_ai_handoffs (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  options      jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  mega_prompt  text not null,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index project_ai_handoffs_project_idx on public.project_ai_handoffs (project_id, created_at desc);

create table public.project_ai_handoff_files (
  id          uuid primary key default gen_random_uuid(),
  handoff_id  uuid not null references public.project_ai_handoffs (id) on delete cascade,
  name        text not null check (name ~ '^[A-Za-z0-9_.-]{1,80}$'),
  content     text not null,
  position    integer not null default 0,
  unique (handoff_id, name)
);

create or replace function public.trg_log_ai_handoffs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.projects where id = new.project_id;
  perform public.log_activity('project.ai_handoff', 'הוכנה חבילת פיתוח ל-Claude Code / Codex', v_client, new.project_id, 'ai_handoff', new.id, '{}');
  return null;
end;
$$;

create trigger project_ai_handoffs_activity after insert on public.project_ai_handoffs
  for each row execute function public.trg_log_ai_handoffs();

-- ---------------------------------------------------------------------------
-- Portfolio (reuses project data; ready to be consumed by the studio site
-- later — no external integration is built here).
-- ---------------------------------------------------------------------------
create table public.portfolio_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects (id) on delete set null,
  client_id     uuid references public.clients (id) on delete set null,
  title         text not null check (length(trim(title)) > 0),
  category      text,
  summary       text,
  work_done     text,
  technologies  text[] not null default '{}',
  site_url      text,
  status        text not null default 'draft' check (status in ('draft', 'published')),
  position      double precision not null default extract(epoch from clock_timestamp()),
  published_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index portfolio_items_project_uniq on public.portfolio_items (project_id) where project_id is not null;
create index portfolio_items_order_idx on public.portfolio_items (position);

create or replace function public.portfolio_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger portfolio_items_before_write before insert or update on public.portfolio_items
  for each row execute function public.portfolio_items_before_write();

create trigger portfolio_items_updated_at before update on public.portfolio_items
  for each row execute function public.set_updated_at();

create or replace function public.trg_log_portfolio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is not null then
    perform public.log_activity('portfolio.added', 'הפרויקט נוסף לתיק העבודות', new.client_id, new.project_id, 'portfolio_item', new.id, '{}');
  end if;
  return null;
end;
$$;

create trigger portfolio_items_activity after insert on public.portfolio_items
  for each row execute function public.trg_log_portfolio();

create table public.portfolio_media (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.portfolio_items (id) on delete cascade,
  file_id     uuid not null references public.files (id) on delete cascade,
  kind        text not null default 'other' check (kind in ('cover', 'desktop', 'mobile', 'before', 'after', 'other')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (item_id, file_id)
);

create unique index portfolio_media_one_cover on public.portfolio_media (item_id) where kind = 'cover';
create index portfolio_media_item_idx on public.portfolio_media (item_id, kind, position);

-- ---------------------------------------------------------------------------
-- Automation: questionnaire received → next action "review the questionnaire"
-- (only when no next action was set; auto-created projects already have one).
-- Same function as before plus that one update.
-- ---------------------------------------------------------------------------
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
      update public.projects set next_action = 'לעבור על האפיון'
        where id = new.project_id and coalesce(trim(next_action), '') = '';
    elsif new.status = 'cancelled' then
      perform public.log_activity('questionnaire.cancelled', 'השאלון "' || new.title || '" בוטל', new.client_id, new.project_id, 'form_submission', new.id, '{}');
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Security: same model as every other table — active staff only, anon gets
-- nothing. The client presentation is served by the server with the service
-- role after validating the project token.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'task_checklist_items', 'project_links', 'project_references', 'project_approvals', 'approval_feedback',
    'project_ai_handoffs', 'project_ai_handoff_files', 'portfolio_items', 'portfolio_media'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "staff_all_%1$s" on public.%1$I for all to authenticated
         using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Feedback is written only by respond_to_approval (the client's answer).
revoke insert, update, delete on public.approval_feedback from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.log_activity(text, text, uuid, uuid, text, uuid, jsonb) from authenticated;
revoke execute on function public.finalize_questionnaire(uuid, jsonb, jsonb) from authenticated;
revoke execute on function public.respond_to_approval(text, uuid, text, text, text) from authenticated;
