-- ============================================================================
-- V4 — running the business. Additive only: nothing existing is dropped or
-- renamed; every new column is nullable or has a safe default.
--
--  * Clients: legal/billing identity (ח.פ, address, business type), a second
--    contact and the commitment (monthly retainer, commitment end).
--  * Questionnaires: more client fields can be mapped; submitting fills the
--    client's EMPTY fields and keeps differing values as suggestions.
--  * Team roles: custom roles with permissions (owner-managed).
--  * In-app notifications (the bell), written by the server.
--  * Business expenses (one-off / monthly / yearly).
--  * Strategy (single page) + goals measured from real data.
--  * Partner agreement between the partners, signed in-app by each of them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Clients: identity, billing, second contact, commitment
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists company_id        text,
  add column if not exists business_type     text check (business_type is null or business_type in ('licensed', 'exempt', 'company', 'nonprofit', 'other')),
  add column if not exists address           text,
  add column if not exists city              text,
  add column if not exists industry          text,
  add column if not exists contact_role      text,
  add column if not exists alt_contact_name  text,
  add column if not exists alt_contact_phone text,
  add column if not exists alt_contact_email text,
  add column if not exists retainer_amount   numeric(12, 2) check (retainer_amount is null or retainer_amount >= 0),
  add column if not exists retainer_start    date,
  add column if not exists commitment_end    date,
  add column if not exists commitment_notes  text;

-- ---------------------------------------------------------------------------
-- Questionnaires: which client fields an answer may fill
-- ---------------------------------------------------------------------------
alter table public.form_questions drop constraint if exists form_questions_maps_to_check;
alter table public.form_questions add constraint form_questions_maps_to_check check (
  maps_to is null or maps_to in (
    'client.name', 'client.business_name', 'client.email', 'client.phone', 'client.website',
    'client.company_id', 'client.address', 'client.city', 'client.industry', 'client.contact_role',
    'client.alt_contact_name', 'client.alt_contact_phone', 'client.alt_contact_email'
  )
);

-- Values from the questionnaire that differ from what the client file already
-- has: {field: value}. Shown in the client file with "update" / "ignore".
alter table public.form_submissions
  add column if not exists client_suggestions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(client_suggestions) = 'object');

-- Same contract as before, plus:
--  * a new client gets every mapped field;
--  * an existing client gets only the fields that are EMPTY in the file —
--    nothing typed by the team is ever overwritten; differing values are kept
--    in client_suggestions for a person to decide.
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
  c public.clients;
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
  v_alt_email text := nullif(trim(p_client ->> 'alt_contact_email'), '');
  v_suggest jsonb := '{}'::jsonb;
  v_filled text[] := '{}';
  f text;
  v_new text;
  v_old text;
  v_fields text[] := array['name', 'business_name', 'phone', 'email', 'website', 'company_id', 'address', 'city', 'industry',
                           'contact_role', 'alt_contact_name', 'alt_contact_phone', 'alt_contact_email'];
