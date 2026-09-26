-- ============================================================================
-- Studio CRM — core schema
-- One workspace (the studio). Staff members are rows in public.profiles that
-- are active. Everything else is protected by RLS in a later migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'admin', 'member');

create type public.lead_status as enum (
  'new', 'contacted', 'qualified', 'proposal_sent', 'converted', 'lost'
);

create type public.lead_source as enum (
  'website', 'referral', 'instagram', 'facebook', 'google', 'whatsapp', 'returning_client', 'other'
);

create type public.project_type as enum (
  'business_site', 'landing_page', 'ecommerce', 'web_app', 'other'
);

create type public.client_status as enum ('active', 'on_hold', 'completed', 'archived');

-- Order matters: it is the order of the Kanban columns.
create type public.project_status as enum (
  'lead',
  'questionnaire_sent',
  'questionnaire_received',
  'awaiting_deposit',
  'design',
  'development',
  'testing',
  'awaiting_approval',
  'awaiting_final_payment',
  'completed'
);

create type public.submission_status as enum ('created', 'sent', 'in_progress', 'completed', 'cancelled');

create type public.question_type as enum (
  'short_text', 'long_text', 'email', 'phone', 'yes_no', 'single_select', 'multi_select',
  'number', 'url', 'date', 'color', 'image_upload', 'file_upload', 'reference_links'
);

create type public.payment_method as enum ('bank_transfer', 'bit', 'cash', 'credit_card', 'other');
create type public.payment_kind as enum ('deposit', 'installment', 'final', 'other');

create type public.file_category as enum (
  'branding', 'images', 'contracts', 'questionnaire', 'invoices', 'client_materials', 'deliverables', 'other'
);

create type public.contract_status as enum ('draft', 'sent', 'signed', 'cancelled');

create type public.task_status as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (staff). 1:1 with auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.staff_role not null default 'member',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Staff check used by every RLS policy.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'owner'
  );
$$;

-- New auth user -> profile. The very first user becomes the active owner;
-- anyone after that is created inactive and must be activated by the owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('profiles_first_user'));
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when is_first then 'owner'::public.staff_role else 'member'::public.staff_role end,
    is_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Workspace settings (single row)
-- ---------------------------------------------------------------------------
create table public.workspace_settings (
  id              boolean primary key default true check (id),
  business_name   text not null default 'הסטודיו שלי',
  contact_email   text,
  contact_phone   text,
  form_intro      text not null default 'תודה שבחרתם לעבוד איתנו. השאלון עוזר לנו להבין את העסק שלכם ולבנות אתר שמתאים בדיוק לכם. אפשר לעצור בכל שלב — התשובות נשמרות אוטומטית.',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into public.workspace_settings (id) values (true);

create trigger workspace_settings_updated_at before update on public.workspace_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  business_name   text,
  phone           text,
  phone_digits    text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  email           text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website         text,
  status          public.client_status not null default 'active',
  source          public.lead_source,
  notes           text,
  archived_at     timestamptz,
  is_demo         boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index clients_status_idx on public.clients (status);
create index clients_created_at_idx on public.clients (created_at desc);
create index clients_email_idx on public.clients (lower(email));
create index clients_phone_digits_idx on public.clients (phone_digits);

create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(trim(name)) > 0),
  business_name         text,
  phone                 text,
  phone_digits          text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source                public.lead_source not null default 'other',
  project_type          public.project_type,
  estimated_value       numeric(12, 2) check (estimated_value is null or estimated_value >= 0),
  status                public.lead_status not null default 'new',
  notes                 text,
  follow_up_date        date,
  converted_client_id   uuid references public.clients (id) on delete set null,
  converted_project_id  uuid,
  converted_at          timestamptz,
  is_demo               boolean not null default false,
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index leads_status_idx on public.leads (status);
create index leads_follow_up_idx on public.leads (follow_up_date) where status not in ('converted', 'lost');
create index leads_created_at_idx on public.leads (created_at desc);

create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- Money: total_price and deposit_amount are the *agreement*. What was paid is
-- always derived from public.payments (see view project_financials).
-- ---------------------------------------------------------------------------
create table public.projects (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references public.clients (id) on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  project_type       public.project_type not null default 'business_site',
  description        text,
  total_price        numeric(12, 2) not null default 0 check (total_price >= 0),
  deposit_amount     numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  status             public.project_status not null default 'lead',
  status_changed_at  timestamptz not null default now(),
  board_position     double precision not null default extract(epoch from now()),
  start_date         date,
  deadline           date,
  next_action        text,
  notes              text,
  completed_at       timestamptz,
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint projects_deposit_le_total check (deposit_amount <= total_price or total_price = 0),
  constraint projects_dates_order check (deadline is null or start_date is null or deadline >= start_date)
);

