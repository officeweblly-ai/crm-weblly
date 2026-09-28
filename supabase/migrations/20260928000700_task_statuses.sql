-- ============================================================================
-- V2 · Tasks 2.0 — two new working statuses.
-- Kept in its own file: enum values added here cannot be used in the same
-- transaction, and every migration file is applied in one transaction.
-- ============================================================================
alter type public.task_status add value if not exists 'waiting_client' after 'in_progress';
alter type public.task_status add value if not exists 'blocked' after 'waiting_client';
