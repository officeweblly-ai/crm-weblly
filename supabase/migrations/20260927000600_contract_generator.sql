-- ============================================================================
-- Contract generator: branded agreements built from client + project data.
-- ============================================================================

-- Studio legal details printed at the top of every agreement.
alter table public.workspace_settings
  add column if not exists legal_name text,
  add column if not exists business_id text,       -- ח.פ / ע.מ
  add column if not exists address text,
  add column if not exists signatory_name text;

-- A generated agreement keeps its full content (party details, scope, clauses)
-- frozen as JSON, so later edits to the client or project never change it.
alter table public.contracts
  add column if not exists contract_number text unique,
  add column if not exists content jsonb check (content is null or jsonb_typeof(content) = 'object');

create index if not exists contracts_number_idx on public.contracts (contract_number);