begin
  select * into s from public.form_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if s.status in ('completed', 'cancelled') then
    raise exception 'Submission is closed' using errcode = 'P0001', hint = 'closed';
  end if;

  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_email := null;
  end if;
  if v_alt_email is not null and v_alt_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_alt_email := null;
  end if;

  v_client_id := s.client_id;
  v_project_id := s.project_id;

  if v_client_id is null then
    select c2.id into v_client_id
    from public.clients c2
    where (v_email is not null and lower(c2.email) = lower(v_email))
       or (v_phone_digits is not null and length(v_phone_digits) >= 7 and c2.phone_digits = v_phone_digits)
    order by c2.created_at
    limit 1;

    if v_client_id is null then
      insert into public.clients (name, business_name, phone, email, website, source, company_id, address, city, industry,
                                  contact_role, alt_contact_name, alt_contact_phone, alt_contact_email)
      values (
        coalesce(nullif(trim(p_client ->> 'name'), ''), nullif(trim(p_client ->> 'business_name'), ''), 'לקוח מהשאלון'),
        nullif(trim(p_client ->> 'business_name'), ''),
        v_phone,
        v_email,
        nullif(trim(p_client ->> 'website'), ''),
        'website',
        nullif(trim(p_client ->> 'company_id'), ''),
        nullif(trim(p_client ->> 'address'), ''),
        nullif(trim(p_client ->> 'city'), ''),
        nullif(trim(p_client ->> 'industry'), ''),
        nullif(trim(p_client ->> 'contact_role'), ''),
        nullif(trim(p_client ->> 'alt_contact_name'), ''),
        nullif(trim(p_client ->> 'alt_contact_phone'), ''),
        v_alt_email
      )
      returning id into v_client_id;
      v_created_client := true;
    end if;
  end if;

  -- Existing client: fill only what's missing; remember what differs.
  if not v_created_client then
    select * into c from public.clients where id = v_client_id;
    foreach f in array v_fields loop
      v_new := nullif(trim(p_client ->> f), '');
      if f = 'email' then v_new := v_email; end if;
      if f = 'alt_contact_email' then v_new := v_alt_email; end if;
      continue when v_new is null;
      v_old := nullif(trim(to_jsonb(c) ->> f), '');
      if v_old is null then
        v_filled := v_filled || f;
      elsif lower(v_old) <> lower(v_new)
            and not (f in ('phone', 'alt_contact_phone') and regexp_replace(v_old, '\D', '', 'g') = regexp_replace(v_new, '\D', '', 'g')) then
        v_suggest := v_suggest || jsonb_build_object(f, v_new);
      end if;
    end loop;

    if array_length(v_filled, 1) > 0 then
      update public.clients set
        name              = case when 'name' = any (v_filled) then nullif(trim(p_client ->> 'name'), '') else name end,
        business_name     = case when 'business_name' = any (v_filled) then nullif(trim(p_client ->> 'business_name'), '') else business_name end,
        phone             = case when 'phone' = any (v_filled) then v_phone else phone end,
        email             = case when 'email' = any (v_filled) then v_email else email end,
        website           = case when 'website' = any (v_filled) then nullif(trim(p_client ->> 'website'), '') else website end,
        company_id        = case when 'company_id' = any (v_filled) then nullif(trim(p_client ->> 'company_id'), '') else company_id end,
        address           = case when 'address' = any (v_filled) then nullif(trim(p_client ->> 'address'), '') else address end,
        city              = case when 'city' = any (v_filled) then nullif(trim(p_client ->> 'city'), '') else city end,
        industry          = case when 'industry' = any (v_filled) then nullif(trim(p_client ->> 'industry'), '') else industry end,
        contact_role      = case when 'contact_role' = any (v_filled) then nullif(trim(p_client ->> 'contact_role'), '') else contact_role end,
        alt_contact_name  = case when 'alt_contact_name' = any (v_filled) then nullif(trim(p_client ->> 'alt_contact_name'), '') else alt_contact_name end,
        alt_contact_phone = case when 'alt_contact_phone' = any (v_filled) then nullif(trim(p_client ->> 'alt_contact_phone'), '') else alt_contact_phone end,
        alt_contact_email = case when 'alt_contact_email' = any (v_filled) then v_alt_email else alt_contact_email end
      where id = v_client_id;
    end if;
  end if;

  if v_project_id is null then
    select coalesce(t.project_type, 'business_site') into v_type
    from public.form_templates t where t.id = s.template_id;
    v_type := coalesce(v_type, 'business_site');
    select coalesce(c3.business_name, c3.name) into v_client_label from public.clients c3 where c3.id = v_client_id;

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

  select coalesce(array_agg(distinct (fl ->> 'file_id')::uuid), '{}')
    into v_file_ids
  from jsonb_array_elements(p_answers) a
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(a -> 'value') = 'array' and (a ->> 'question_type') in ('image_upload', 'file_upload')
         then a -> 'value' else '[]'::jsonb end
  ) fl;

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
         draft_answers = '{}'::jsonb,
         client_suggestions = v_suggest
   where id = p_submission_id;

  if v_created_client then
    perform public.log_activity('client.created_from_questionnaire', 'הלקוח נוצר אוטומטית מתוך השאלון', v_client_id, v_project_id,
      'form_submission', p_submission_id, '{}');
  end if;
  if coalesce(array_length(v_filled, 1), 0) > 0 then
    perform public.log_activity('client.filled_from_questionnaire', 'פרטים חסרים בתיק הלקוח הושלמו מתוך השאלון', v_client_id, v_project_id,
      'form_submission', p_submission_id, jsonb_build_object('fields', to_jsonb(v_filled)));
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
    'filled_fields', to_jsonb(v_filled), 'suggestions', v_suggest,
    'orphan_paths', to_jsonb(v_orphans)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Team roles (custom, owner-managed) + permissions
