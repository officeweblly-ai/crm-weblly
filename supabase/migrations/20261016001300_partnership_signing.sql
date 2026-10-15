-- ===========================================================================
-- Partnership agreement — signing by secure link (additive on V4)
--
--  * partner_agreements gets a secure link (`sign_token`) and a type (`kind`).
--    Status: draft (no signature on the current version) → partial → signed.
--  * partner_agreement_versions: a frozen copy of every version the moment
--    someone signs it. The text of a frozen version can never change; only the
--    reference to the final signed PDF is filled in later.
--  * partner_agreement_signatures: signatures belong to a party key (e.g.
--    'yanai' / 'noya') and to one exact version. A signature is replaced only
--    explicitly (`p_replace`), and the old one stays in the table with
--    `replaced_at` — signed data is never silently modified.
--  * Signing goes through sign_partner_agreement_link() — service role only,
--    called by the server after it re-checked the token.
--  * Editing the text after any signature on the current version opens the next
--    version (existing trigger, now also aware of frozen versions); the signed
--    version and its signatures are preserved.
-- ===========================================================================

alter table public.partner_agreements
  add column if not exists kind text not null default 'partnership' check (kind in ('partnership')),
  add column if not exists sign_token text unique check (sign_token is null or length(sign_token) >= 32);

alter table public.partner_agreements drop constraint if exists partner_agreements_status_check;
update public.partner_agreements set status = 'partial' where status = 'signing';
alter table public.partner_agreements
  add constraint partner_agreements_status_check check (status in ('draft', 'partial', 'signed'));

-- ---------------------------------------------------------------------------
-- Frozen versions
-- ---------------------------------------------------------------------------
create table public.partner_agreement_versions (
  agreement_id    uuid not null references public.partner_agreements (id) on delete restrict,
  version         integer not null check (version >= 1),
  title           text not null,
  content         jsonb not null check (jsonb_typeof(content) = 'object'),
  content_hash    text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  frozen_at       timestamptz not null default now(),
  completed_at    timestamptz,
  signed_pdf_path text,
  primary key (agreement_id, version)
);

create or replace function public.partner_agreement_versions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'A signed agreement version cannot be deleted' using errcode = '42501';
  end if;
  if new.title is distinct from old.title or new.content is distinct from old.content
     or new.content_hash is distinct from old.content_hash or new.version is distinct from old.version
     or new.agreement_id is distinct from old.agreement_id or new.frozen_at is distinct from old.frozen_at then
    raise exception 'A signed agreement version is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger partner_agreement_versions_guard before update or delete on public.partner_agreement_versions
  for each row execute function public.partner_agreement_versions_guard();

-- ---------------------------------------------------------------------------
-- Signatures: by party key, replaceable with history, light audit trail
-- ---------------------------------------------------------------------------
alter table public.partner_agreement_signatures
  alter column user_id drop not null,
  add column if not exists party_key   text check (party_key is null or party_key ~ '^[a-z][a-z0-9_]{0,30}$'),
  add column if not exists typed_name  text check (typed_name is null or length(typed_name) <= 120),
  add column if not exists ip          text,
  add column if not exists user_agent  text,
  add column if not exists replaced_at timestamptz;

alter table public.partner_agreement_signatures drop constraint if exists partner_agreement_signatures_agreement_id_version_user_id_key;
alter table public.partner_agreement_signatures
  add constraint partner_agreement_signatures_who check (party_key is not null or user_id is not null);

-- One active signature per party per version (replaced ones are kept).
create unique index partner_agreement_signatures_active_party
  on public.partner_agreement_signatures (agreement_id, version, party_key)
  where replaced_at is null and party_key is not null;
create unique index partner_agreement_signatures_active_user
  on public.partner_agreement_signatures (agreement_id, version, user_id)
  where replaced_at is null and party_key is null;

-- The old in-app signing path is superseded by the link flow.
drop function if exists public.sign_partner_agreement(uuid, integer, text, text, text, text);

-- ---------------------------------------------------------------------------
-- Versioning: a version that was frozen (someone signed it) is never edited.
-- ---------------------------------------------------------------------------
create or replace function public.partner_agreements_versioning()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content or new.title is distinct from old.title then
    if exists (select 1 from public.partner_agreement_versions v where v.agreement_id = old.id and v.version = old.version)
       or exists (select 1 from public.partner_agreement_signatures s where s.agreement_id = old.id and s.version = old.version) then
      new.version := old.version + 1;
    end if;
    new.status := 'draft';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sign (or explicitly replace a signature) through the secure link.
