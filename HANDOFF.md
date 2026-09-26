# HANDOFF — Studio CRM (weblly)

> Read this first if you are an AI agent (Codex, Claude, etc.) picking up this project.
> Also read `AGENTS.md` (Next.js 16 rules) and `README.md` (setup + architecture).

## 1. What this is

Internal CRM for **weblly**, a web-development studio (owner: Yanai Mizrahi + a partner).
Hebrew-first (RTL), used daily on desktop and phone. Lifecycle:
lead → client → project → questionnaire (אפיון) → files → deposit → design → dev → approval → final payment → maintenance.

**The owner does not read English.** Every UI string, error, toast and any message to the
owner must be in Hebrew. Code/identifiers stay English.

## 2. Stack & key decisions

- Next.js **16.3** App Router (Turbopack, Server Components, Server Actions). `middleware` is now `src/proxy.ts`.
  `params`/`searchParams`/`cookies()` are async. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- Supabase (Postgres + Auth + Storage), `@supabase/ssr`. Types: `src/lib/supabase/database.types.ts` is
  **generated** — run `npm run db:types` after any SQL change (uses PGlite, no Docker).
- Tailwind v4 with tokens in `src/app/globals.css` (`--paper`, `--ink`, `--accent #3346c4`, …).
  One font family: **IBM Plex Sans Hebrew** everywhere (owner asked for the sidebar font across the whole app);
  IBM Plex Mono only for LTR technical values (phones/emails/URLs). `font-display` = Plex too.
- Radix primitives (`radix-ui`), lucide icons, sonner toasts, dnd-kit (Kanban + form builder), zod.

## 3. Where things live

```
supabase/migrations/        SQL, applied in order (see §5)
supabase/tests/db.test.ts   PGlite test-suite (RLS, triggers, functions)  → npm run test:db
src/lib/domain/             labels/status model (labels.ts), questionnaire engine (forms.ts + tests)
src/lib/actions/            server actions: crm.ts, leads.ts, files.ts, questionnaires.ts, public-form.ts, social.ts, settings.ts, auth.ts
src/lib/data/               server-only queries (crm.ts, leads.ts, public.ts)
src/lib/questionnaire-snapshot.ts   template → frozen snapshot
src/components/ui/          design-system primitives (Button, Field, Modal, Confirm, Menu, StatusSelect, ListToolbar, …)
src/app/(app)/              staff area (auth-gated layout)
src/app/form/[token]        private questionnaire (per person)
src/app/q/[token]           general questionnaire link per template (creates a private copy)
scripts/                    migrate.ts, seed.ts, create-admin.ts, gen-db-types.ts
docs/                       owner guide (PDF), TikTok script
```

Patterns to follow:
- Every mutation = server action → `staffClient()` (auth + is_staff) → zod parse → Supabase (RLS) → `revalidatePath("/", "layout")` → `ActionResult` with a Hebrew message.
- Client forms use `useFormAction` (no reset on error, no double submit, field errors). Modals support controlled mode via `useOpenState`.
- Lists: desktop table + mobile cards (`TableShell` / `MobileList`), URL-driven filters via `ListToolbar`.
- Money is **derived** from `payments` via views `project_financials` / `client_financials`. Never store paid/balance.

## 4. Implemented features (all working against the live Supabase)

- Auth (email+password, first user = owner, others activated by owner; owner can add teammates in Settings).
- Dashboard with real metrics (`dashboard_metrics()` RPC), links to filtered lists.
- Leads CRUD + transactional convert-to-client (dedupe by email/phone).
- Clients: list (current/past/all, current project stage, questionnaire status), client file with tabs
  (overview, questionnaires, projects, finances, contracts, files, tasks, notes, activity), statuses incl. **maintenance** (תפעול אתר) and **completed** (סיים עבודה).