-- ---------------------------------------------------------------------------
create table public.team_roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (length(trim(name)) > 0),
  description  text,
  color        text not null default '#3346c4' check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- Areas this role may open (see PERMISSIONS in src/lib/domain/permissions.ts).
  permissions  text[] not null default '{}',
  position     double precision not null default extract(epoch from now()),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger team_roles_updated_at before update on public.team_roles
  for each row execute function public.set_updated_at();

alter table public.profiles
  add column if not exists team_role_id uuid references public.team_roles (id) on delete set null;

grant update (team_role_id) on public.profiles to authenticated;

-- Only the owner assigns roles (the owner's own access never depends on one).
create or replace function public.profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.team_role_id is distinct from old.team_role_id and not public.is_owner() then
    raise exception 'Only the owner can assign roles' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_role_guard before update of team_role_id on public.profiles
  for each row execute function public.profiles_role_guard();

-- Owner: everything. No role: everything (so nobody is locked out by the
-- upgrade). With a role: only the listed areas.
create or replace function public.has_permission(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles pr
    left join public.team_roles r on r.id = pr.team_role_id
    where pr.id = (select auth.uid())
      and pr.is_active
      and (pr.role = 'owner' or pr.team_role_id is null or p_area = any (r.permissions))
  );
$$;

-- ---------------------------------------------------------------------------
-- In-app notifications (the bell). The server writes; each person reads,
-- marks read and clears their own.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null default '',
  url         text,
  actor_id    uuid references public.profiles (id) on delete set null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Business expenses
-- ---------------------------------------------------------------------------
create table public.business_expenses (
  id              uuid primary key default gen_random_uuid(),
  spent_on        date not null default current_date,
  amount          numeric(12, 2) not null check (amount > 0),
  vat_included    boolean not null default true,
  category        text not null default 'other' check (category in (
                    'software', 'hosting', 'marketing', 'equipment', 'freelancers', 'office',
                    'education', 'travel', 'taxes', 'accounting', 'other')),
  vendor          text,
  description     text not null check (length(trim(description)) > 0),
  payment_method  public.payment_method,
  -- A monthly/yearly expense counts from spent_on until ended_on (or forever).
  recurring       text not null default 'none' check (recurring in ('none', 'monthly', 'yearly')),
  ended_on        date,
  paid_by         uuid references public.profiles (id) on delete set null,
  project_id      uuid references public.projects (id) on delete set null,
  file_id         uuid references public.files (id) on delete set null,
  notes           text,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint business_expenses_end_after_start check (ended_on is null or ended_on >= spent_on)
);

create index business_expenses_spent_idx on public.business_expenses (spent_on desc);

create trigger business_expenses_updated_at before update on public.business_expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Strategy: one page for the business + goals measured from real data
-- ---------------------------------------------------------------------------
create table public.business_strategy (
  id               boolean primary key default true check (id),
  vision           text,
  target_audience  text,
  offering         text,
  pricing          text,
  channels         text,
  strengths        text,
  weaknesses       text,
  opportunities    text,
  threats          text,
  focus            text,
  monthly_revenue_target numeric(12, 2) check (monthly_revenue_target is null or monthly_revenue_target >= 0),
  updated_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at       timestamptz not null default now()
);

insert into public.business_strategy (id) values (true) on conflict do nothing;

create trigger business_strategy_updated_at before update on public.business_strategy
  for each row execute function public.set_updated_at();

create table public.business_goals (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  metric        text not null default 'custom' check (metric in ('revenue', 'new_clients', 'projects_completed', 'proposals_accepted', 'custom')),
  target        numeric(14, 2) not null check (target > 0),
  manual_value  numeric(14, 2) not null default 0,
  period_start  date not null,
  period_end    date not null,
  owner_id      uuid references public.profiles (id) on delete set null,
  status        text not null default 'active' check (status in ('active', 'achieved', 'dropped')),
  notes         text,
  position      double precision not null default extract(epoch from now()),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint business_goals_period check (period_end >= period_start)
);

create trigger business_goals_updated_at before update on public.business_goals
  for each row execute function public.set_updated_at();

-- Current value of a goal, measured from the real tables (manual for "custom").
create or replace function public.goal_actual(p_goal uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select case g.metric
    when 'revenue' then (select coalesce(sum(p.amount), 0) from public.payments p where p.paid_at between g.period_start and g.period_end)
    when 'new_clients' then (select count(*)::numeric from public.clients c where c.created_at::date between g.period_start and g.period_end and not c.is_demo)
    when 'projects_completed' then (select count(*)::numeric from public.projects pr where pr.completed_at::date between g.period_start and g.period_end)
    when 'proposals_accepted' then (select count(*)::numeric from public.proposals o where o.status = 'accepted' and o.responded_at::date between g.period_start and g.period_end)
    else g.manual_value
  end
  from public.business_goals g
  where g.id = p_goal;
$$;

-- ---------------------------------------------------------------------------
-- Partner agreement (between the partners). Content is JSON; editing after a
-- signature starts a new version and needs everyone to sign again. Signatures
-- are written only by sign_partner_agreement().
-- ---------------------------------------------------------------------------
create table public.partner_agreements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  content     jsonb not null check (jsonb_typeof(content) = 'object'),
  version     integer not null default 1,
  status      text not null default 'draft' check (status in ('draft', 'signing', 'signed')),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger partner_agreements_updated_at before update on public.partner_agreements
  for each row execute function public.set_updated_at();

create or replace function public.partner_agreements_versioning()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content or new.title is distinct from old.title then
    if exists (select 1 from public.partner_agreement_signatures s where s.agreement_id = old.id and s.version = old.version) then
      new.version := old.version + 1;
    end if;
    new.status := 'draft';
  end if;
  return new;
end;
$$;

create table public.partner_agreement_signatures (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references public.partner_agreements (id) on delete cascade,
  version       integer not null,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  signer_name   text not null check (length(trim(signer_name)) > 1),
  id_number     text,
  signature     text not null check (signature like 'data:image/png;base64,%' and length(signature) < 600000),
  content_hash  text not null,
  signed_at     timestamptz not null default now(),
  unique (agreement_id, version, user_id)
);

create trigger partner_agreements_versioning before update on public.partner_agreements
  for each row execute function public.partner_agreements_versioning();

create or replace function public.sign_partner_agreement(
  p_id uuid,
  p_version integer,
  p_name text,
  p_id_number text,
  p_signature text,
  p_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.partner_agreements;
  v_uid uuid := auth.uid();
  v_needed integer;
  v_signed integer;
begin
  if v_uid is null or not public.is_staff() or not public.has_permission('partners') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into a from public.partner_agreements where id = p_id for update;
  if not found then
    raise exception 'Agreement not found' using errcode = 'P0002';
  end if;
  if a.version <> p_version then
    raise exception 'The agreement changed — reload and read it again' using errcode = 'P0001', hint = 'stale';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(a.content -> 'partners', '[]'::jsonb)) x where x ->> 'user_id' = v_uid::text
  ) then
    raise exception 'You are not a party to this agreement' using errcode = '42501';
  end if;

  insert into public.partner_agreement_signatures (agreement_id, version, user_id, signer_name, id_number, signature, content_hash)
  values (p_id, p_version, v_uid, trim(p_name), nullif(trim(p_id_number), ''), p_signature, p_hash)
  on conflict (agreement_id, version, user_id) do nothing;

  select jsonb_array_length(coalesce(a.content -> 'partners', '[]'::jsonb)) into v_needed;
  select count(*) into v_signed from public.partner_agreement_signatures s where s.agreement_id = p_id and s.version = p_version;

  -- Status only (no content change → no new version).
  update public.partner_agreements
     set status = case when v_signed >= v_needed then 'signed' else 'signing' end
   where id = p_id;

  return jsonb_build_object('signed', v_signed, 'needed', v_needed);
end;
$$;

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
alter table public.team_roles enable row level security;
create policy "staff_read_team_roles" on public.team_roles for select to authenticated using ((select public.is_staff()));
create policy "owner_write_team_roles" on public.team_roles for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
revoke all on public.team_roles from anon;

alter table public.notifications enable row level security;
create policy "own_notifications_read" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_staff()));
create policy "own_notifications_update" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own_notifications_delete" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.business_expenses enable row level security;
create policy "finance_all_business_expenses" on public.business_expenses for all to authenticated
  using ((select public.is_staff()) and (select public.has_permission('finances')))
  with check ((select public.is_staff()) and (select public.has_permission('finances')));
