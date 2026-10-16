-- ===========================================================================
-- Operating system (2026-10-16) — additive only.
--   * calendar_events      meetings, calls, business events (the calendar's own items)
--   * project_milestones   the project timeline (Gantt): phases with dates, status,
--                          owner, dependency; tasks can belong to a milestone
--   * payment_schedule     expected payments (amount + date) per project; a row is
--                          "paid" once it points at a real payment. Money received
--                          is still only ever read from `payments`.
--   * tasks.due_time, tasks.milestone_id, leads.next_action
--   * activity: project deadline changes, milestone status, events, schedule
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Calendar events
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(trim(title)) > 0),
  kind             text not null default 'meeting' check (kind in (
                     'meeting', 'task', 'deadline', 'payment', 'delivery', 'call', 'follow_up', 'business', 'other')),
  starts_on        date not null,
  ends_on          date,
  all_day          boolean not null default false,
  start_time       time,
  end_time         time,
  assigned_to      uuid references public.profiles (id) on delete set null,
  client_id        uuid references public.clients (id) on delete cascade,
  project_id       uuid references public.projects (id) on delete cascade,
  description      text,
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes between 0 and 20160),
  reminded_at      timestamptz,
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint calendar_events_dates check (ends_on is null or ends_on >= starts_on),
  constraint calendar_events_times check (
    all_day or start_time is null or end_time is null or coalesce(ends_on, starts_on) > starts_on or end_time > start_time)
);

create index calendar_events_range_idx on public.calendar_events (starts_on, ends_on);
create index calendar_events_project_idx on public.calendar_events (project_id) where project_id is not null;
create index calendar_events_client_idx on public.calendar_events (client_id) where client_id is not null;

create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

-- An event on a project belongs to that project's client.
create or replace function public.calendar_events_sync_client()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null then
    select client_id into new.client_id from public.projects where id = new.project_id;
  end if;
  if new.all_day then
    new.start_time := null;
    new.end_time := null;
  end if;
  return new;
end;
$$;

create trigger calendar_events_sync_client before insert or update on public.calendar_events
  for each row execute function public.calendar_events_sync_client();

-- ---------------------------------------------------------------------------
-- Project milestones (timeline)
-- ---------------------------------------------------------------------------
create table public.project_milestones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  -- The default phases; null = a custom milestone.
  phase        text check (phase is null or phase in ('spec', 'design', 'development', 'testing', 'fixes', 'delivery')),
  start_date   date,
  end_date     date,
  status       text not null default 'not_started' check (status in ('not_started', 'in_progress', 'waiting_client', 'done')),
  assigned_to  uuid references public.profiles (id) on delete set null,
  depends_on   uuid references public.project_milestones (id) on delete set null,
  notes        text,
  position     integer not null default 0,
  completed_at timestamptz,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint project_milestones_dates check (start_date is null or end_date is null or end_date >= start_date),
  constraint project_milestones_not_self check (depends_on is null or depends_on <> id)
);

create index project_milestones_project_idx on public.project_milestones (project_id, position);
create index project_milestones_end_idx on public.project_milestones (end_date) where status <> 'done';

create trigger project_milestones_updated_at before update on public.project_milestones
  for each row execute function public.set_updated_at();

create or replace function public.project_milestones_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.depends_on is not null and not exists (
    select 1 from public.project_milestones where id = new.depends_on and project_id = new.project_id
  ) then
    raise exception 'milestone dependency must be in the same project' using errcode = '23514';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger project_milestones_before_write before insert or update on public.project_milestones
  for each row execute function public.project_milestones_before_write();

-- Tasks: optional time of day + the milestone they belong to.
alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists milestone_id uuid references public.project_milestones (id) on delete set null;
create index if not exists tasks_milestone_idx on public.tasks (milestone_id) where milestone_id is not null;

-- Leads: the next concrete step (dated by the existing follow_up_date).
alter table public.leads add column if not exists next_action text;

