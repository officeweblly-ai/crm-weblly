-- ============================================================================
-- V3 — daily workflow layer. Additive only: nothing existing is dropped,
-- renamed or rewritten; every new column is nullable or has a safe default
-- for the rows that already exist.
--
--  * Team: partner profile fields, working days, morning time.
--  * Responsibilities (flexible, never hard-coded names) + responsible_for().
--  * Tasks: secondary owner, category, idempotent automation key.
--  * Projects: owner.
--  * Client relationship: interactions, follow-ups, derived history view,
--    alert snooze/dismiss state.
--  * Proposals (+ items) with a secure client link.
--  * Contracts: versions (immutable), digital signatures, secure sign link.
--  * Links / references / approvals / portfolio: extra kinds and fields.
--  * Social: "ready to post as a Reel" section, caption, posted date.
--  * Notification log (one morning summary per person per day).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared list of work areas (responsibilities and task categories use it).
-- ---------------------------------------------------------------------------
create or replace function public.work_category_label(c text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case c
    when 'development' then 'פיתוח'
    when 'design' then 'עיצוב'
    when 'client_communication' then 'תקשורת עם לקוחות'
    when 'sales' then 'מכירות ולידים'
    when 'proposals' then 'הצעות מחיר'
    when 'contracts' then 'חוזים'
    when 'finance' then 'גבייה וכספים'
    when 'project_management' then 'ניהול פרויקטים'
    when 'social' then 'סושיאל'
    when 'content' then 'תוכן וחומרים'
    when 'deployment' then 'העלאה לאוויר'
    when 'domains' then 'דומיינים ו-DNS'
    when 'maintenance' then 'תחזוקה'
    else 'אחר'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Team: partner profile
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists job_title text,
  add column if not exists phone text,
  add column if not exists avatar_color text check (avatar_color is null or avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  -- 0 = Sunday … 6 = Saturday (Israeli week: Sun–Thu by default).
  add column if not exists working_days smallint[] not null default '{0,1,2,3,4}'
    check (working_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  add column if not exists work_start time,
  add column if not exists work_end time,
  add column if not exists morning_time time not null default '08:30';

grant update (job_title, phone, avatar_color, working_days, work_start, work_end, morning_time) on public.profiles to authenticated;

create table public.team_responsibilities (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(trim(title)) > 0),
  description  text,
  category     text not null default 'other' check (category in (
                 'development', 'design', 'client_communication', 'sales', 'proposals', 'contracts', 'finance',
                 'project_management', 'social', 'content', 'deployment', 'domains', 'maintenance', 'other')),
  assigned_to  uuid references public.profiles (id) on delete set null,
  is_active    boolean not null default true,
  position     double precision not null default extract(epoch from clock_timestamp()),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index team_responsibilities_category_idx on public.team_responsibilities (category, position) where is_active;

create trigger team_responsibilities_updated_at before update on public.team_responsibilities
  for each row execute function public.set_updated_at();

-- Who owns a kind of work. Used by automations; the UI always allows override.
create or replace function public.responsible_for(p_category text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.assigned_to
  from public.team_responsibilities r
  join public.profiles p on p.id = r.assigned_to and p.is_active
  where r.is_active and r.category = p_category
  order by r.position
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Tasks: ownership
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists secondary_assigned_to uuid references public.profiles (id) on delete set null,
  add column if not exists category text check (category is null or category in (
    'development', 'design', 'client_communication', 'sales', 'proposals', 'contracts', 'finance',
    'project_management', 'social', 'content', 'deployment', 'domains', 'maintenance', 'other')),
  -- Tasks opened by an automation carry a key so the same event never opens two.
  add column if not exists auto_key text unique;

alter table public.tasks
  add constraint tasks_secondary_differs check (secondary_assigned_to is null or assigned_to is null or secondary_assigned_to <> assigned_to);

create index if not exists tasks_secondary_idx on public.tasks (secondary_assigned_to) where status <> 'done';

create or replace function public.task_status_label(s public.task_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s::text
    when 'todo' then 'לא התחיל'
    when 'in_progress' then 'בטיפול'
    when 'waiting_client' then 'ממתין ללקוח'
    when 'waiting_team' then 'ממתין לצוות'
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
    elsif new.status::text in ('waiting_client', 'waiting_team', 'blocked') then
      perform public.log_activity('task.status_changed',
        'המשימה "' || new.title || '" סומנה: ' || public.task_status_label(new.status),
        new.client_id, new.project_id, 'task', new.id, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  end if;
  return null;
end;
$$;

-- An automation-created task. Never duplicates (auto_key), never throws.
create or replace function public.open_auto_task(
  p_key text,
  p_title text,
  p_category text,
  p_project_id uuid,
  p_client_id uuid,
  p_priority public.task_priority default 'high',
  p_assignee uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.tasks (title, category, project_id, client_id, priority, status, due_date, assigned_to, auto_key)
  values (
    left(p_title, 300), p_category, p_project_id, case when p_project_id is null then p_client_id end, p_priority, 'todo',
    (now() at time zone 'Asia/Jerusalem')::date,
    coalesce(p_assignee, public.responsible_for(p_category)),
    p_key
  )
  on conflict (auto_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Projects: owner
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists owner_id uuid references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Client relationship
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists last_interaction_at timestamptz,
  add column if not exists next_follow_up_date date,
  add column if not exists services text;

create table public.client_interactions (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete set null,
  kind            text not null default 'phone' check (kind in ('phone', 'whatsapp', 'meeting', 'email', 'proposal', 'follow_up', 'internal_note', 'other')),
  occurred_at     timestamptz not null default now(),
  user_id         uuid references public.profiles (id) on delete set null default auth.uid(),
  summary         text not null check (length(trim(summary)) > 0),
  result          text,
  next_action     text,
  follow_up_date  date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index client_interactions_client_idx on public.client_interactions (client_id, occurred_at desc);

create trigger client_interactions_updated_at before update on public.client_interactions
  for each row execute function public.set_updated_at();

create table public.follow_ups (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete set null,
  assigned_to     uuid references public.profiles (id) on delete set null,
  due_date        date not null,
  reason          text not null check (length(trim(reason)) > 0),
  note            text,
  status          text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  done_at         timestamptz,
  interaction_id  uuid references public.client_interactions (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index follow_ups_open_idx on public.follow_ups (due_date) where status = 'open';
create index follow_ups_client_idx on public.follow_ups (client_id, due_date);

create trigger follow_ups_updated_at before update on public.follow_ups
  for each row execute function public.set_updated_at();

create or replace function public.interaction_kind_label(k text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case k
    when 'phone' then 'שיחת טלפון'
    when 'whatsapp' then 'וואטסאפ'
    when 'meeting' then 'פגישה'
    when 'email' then 'מייל'
    when 'proposal' then 'הצעת מחיר'
    when 'follow_up' then 'מעקב'
    when 'internal_note' then 'הערה פנימית'
    else 'אחר'
  end;
$$;

-- Interaction → last interaction date, optional follow-up, timeline.
create or replace function public.trg_client_interactions_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'internal_note' then
    update public.clients
       set last_interaction_at = greatest(coalesce(last_interaction_at, new.occurred_at), new.occurred_at)
     where id = new.client_id;
  end if;
  if new.follow_up_date is not null then
    insert into public.follow_ups (client_id, project_id, assigned_to, due_date, reason, interaction_id, created_by)
    values (new.client_id, new.project_id, new.user_id, new.follow_up_date,
            coalesce(nullif(trim(new.next_action), ''), 'לחזור ללקוח'), new.id, new.user_id);
  end if;
  perform public.log_activity('interaction.added',
    public.interaction_kind_label(new.kind) || ': ' || left(new.summary, 200),
    new.client_id, new.project_id, 'client_interaction', new.id, jsonb_build_object('kind', new.kind));
  return null;
end;
$$;

create trigger client_interactions_after after insert on public.client_interactions
  for each row execute function public.trg_client_interactions_after();

-- Follow-ups keep clients.next_follow_up_date = the nearest open one.
create or replace function public.trg_follow_ups_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid := coalesce(new.client_id, old.client_id);
begin
  update public.clients c
     set next_follow_up_date = (select min(f.due_date) from public.follow_ups f where f.client_id = c.id and f.status = 'open')
   where c.id = v_client;
  if tg_op = 'INSERT' then
    perform public.log_activity('followup.created', 'נקבע מעקב ל-' || to_char(new.due_date, 'DD/MM/YYYY') || ': ' || left(new.reason, 200),
      new.client_id, new.project_id, 'follow_up', new.id, '{}');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'done' then
    perform public.log_activity('followup.done', 'בוצע מעקב: ' || left(new.reason, 200), new.client_id, new.project_id, 'follow_up', new.id, '{}');
  end if;
  return null;
end;
$$;

create or replace function public.follow_ups_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    new.done_at := coalesce(new.done_at, now());
  else
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger follow_ups_before_write before insert or update on public.follow_ups
  for each row execute function public.follow_ups_before_write();

create trigger follow_ups_after after insert or update or delete on public.follow_ups
  for each row execute function public.trg_follow_ups_after();

-- Derived relationship history. Money still comes only from payments.
create view public.client_relationship
with (security_invoker = true)
as
select
  c.id as client_id,
  pay.first_payment as first_purchase_date,
  pay.last_purchase as last_purchase_date,
  pay.last_payment as last_payment_date,
  coalesce(pay.total, 0)::numeric(12, 2) as total_revenue,
  coalesce(prj.n, 0)::int as project_count,
  coalesce(prj.active, 0)::int as active_project_count,
  greatest(c.created_at, c.last_interaction_at, act.last_at) as last_activity_at
from public.clients c
left join lateral (
  select min(first_paid) as first_payment, max(first_paid) as last_purchase, max(last_paid) as last_payment, sum(total) as total
  from (
    select min(p2.paid_at) as first_paid, max(p2.paid_at) as last_paid, sum(p2.amount) as total
    from public.payments p2
    join public.projects pr on pr.id = p2.project_id
    where pr.client_id = c.id
    group by pr.id
  ) per_project
) pay on true
left join lateral (
  select count(*) as n, count(*) filter (where pr.status not in ('lead', 'completed')) as active
  from public.projects pr where pr.client_id = c.id
) prj on true
left join lateral (
  select max(a.created_at) as last_at from public.activity_logs a where a.client_id = c.id
) act on true;

-- Shared snooze / dismiss state for computed alerts (e.g. "no contact for 90 days").
create table public.alert_states (
  key            text primary key check (length(key) between 3 and 200),
  snoozed_until  date,
  dismissed_at   timestamptz,
  updated_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Proposals
-- ---------------------------------------------------------------------------
create table public.proposals (
  id                    uuid primary key default gen_random_uuid(),
  number                text unique,
  client_id             uuid not null references public.clients (id) on delete cascade,
  project_id            uuid references public.projects (id) on delete set null,
  submission_id         uuid references public.form_submissions (id) on delete set null,
  title                 text not null check (length(trim(title)) > 0),
  project_type          public.project_type,
  intro                 text,
  scope                 text,
  price                 numeric(12, 2) not null default 0 check (price >= 0),
  deposit               numeric(12, 2) not null default 0 check (deposit >= 0),
  -- [{"label": text, "amount": number, "when": text}]
  milestones            jsonb not null default '[]'::jsonb check (jsonb_typeof(milestones) = 'array'),
  delivery_estimate     text,
  valid_until           date,
  notes                 text,
  internal_notes        text,
  status                text not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired')),
  public_token          text unique check (public_token is null or length(public_token) >= 32),
  sent_at               timestamptz,
  viewed_at             timestamptz,
  responded_at          timestamptz,
  response_name         text,
  response_note         text,
  converted_project_id  uuid references public.projects (id) on delete set null,
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint proposals_deposit_le_price check (deposit <= price or price = 0)
);

create index proposals_client_idx on public.proposals (client_id, created_at desc);
create index proposals_status_idx on public.proposals (status);

create table public.proposal_items (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references public.proposals (id) on delete cascade,
  kind         text not null default 'included' check (kind in ('included', 'excluded')),
  title        text not null check (length(trim(title)) > 0),
  description  text,
  amount       numeric(12, 2) check (amount is null or amount >= 0),
  position     double precision not null default extract(epoch from clock_timestamp())
);

create index proposal_items_proposal_idx on public.proposal_items (proposal_id, kind, position);

create or replace function public.proposals_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'sent' then new.sent_at := coalesce(new.sent_at, now()); end if;
    if new.status = 'viewed' then new.viewed_at := coalesce(new.viewed_at, now()); end if;
    if new.status in ('accepted', 'rejected') then new.responded_at := coalesce(new.responded_at, now()); end if;
    if new.status = 'draft' then new.responded_at := null; end if;
  end if;
  return new;
end;
$$;

create trigger proposals_before_write before insert or update on public.proposals
  for each row execute function public.proposals_before_write();

create trigger proposals_updated_at before update on public.proposals
  for each row execute function public.set_updated_at();

create or replace function public.trg_log_proposals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('proposal.created', 'נוצרה הצעת מחיר: ' || new.title, new.client_id, new.project_id, 'proposal', new.id,
      jsonb_build_object('from_questionnaire', new.submission_id is not null));
  elsif new.status is distinct from old.status then
    perform public.log_activity('proposal.' || new.status,
      case new.status
        when 'sent' then 'הצעת המחיר "' || new.title || '" נשלחה ללקוח'
        when 'viewed' then 'הלקוח פתח את הצעת המחיר "' || new.title || '"'
        when 'accepted' then 'הלקוח אישר את הצעת המחיר "' || new.title || '"'
        when 'rejected' then 'הלקוח דחה את הצעת המחיר "' || new.title || '"'
        when 'expired' then 'תוקף הצעת המחיר "' || new.title || '" פג'
        else 'הצעת המחיר "' || new.title || '" חזרה לטיוטה'
      end,
      new.client_id, new.project_id, 'proposal', new.id, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;

create trigger proposals_activity after insert or update of status on public.proposals
  for each row execute function public.trg_log_proposals();

-- The client opened the proposal link (service role, after token check).
create or replace function public.mark_proposal_viewed(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.proposals set status = 'viewed'
   where public_token = p_token and length(p_token) >= 32 and status = 'sent';
$$;

-- The client accepts / declines through the link. Accepting opens a
-- "prepare the contract" task for whoever owns contracts.
create or replace function public.respond_to_proposal(p_token text, p_decision text, p_name text default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.proposals;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_client text;
  v_task uuid;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  select * into pr from public.proposals where public_token = p_token for update;
  if not found then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  if pr.status not in ('sent', 'viewed') then
    raise exception 'Proposal already answered' using errcode = 'P0001', hint = 'closed';
  end if;
  -- Expiry is shown from valid_until; the raise would roll back any status write here.
  if pr.valid_until is not null and pr.valid_until < (now() at time zone 'Asia/Jerusalem')::date then
    raise exception 'Proposal expired' using errcode = 'P0001', hint = 'expired';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if p_decision = 'accepted' and v_name is null then
    raise exception 'A name is required' using errcode = '22023', hint = 'name_required';
  end if;

  update public.proposals
     set status = p_decision, response_name = left(v_name, 120), response_note = left(v_note, 3000)
   where id = pr.id;

  if p_decision = 'accepted' then
    select coalesce(c.business_name, c.name) into v_client from public.clients c where c.id = pr.client_id;
    v_task := public.open_auto_task('proposal_contract:' || pr.id, 'להכין חוזה — ' || coalesce(v_client, pr.title), 'contracts', pr.project_id, pr.client_id);
    if v_task is not null and public.responsible_for('contracts') is null then
      update public.tasks set assigned_to = public.responsible_for('sales') where id = v_task and assigned_to is null;
    end if;
  end if;
  return jsonb_build_object('status', p_decision, 'task_id', v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- Contracts: versions + digital signature
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column if not exists version integer not null default 1 check (version >= 1),
  add column if not exists sign_token text unique check (sign_token is null or length(sign_token) >= 32),
  add column if not exists sent_at timestamptz,
  add column if not exists signed_version integer,
  add column if not exists proposal_id uuid references public.proposals (id) on delete set null;

-- A frozen copy of every version that was sent to the client. Never updated.
create table public.contract_versions (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.contracts (id) on delete cascade,
  version       integer not null check (version >= 1),
  title         text not null,
  content       jsonb not null check (jsonb_typeof(content) = 'object'),
  content_hash  text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (contract_id, version)
);

create table public.contract_signatures (
  id                uuid primary key default gen_random_uuid(),
  contract_id       uuid not null references public.contracts (id) on delete cascade,
  version           integer not null,
  signer_name       text not null check (length(trim(signer_name)) > 0),
  signer_id_number  text,
  signer_email      text,
  signature_png     text not null check (signature_png like 'data:image/png;base64,%' and length(signature_png) < 400000),
  content_hash      text not null,
  ip                text,
  user_agent        text,
  signed_at         timestamptz not null default now()
);

create index contract_signatures_contract_idx on public.contract_signatures (contract_id, version);

-- Changing the text of a contract that was already sent/signed never touches
-- that copy: it becomes the next version, back in draft.
create or replace function public.contracts_versioning()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content
     and exists (select 1 from public.contract_versions v where v.contract_id = old.id and v.version = old.version) then
    new.version := old.version + 1;
    if new.status in ('sent', 'signed') then
      new.status := 'draft';
    end if;
    new.signed_at := null;
    new.sent_at := null;
  end if;
  return new;
end;
$$;

create trigger contracts_versioning before update on public.contracts
  for each row execute function public.contracts_versioning();

create or replace function public.sign_contract(
  p_token text,
  p_version integer,
  p_hash text,
  p_name text,
  p_id_number text,
  p_email text,
  p_signature text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contracts;
  v public.contract_versions;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_sig uuid;
  v_task uuid;
  v_deposit_ok boolean;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  select * into c from public.contracts where sign_token = p_token for update;
  if not found then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  if c.status = 'signed' then
    raise exception 'Already signed' using errcode = 'P0001', hint = 'closed';
  end if;
  if c.status <> 'sent' then
    raise exception 'Contract is not open for signing' using errcode = 'P0001', hint = 'not_ready';
  end if;
  if p_version is distinct from c.version then
    raise exception 'The contract changed' using errcode = 'P0001', hint = 'stale';
  end if;
  select * into v from public.contract_versions where contract_id = c.id and version = c.version;
  if not found or v.content_hash <> p_hash then
    raise exception 'The contract changed' using errcode = 'P0001', hint = 'stale';
  end if;
  if v_name is null then
    raise exception 'A name is required' using errcode = '22023', hint = 'name_required';
  end if;

  insert into public.contract_signatures (contract_id, version, signer_name, signer_id_number, signer_email, signature_png, content_hash, ip, user_agent)
  values (c.id, c.version, left(v_name, 120), left(nullif(trim(coalesce(p_id_number, '')), ''), 20), left(nullif(trim(coalesce(p_email, '')), ''), 200),
          p_signature, v.content_hash, left(p_ip, 100), left(p_user_agent, 300))
  returning id into v_sig;

  update public.contracts
     set status = 'signed', signed_at = (now() at time zone 'Asia/Jerusalem')::date, signed_version = c.version
   where id = c.id;

  perform public.log_activity('contract.signed_digitally',
    'ההסכם "' || c.title || '" נחתם דיגיטלית ע״י ' || v_name || ' (גרסה ' || c.version || ')',
    c.client_id, c.project_id, 'contract', c.id, jsonb_build_object('version', c.version, 'signature_id', v_sig));

  if c.project_id is not null then
    select f.deposit_covered into v_deposit_ok from public.project_financials f where f.project_id = c.project_id;
    if not coalesce(v_deposit_ok, true) then
      v_task := public.open_auto_task('contract_deposit:' || c.id, 'לוודא קבלת מקדמה — ' || c.title, 'finance', c.project_id, c.client_id);
    end if;
  end if;
  return jsonb_build_object('status', 'signed', 'version', c.version, 'signature_id', v_sig, 'task_id', v_task);
end;
$$;

-- ---------------------------------------------------------------------------
-- Links, references, approvals, portfolio, social
-- ---------------------------------------------------------------------------
alter table public.project_links drop constraint if exists project_links_kind_check;
alter table public.project_links add constraint project_links_kind_check check (kind in (
  'github', 'production', 'staging', 'vercel', 'supabase', 'figma', 'claude', 'claude_code', 'codex',
  'analytics', 'search_console', 'google_ads', 'domain', 'dns', 'custom'));

create or replace function public.trg_log_project_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  select client_id into v_client from public.projects where id = new.project_id;
  perform public.log_activity('project.link_added', 'נוסף קישור לפרויקט: ' || coalesce(nullif(new.label, ''), new.kind), v_client, new.project_id, 'project_link', new.id,
    jsonb_build_object('kind', new.kind));
  return null;
end;
$$;

create trigger project_links_activity after insert on public.project_links
  for each row execute function public.trg_log_project_links();

alter table public.project_references drop constraint if exists project_references_category_check;
alter table public.project_references add constraint project_references_category_check check (category in (
  'website', 'hero', 'animation', 'mobile', 'competitor', 'pinterest', 'dribbble', 'awwwards', 'video', 'general', 'other'));
alter table public.project_references add column if not exists thumbnail_url text;

alter table public.project_approvals drop constraint if exists project_approvals_kind_check;
alter table public.project_approvals add constraint project_approvals_kind_check check (kind in (
  'hero', 'design_desktop', 'design_mobile', 'page', 'feature', 'full_site', 'other'));

alter table public.portfolio_items
  add column if not exists client_display_name text,
  add column if not exists services text[] not null default '{}',
  add column if not exists is_featured boolean not null default false;

-- Social: a section for finished videos ready to post as a Reel.
alter table public.files drop constraint if exists files_album_section_check;
alter table public.files add constraint files_album_section_check check (
  album_section is null or album_section in ('process', 'before_after', 'final', 'behind_scenes', 'reels', 'other'));
alter table public.files
  add column if not exists caption text,
  add column if not exists posted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Approvals: change requests go to the project owner, else to whoever owns
-- development. Same function and contract as before plus the assignment.
-- ---------------------------------------------------------------------------
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
    insert into public.tasks (title, description, project_id, priority, status, category, assigned_to, due_date)
    values (left('שינויים מהלקוח: ' || a.title, 300), v_comment, p.id, 'high', 'todo', 'development',
            coalesce(p.owner_id, public.responsible_for('development')), (now() at time zone 'Asia/Jerusalem')::date)
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
-- Questionnaire received → a "review the questionnaire" task for whoever owns
-- proposals (else sales). Same function as before plus that one insert.
-- ---------------------------------------------------------------------------
create or replace function public.trg_form_submissions_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text;
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
      select coalesce(c.business_name, c.name) into v_client from public.clients c where c.id = new.client_id;
      perform public.open_auto_task('questionnaire_review:' || new.id, 'לעבור על האפיון של ' || coalesce(v_client, new.title) || ' ולהכין הצעת מחיר',
        'proposals', new.project_id, new.client_id, 'high', coalesce(public.responsible_for('proposals'), public.responsible_for('sales')));
    elsif new.status = 'cancelled' then
      perform public.log_activity('questionnaire.cancelled', 'השאלון "' || new.title || '" בוטל', new.client_id, new.project_id, 'form_submission', new.id, '{}');
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification log: one morning summary per person per Israeli day.
-- ---------------------------------------------------------------------------
create table public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  day         date not null,
  title       text not null default '',
  body        text not null default '',
  url         text,
  status      text not null default 'sent' check (status in ('pending', 'sent', 'failed', 'no_device', 'skipped')),
  devices     integer not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, day)
);

create index notification_log_user_idx on public.notification_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Security: staff-only like every other table; anon gets nothing.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['team_responsibilities', 'client_interactions', 'follow_ups', 'alert_states', 'proposals', 'proposal_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "staff_all_%1$s" on public.%1$I for all to authenticated
         using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Versions: staff read and add; nobody edits or deletes a sent copy.
alter table public.contract_versions enable row level security;
create policy "staff_read_contract_versions" on public.contract_versions for select to authenticated using ((select public.is_staff()));
create policy "staff_add_contract_versions" on public.contract_versions for insert to authenticated with check ((select public.is_staff()));
revoke all on public.contract_versions from anon;
revoke update, delete on public.contract_versions from authenticated;

-- Signatures: written only by sign_contract (the client's signature).
alter table public.contract_signatures enable row level security;
create policy "staff_read_contract_signatures" on public.contract_signatures for select to authenticated using ((select public.is_staff()));
revoke all on public.contract_signatures from anon;
revoke insert, update, delete on public.contract_signatures from authenticated;

-- Notification history: everyone sees their own; the server writes.
alter table public.notification_log enable row level security;
create policy "own_notification_log" on public.notification_log for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_staff()));
revoke all on public.notification_log from anon;
revoke insert, update, delete on public.notification_log from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.log_activity(text, text, uuid, uuid, text, uuid, jsonb) from authenticated;
revoke execute on function public.finalize_questionnaire(uuid, jsonb, jsonb) from authenticated;
revoke execute on function public.respond_to_approval(text, uuid, text, text, text) from authenticated;
revoke execute on function public.respond_to_proposal(text, text, text, text) from authenticated;
revoke execute on function public.mark_proposal_viewed(text) from authenticated;
revoke execute on function public.sign_contract(text, integer, text, text, text, text, text, text, text) from authenticated;
revoke execute on function public.open_auto_task(text, text, text, uuid, uuid, public.task_priority, uuid) from authenticated;