create index projects_client_idx on public.projects (client_id);
create index projects_status_idx on public.projects (status, board_position);
create index projects_deadline_idx on public.projects (deadline) where status <> 'completed';

alter table public.leads
  add constraint leads_converted_project_fk
  foreign key (converted_project_id) references public.projects (id) on delete set null;

create or replace function public.projects_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger projects_before_write before insert or update on public.projects
  for each row execute function public.projects_before_write();

create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- Keeps client_id on child rows consistent with their project.
create or replace function public.sync_client_from_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null then
    select p.client_id into new.client_id from public.projects p where p.id = new.project_id;
    if new.client_id is null then
      raise exception 'Project % not found', new.project_id using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments (tracking only — no processing)
-- ---------------------------------------------------------------------------
create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  amount             numeric(12, 2) not null check (amount > 0),
  paid_at            date not null default current_date,
  method             public.payment_method not null default 'bank_transfer',
  kind               public.payment_kind not null default 'installment',
  reference          text,
  note               text,
  -- Extension point for a future payment processor.
  external_provider  text,
  external_id        text,
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (external_provider, external_id)
);

create index payments_project_idx on public.payments (project_id, paid_at desc);
create index payments_paid_at_idx on public.payments (paid_at);

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Questionnaire templates (form builder)
-- ---------------------------------------------------------------------------
create table public.form_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  description   text,
  project_type  public.project_type,
  is_archived   boolean not null default false,
  is_demo       boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger form_templates_updated_at before update on public.form_templates
  for each row execute function public.set_updated_at();