- Projects: list, **Kanban** (drag & drop → DB, optimistic with rollback), project page, lifecycle rail, next action, checklist.
- Questionnaires: builder (sections, 14 question types, reorder, duplicate, conditions, required, **max choices**, client-field mapping), preview,
  per-client links, **general link per template** (`/q/<token>`), autosave + local backup, uploads with progress,
  server-side validation, **submission auto-creates client (dedupe) + project** (`finalize_questionnaire`).
- Payments (tracking only), finances page, outstanding balances.
- Files: private bucket `crm-files` (50 MB, images/video/docs), categories incl. **references (רפרנסים)**, **site_texts (טקסטים לאתר)**, contracts; grouped by category.
- Contracts (upload + status + signed date). Notes. Activity timeline (DB triggers).
- **Social** (`/social`): albums per job with sections (process / before-after / final / behind the scenes), photos + video, status (collecting/editing/published).
- Settings: business details, profile, password change, team management, delete demo data.

## 5. Environment & database

`.env.local` (never commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`, `SUPABASE_DB_URL` (direct/pooler connection string, only for scripts).

Migrations are tracked in `internal.app_migrations`. Apply new ones with `npm run db:migrate`.
Applied so far on production: 0100 schema, 0200 logic, 0300 security, 0400 social_and_automation, 0500 duplicate_max_choices.
**Enum values added with `alter type … add value` cannot be used in the same migration file.**

Workflow for a DB change: write `supabase/migrations/<timestamp>_name.sql` → add a test in `supabase/tests/db.test.ts`
→ `npm run test:db` → `npm run db:migrate` → `npm run db:types` → `npx tsc --noEmit`.

## 6. Quality gates (run before every commit)

```bash
npm run lint && npx tsc --noEmit && npm run test:db && npm run test:unit && npx next build
```

## 7. State at handoff (2026-09-26)

- Live Supabase project is migrated and seeded with: 3 questionnaire templates from the owner's spec
  ("אתר תדמית — אפיון מלא", "חנות אונליין (E-commerce)", "מערכת / אפליקציית SaaS", each with a general link)
  and **demo data** (`is_demo = true`, badge "נתוני דמו"; delete via Settings → "מחיקת נתוני הדמו" or `npm run seed:reset`).
- The owner's own test template "אתר תדמית" (2 questions) and 1 real client exist — do not delete.
- Git: `main` on https://github.com/officeweblly-ai/crm-weblly (Vercel auto-deploys every push).
- Production: https://crm-weblly-ix33.vercel.app (Vercel project `crm-weblly-ix33`, env vars set).
- **Region:** the Supabase project is in **Tokyo (ap-northeast-1)** — measured ~316 ms per query from Israel.
  `vercel.json` pins functions to `hnd1` (Tokyo) so server↔DB latency is ~2 ms. If the DB is ever moved to
  Frankfurt (recommended for Israeli users), change `vercel.json` regions to `fra1`.
- Staff: yanimizrahi@gmail.com (owner), office.weblly@gmail.com (admin).
- `npm run set-password -- <email>` sets a password with hidden terminal input (never pass passwords in chat).
- Docs for the owner: `docs/מדריך-למערכת-weblly.pdf` (built from `docs/guide.html` + `docs/shots/`),
  `docs/תסריט-טיקטוק.pdf` (from `docs/tiktok-script.md`). Rebuild with headless Chrome `--print-to-pdf`.
- Testing note: the in-app preview browser freezes requestAnimationFrame when hidden, so React streaming
  boundaries never reveal there — that is an environment artifact, not an app bug.
- The third template in the owner's spec (SaaS) was truncated after question 8 in the source text; implemented Q1–8.

## 8. Ideas not built (ask the owner before building)

- Email/WhatsApp reminders (activity_logs is the natural trigger source).
- Contract templates + e-signature (`contracts.template_id`, `signature_provider` columns exist).
- Payment gateway (`payments.external_provider/external_id` exist).
- Zip download of a whole Social album.
- Realtime updates (currently pages refresh on navigation/action; data is shared instantly between teammates).