-- The server passes the exact title/content it hashed; they must still equal
-- the live row under lock, so nobody signs text that changed meanwhile.
-- ---------------------------------------------------------------------------
create or replace function public.sign_partner_agreement_link(
  p_token      text,
  p_party      text,
  p_version    integer,
  p_title      text,
  p_content    jsonb,
  p_hash       text,
  p_signature  text,
  p_typed_name text default null,
  p_ip         text default null,
  p_user_agent text default null,
  p_replace    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.partner_agreements;
  v public.partner_agreement_versions;
  v_party jsonb;
  v_existing uuid;
  v_needed integer;
  v_signed integer;
  v_complete boolean;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  select * into a from public.partner_agreements where sign_token = p_token for update;
  if not found then
    raise exception 'Invalid link' using errcode = 'P0002', hint = 'invalid';
  end if;
  if p_version is distinct from a.version or p_title is distinct from a.title or p_content is distinct from a.content then
    raise exception 'The agreement changed' using errcode = 'P0001', hint = 'stale';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad hash' using errcode = 'P0001', hint = 'stale';
  end if;

  select x into v_party from jsonb_array_elements(coalesce(a.content -> 'parties', '[]'::jsonb)) x where x ->> 'key' = p_party;
  if v_party is null then
    raise exception 'Not a party to this agreement' using errcode = '42501', hint = 'party';
  end if;

  -- Freeze this version on its first signature.
  insert into public.partner_agreement_versions (agreement_id, version, title, content, content_hash)
  values (a.id, a.version, a.title, a.content, p_hash)
  on conflict (agreement_id, version) do nothing;
  select * into v from public.partner_agreement_versions where agreement_id = a.id and version = a.version;
  if v.content_hash <> p_hash then
    raise exception 'The agreement changed' using errcode = 'P0001', hint = 'stale';
  end if;

  select id into v_existing from public.partner_agreement_signatures
   where agreement_id = a.id and version = a.version and party_key = p_party and replaced_at is null;
  if v_existing is not null then
    if not coalesce(p_replace, false) then
      raise exception 'Already signed' using errcode = 'P0001', hint = 'already_signed';
    end if;
    update public.partner_agreement_signatures set replaced_at = now() where id = v_existing;
  end if;

  insert into public.partner_agreement_signatures
    (agreement_id, version, party_key, signer_name, typed_name, signature, content_hash, ip, user_agent)
  values
    (a.id, a.version, p_party, v_party ->> 'name', nullif(trim(coalesce(p_typed_name, '')), ''), p_signature, p_hash,
     nullif(p_ip, ''), left(nullif(p_user_agent, ''), 300));

  select jsonb_array_length(coalesce(a.content -> 'parties', '[]'::jsonb)) into v_needed;
  select count(*) into v_signed from public.partner_agreement_signatures s
   where s.agreement_id = a.id and s.version = a.version and s.replaced_at is null and s.party_key is not null;
  v_complete := v_signed >= v_needed;

  -- A replaced signature invalidates the stored final PDF; it is produced again.
  update public.partner_agreement_versions
     set completed_at = case when v_complete then now() else null end,
         signed_pdf_path = null
   where agreement_id = a.id and version = a.version;

  -- Status only (no content change → no new version).
  update public.partner_agreements
     set status = case when v_complete then 'signed' when v_signed > 0 then 'partial' else 'draft' end
   where id = a.id;

  return jsonb_build_object('agreement_id', a.id, 'version', a.version, 'signed', v_signed, 'needed', v_needed,
                            'complete', v_complete, 'replaced', v_existing is not null);
end;
$$;

-- An agreement with signatures is part of the record and cannot be deleted.
create or replace function public.partner_agreements_no_delete_signed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.partner_agreement_signatures s where s.agreement_id = old.id) then
    raise exception 'A signed agreement cannot be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger partner_agreements_no_delete_signed before delete on public.partner_agreements
  for each row execute function public.partner_agreements_no_delete_signed();

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------
alter table public.partner_agreement_versions enable row level security;
create policy "partners_read_versions" on public.partner_agreement_versions for select to authenticated
  using ((select public.is_staff()) and (select public.has_permission('partners')));
revoke all on public.partner_agreement_versions from anon;
revoke insert, update, delete on public.partner_agreement_versions from authenticated;

revoke execute on function public.sign_partner_agreement_link(text, text, integer, text, jsonb, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.sign_partner_agreement_link(text, text, integer, text, jsonb, text, text, text, text, text, boolean) to service_role;
