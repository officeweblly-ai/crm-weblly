-- ============================================================================
-- Push notifications (installed app on iPhone / Android / desktop).
--  * push_subscriptions: one row per device that allowed notifications.
--  * profiles.notify_prefs: which events each staff member wants.
--  * app_private: server-only key/value store (VAPID keys, last daily digest).
-- Additive only.
-- ============================================================================

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique check (endpoint ~ '^https://'),
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- Staff can see and remove their own devices; writes go through the server.
create policy "own_push_subscriptions_read" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_staff()));
create policy "own_push_subscriptions_delete" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
revoke insert, update on public.push_subscriptions from authenticated;

-- {"task_assigned": bool, "questionnaire_submitted": bool, "approval_response": bool, "daily_digest": bool}
-- Missing key = enabled.
alter table public.profiles
  add column if not exists notify_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(notify_prefs) = 'object');
grant update (notify_prefs) on public.profiles to authenticated;

create table public.app_private (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- No policies: only the service role (server) can read or write it.
alter table public.app_private enable row level security;
revoke all on public.app_private from anon, authenticated;
