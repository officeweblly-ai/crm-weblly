-- ============================================================================
-- V3 · new enum values. Kept in their own file: values added with
-- `alter type … add value` cannot be used in the same transaction.
-- ============================================================================

-- Tasks: "waiting for the team" next to "waiting for the client".
alter type public.task_status add value if not exists 'waiting_team' after 'waiting_client';

-- Client relationship lifecycle (existing values keep their meaning:
-- on_hold = waiting, completed = past client).
alter type public.client_status add value if not exists 'lead' before 'active';
alter type public.client_status add value if not exists 'new' before 'active';
alter type public.client_status add value if not exists 'returning' after 'maintenance';
alter type public.client_status add value if not exists 'inactive' after 'completed';