create table public.form_sections (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.form_templates (id) on delete cascade,
  title        text not null default '',
  description  text,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index form_sections_template_idx on public.form_sections (template_id, position);

create trigger form_sections_updated_at before update on public.form_sections
  for each row execute function public.set_updated_at();

-- condition: null or {"question_id": uuid, "operator": "equals"|"not_equals"|"includes"|"not_includes"|"answered"|"not_answered", "value": text}
-- options:   [{"value": text, "label": text}]
-- maps_to:   which client field this answer can fill when a questionnaire
--            creates a client ("client.name", "client.business_name", ...).
create table public.form_questions (
  id           uuid primary key default gen_random_uuid(),
  section_id   uuid not null references public.form_sections (id) on delete cascade,
  type         public.question_type not null default 'short_text',
  label        text not null default '',
  description  text,
  placeholder  text,
  required     boolean not null default false,
  options      jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  condition    jsonb check (condition is null or (jsonb_typeof(condition) = 'object' and condition ? 'question_id' and condition ? 'operator')),
  maps_to      text check (maps_to is null or maps_to in ('client.name', 'client.business_name', 'client.email', 'client.phone', 'client.website')),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index form_questions_section_idx on public.form_questions (section_id, position);

create trigger form_questions_updated_at before update on public.form_questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Questionnaire requests / submissions
-- A row is created when the studio generates a link. It carries a frozen
-- snapshot of the template so later template edits never alter what the
-- client saw or answered.
-- ---------------------------------------------------------------------------
create table public.form_submissions (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique check (length(token) >= 32),
  template_id     uuid references public.form_templates (id) on delete set null,
  client_id       uuid references public.clients (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete cascade,
  title           text not null,
  form_snapshot   jsonb not null,
  status          public.submission_status not null default 'created',
  draft_answers   jsonb not null default '{}'::jsonb,
  draft_step      integer not null default 0,
  internal_notes  text,
  sent_at         timestamptz,
  opened_at       timestamptz,
  started_at      timestamptz,
  last_saved_at   timestamptz,
  completed_at    timestamptz,
  expires_at      timestamptz,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index form_submissions_client_idx on public.form_submissions (client_id, created_at desc);
create index form_submissions_project_idx on public.form_submissions (project_id);
create index form_submissions_status_idx on public.form_submissions (status);

create trigger form_submissions_sync_client before insert or update of project_id on public.form_submissions
  for each row execute function public.sync_client_from_project();

create trigger form_submissions_updated_at before update on public.form_submissions
  for each row execute function public.set_updated_at();

-- Final, immutable answers. Only internal_note may change after insert.
create table public.form_answers (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null references public.form_submissions (id) on delete cascade,
  question_id      uuid not null,
  section_title    text not null default '',
  section_position integer not null default 0,
  question_label   text not null,
  question_type    public.question_type not null,
  position         integer not null default 0,
  value            jsonb,
  internal_note    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (submission_id, question_id)
);

create index form_answers_submission_idx on public.form_answers (submission_id, section_position, position);

create or replace function public.form_answers_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.value is distinct from old.value
     or new.question_id is distinct from old.question_id
     or new.question_label is distinct from old.question_label
     or new.submission_id is distinct from old.submission_id then
    raise exception 'Submitted answers are read-only';
  end if;
  return new;
end;
$$;

create trigger form_answers_immutable before update on public.form_answers
  for each row execute function public.form_answers_immutable();

create trigger form_answers_updated_at before update on public.form_answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Files (metadata for objects in the private "crm-files" bucket)
-- ---------------------------------------------------------------------------
create table public.files (
  id             uuid primary key default gen_random_uuid(),
  bucket         text not null default 'crm-files',
  storage_path   text not null unique,
  original_name  text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes >= 0),
  category       public.file_category not null default 'other',
  client_id      uuid references public.clients (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete cascade,
  submission_id  uuid references public.form_submissions (id) on delete cascade,
  question_id    uuid,
  uploaded_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  source         text not null default 'staff' check (source in ('staff', 'questionnaire')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index files_client_idx on public.files (client_id, created_at desc);
create index files_project_idx on public.files (project_id);
create index files_submission_idx on public.files (submission_id);
create index files_category_idx on public.files (category);

create trigger files_sync_client before insert or update of project_id on public.files
  for each row execute function public.sync_client_from_project();

create trigger files_updated_at before update on public.files
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contracts
-- ---------------------------------------------------------------------------
create table public.contracts (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients (id) on delete cascade,
  project_id             uuid references public.projects (id) on delete set null,
  title                  text not null check (length(trim(title)) > 0),
  status                 public.contract_status not null default 'draft',
  contract_date          date,
  signed_at              date,
  file_id                uuid references public.files (id) on delete set null,
  notes                  text,
  -- Extension points for templates / digital signature.
  template_id            uuid,
  signature_provider     text,
  signature_request_id   text,
  created_by             uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index contracts_client_idx on public.contracts (client_id, created_at desc);
create index contracts_project_idx on public.contracts (project_id);

create or replace function public.contracts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'signed' then
    new.signed_at := coalesce(new.signed_at, current_date);
  elsif tg_op = 'UPDATE' and old.status = 'signed' then
    new.signed_at := null;
  end if;
  return new;
end;
$$;

create trigger contracts_sync_client before insert or update of project_id on public.contracts
  for each row execute function public.sync_client_from_project();

create trigger contracts_before_write before insert or update on public.contracts
  for each row execute function public.contracts_before_write();

create trigger contracts_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  description   text,
  client_id     uuid references public.clients (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  due_date      date,
  priority      public.task_priority not null default 'medium',
  status        public.task_status not null default 'todo',
  completed_at  timestamptz,
  position      double precision not null default extract(epoch from now()),
  assigned_to   uuid references public.profiles (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tasks_project_idx on public.tasks (project_id, status);
create index tasks_client_idx on public.tasks (client_id, status);
create index tasks_open_due_idx on public.tasks (due_date) where status <> 'done';

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_client before insert or update of project_id on public.tasks
  for each row execute function public.sync_client_from_project();

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Internal notes (never exposed publicly)
-- ---------------------------------------------------------------------------
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  is_pinned   boolean not null default false,
  author_id   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index notes_client_idx on public.notes (client_id, is_pinned desc, created_at desc);

create trigger notes_sync_client before insert or update of project_id on public.notes
  for each row execute function public.sync_client_from_project();

create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Activity log (append-only)
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  description  text not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  client_id    uuid references public.clients (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete set null,
  entity_type  text,
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index activity_logs_created_idx on public.activity_logs (created_at desc);
create index activity_logs_client_idx on public.activity_logs (client_id, created_at desc);
create index activity_logs_project_idx on public.activity_logs (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Derived financials — the single source of truth for paid / remaining.
-- ---------------------------------------------------------------------------
create view public.project_financials
with (security_invoker = true)
as
select
  p.id                                                         as project_id,
  p.client_id,
  p.total_price,
  p.deposit_amount,
  coalesce(sum(pay.amount), 0)::numeric(12, 2)                 as amount_paid,
  (p.total_price - coalesce(sum(pay.amount), 0))::numeric(12, 2) as balance_due,
  coalesce(sum(pay.amount), 0) >= p.deposit_amount             as deposit_covered,
  max(pay.paid_at)                                             as last_payment_at
from public.projects p
left join public.payments pay on pay.project_id = p.id
group by p.id;

create view public.client_financials
with (security_invoker = true)
as
select
  c.id                                                   as client_id,
  coalesce(sum(f.total_price), 0)::numeric(12, 2)        as total_price,
  coalesce(sum(f.amount_paid), 0)::numeric(12, 2)        as amount_paid,
  coalesce(sum(f.balance_due), 0)::numeric(12, 2)        as balance_due,
  count(f.project_id)::int                               as project_count
from public.clients c
left join public.project_financials f on f.client_id = c.id
group by c.id;