revoke all on public.business_expenses from anon;

alter table public.business_strategy enable row level security;
create policy "strategy_read" on public.business_strategy for select to authenticated
  using ((select public.is_staff()) and (select public.has_permission('strategy')));
create policy "strategy_update" on public.business_strategy for update to authenticated
  using ((select public.is_staff()) and (select public.has_permission('strategy')))
  with check ((select public.is_staff()) and (select public.has_permission('strategy')));
revoke all on public.business_strategy from anon;
revoke insert, delete on public.business_strategy from authenticated;

alter table public.business_goals enable row level security;
create policy "strategy_all_business_goals" on public.business_goals for all to authenticated
  using ((select public.is_staff()) and (select public.has_permission('strategy')))
  with check ((select public.is_staff()) and (select public.has_permission('strategy')));
revoke all on public.business_goals from anon;

alter table public.partner_agreements enable row level security;
create policy "partners_all_partner_agreements" on public.partner_agreements for all to authenticated
  using ((select public.is_staff()) and (select public.has_permission('partners')))
  with check ((select public.is_staff()) and (select public.has_permission('partners')));
revoke all on public.partner_agreements from anon;

alter table public.partner_agreement_signatures enable row level security;
create policy "partners_read_signatures" on public.partner_agreement_signatures for select to authenticated
  using ((select public.is_staff()) and (select public.has_permission('partners')));
revoke all on public.partner_agreement_signatures from anon;
revoke insert, update, delete on public.partner_agreement_signatures from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.log_activity(text, text, uuid, uuid, text, uuid, jsonb) from authenticated;
revoke execute on function public.finalize_questionnaire(uuid, jsonb, jsonb) from authenticated;
revoke execute on function public.respond_to_approval(text, uuid, text, text, text) from authenticated;
revoke execute on function public.respond_to_proposal(text, text, text, text) from authenticated;
revoke execute on function public.mark_proposal_viewed(text) from authenticated;
revoke execute on function public.sign_contract(text, integer, text, text, text, text, text, text, text) from authenticated;
revoke execute on function public.open_auto_task(text, text, text, uuid, uuid, public.task_priority, uuid) from authenticated;