-- ---------------------------------------------------------------------------
-- Payment schedule (expected payments)
-- ---------------------------------------------------------------------------
create table public.payment_schedule (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  amount      numeric(12, 2) not null check (amount > 0),
  due_date    date,
  payment_id  uuid references public.payments (id) on delete set null,
  position    integer not null default 0,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index payment_schedule_project_idx on public.payment_schedule (project_id, position);
create index payment_schedule_due_idx on public.payment_schedule (due_date) where payment_id is null;

create trigger payment_schedule_updated_at before update on public.payment_schedule
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity
-- ---------------------------------------------------------------------------
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
    if new.deadline is distinct from old.deadline then
      perform public.log_activity('project.deadline_changed',
        case when new.deadline is null then 'יעד המסירה של "' || new.name || '" הוסר'
             else 'יעד המסירה של "' || new.name || '" נקבע ל-' || to_char(new.deadline, 'DD/MM/YYYY') end,
        new.client_id, new.id, 'project', new.id,
        jsonb_build_object('from', old.deadline, 'to', new.deadline));
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_activity('project.deleted', 'הפרויקט "' || old.name || '" נמחק', old.client_id, null, 'project', old.id, '{}');
  end if;
  return null;
end;
$$;

create or replace function public.trg_log_milestones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_label text;
begin
  select client_id into v_client from public.projects where id = new.project_id;
  if v_client is null then
    return null;
  end if;
  if new.status is distinct from old.status then
    v_label := case new.status
      when 'not_started' then 'לא התחיל' when 'in_progress' then 'בתהליך'
      when 'waiting_client' then 'ממתין ללקוח' when 'done' then 'הושלם' else new.status end;
    perform public.log_activity(
      case when new.status = 'done' then 'milestone.completed' else 'milestone.status_changed' end,
      'שלב "' || new.title || '": ' || v_label,
      v_client, new.project_id, 'milestone', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.end_date is distinct from old.end_date and new.end_date is not null then
    perform public.log_activity('milestone.date_changed',
      'תאריך היעד של השלב "' || new.title || '" נקבע ל-' || to_char(new.end_date, 'DD/MM/YYYY'),
      v_client, new.project_id, 'milestone', new.id, jsonb_build_object('from', old.end_date, 'to', new.end_date));
  end if;
  return null;
end;
$$;

create trigger project_milestones_activity after update on public.project_milestones
  for each row execute function public.trg_log_milestones();

create or replace function public.trg_log_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is not null then
    perform public.log_activity('event.created',
      'נקבע ביומן: ' || new.title || ' (' || to_char(new.starts_on, 'DD/MM/YYYY') ||
        coalesce(' ' || to_char(new.start_time, 'HH24:MI'), '') || ')',
      new.client_id, new.project_id, 'event', new.id, jsonb_build_object('kind', new.kind, 'starts_on', new.starts_on));
  end if;
  return null;
end;
$$;

create trigger calendar_events_activity after insert on public.calendar_events
  for each row execute function public.trg_log_events();

-- ---------------------------------------------------------------------------
-- Security — staff-wide like tasks and payments.
-- ---------------------------------------------------------------------------
alter table public.calendar_events enable row level security;
create policy "staff_all_calendar_events" on public.calendar_events for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
revoke all on public.calendar_events from anon;

alter table public.project_milestones enable row level security;
create policy "staff_all_project_milestones" on public.project_milestones for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
revoke all on public.project_milestones from anon;

alter table public.payment_schedule enable row level security;
create policy "staff_all_payment_schedule" on public.payment_schedule for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
revoke all on public.payment_schedule from anon;

-- Trigger functions only; nothing new is callable from the API.
revoke execute on function public.calendar_events_sync_client() from public, anon;
revoke execute on function public.project_milestones_before_write() from public, anon;
revoke execute on function public.trg_log_milestones() from public, anon;
revoke execute on function public.trg_log_events() from public, anon;
