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
- Contracts: upload a file, **or generate a branded agreement** (`/contracts/new?client=&project=`): editor + live
  preview, frozen JSON content (`contracts.content`, schema in `src/lib/domain/contracts.ts`), number `WB-YYYY-NNN`,
  print/Save-as-PDF via browser print (shell hidden with `print:hidden`), upload signed copy → status "signed".
  Studio legal details live in `workspace_settings` (legal_name, business_id, address, signatory_name).
- Brand: `src/components/brand/logo.tsx` (SVG recreation of the weblly logo; colors in `BRAND`). Used in sidebar,
  login, public questionnaires, contracts, favicon (`src/app/icon.svg`).
- Notes. Activity timeline (DB triggers).
- **Social** (`/social`): albums per job with sections (process / before-after / final / behind the scenes), photos + video, status (collecting/editing/published).
- Settings: business details, profile, password change, team management, delete demo data.

### V2 upgrade (2026-09-28) — additive, from `WEBLLY_V2_Upgrade_Spec.pdf`
- **Tasks 2.0:** statuses todo/in_progress/**waiting_client/blocked**/done, assignee (`tasks.assigned_to`), start date,
  blocking task (`blocked_by_task_id`), sub-tasks (`task_checklist_items`), links (`tasks.links` jsonb), internal notes,
  files attached to a task (`files.task_id`). Tasks page filters: project / assignee / status / priority / due.
  Task rows expand in place (checklist, links, files, notes). Form options (staff, sibling tasks) load via `taskFormOptions`.
- **Project page = Control Center:** the top card (`control-center.tsx`) shows stage, next action, active task, what
  we're waiting on from the client, deadline + task progress, money, and in-page shortcuts (#tasks, #links, …).
- **Links** (`project_links`, kinds incl. GitHub/Production/Staging/Vercel/Supabase/Figma/Claude/Codex/…) and
  **References** (`project_references`, category + "what I liked") — inside the project, not in the main nav.
- **AI Handoff** (`src/lib/ai-handoff.ts`): builds PROJECT_CONTEXT.md, CLIENT_BRIEF.md, BUILD_INSTRUCTIONS.md + Mega
  Prompt from real project data; saved in `project_ai_handoffs` / `project_ai_handoff_files`; copy + ZIP download
  (`src/lib/zip.ts`, no dependency). Never includes money/contracts; client contacts, temporary file links and internal
  notes only when chosen (`notes.share_with_ai`). No fake AI integration.
- **Client presentation** `/p/<token>` (`projects.portal_token`, same token model as questionnaires; create / regenerate /
  revoke). Shows only: name, client-friendly stage, `client_update`, `client_action`, files with `files.is_shared`,
  links with `client_visible` (only production/staging/figma/custom), approvals. Loaded with the service role through an
  explicit allowlist in `getPublicProject`.
- **Approvals** (`project_approvals`, `approval_feedback`): the client approves / requests changes via
  `respond_to_approval()` (service-role only, re-checks the token, logs to the timeline, optionally opens a task).
- **Portfolio** (`/portfolio`, `portfolio_items` + `portfolio_media`): "add to portfolio" pre-fills from the project;
  images are chosen from the project files (cover/desktop/mobile/before/after); draft/published; manual order.
- **Today** (`/today`): tasks due today/overdue, projects waiting on us, items waiting on the client, leads to call back,
  payments to chase. "Only mine" filter.
- **Small automations (never silent):** questionnaire received → next action "לעבור על האפיון" (only if empty, in SQL);
  deposit recorded → toast offering "move to design"; design approved → banner offering the dev checklist
  (`DEV_CHECKLIST`); project completed → buttons: add to portfolio / open social album / move client to maintenance.
- Nav: only "היום" and "תיק עבודות" were added. The mobile bottom bar is unchanged.

### Installable app + push notifications (2026-09-28)
- PWA: `src/app/manifest.ts` (start_url `/today`), icons generated with `ImageResponse` (`src/lib/app-icon.tsx`,
  `app/apple-icon.tsx`, `/pwa-icon/192|512`), `public/sw.js` (push + notification click only, no offline cache).
- iPhone: push works only from the home-screen app (iOS 16.4+). `AppPrompt` (top of the app) shows install steps in
  Safari, then a one-tap "enable notifications" inside the app. Settings → "אפליקציה והתראות": device on/off, test
  push, per-event preferences (`profiles.notify_prefs`).
- Sending: `src/lib/push.ts` (`web-push`), called with `notify()` which runs in `after()` and never throws.
  Events: task assigned to someone else (`createTask`/`updateTask`), questionnaire submitted (`submitQuestionnaire`),
  client approval / change request (`respondToApproval`), morning digest (`/api/cron/digest`, Vercel Cron 04:00 UTC,
  once per Israel day; set `CRON_SECRET` in Vercel to lock the endpoint).
- Devices: `push_subscriptions` (deleted automatically on 404/410). VAPID keys: env `NEXT_PUBLIC_VAPID_PUBLIC_KEY` +
  `VAPID_PRIVATE_KEY` if set, otherwise generated once into `app_private` (service-role only). Don't rotate them —
  every device would need to re-enable notifications.

### V3 — daily workflow (2026-09-29) — additive, from `WEBLLY_Daily_Workflow_Spec.md`
- **Team** (`/settings/team`): partner profile (job title, phone, colour, working days, hours, `morning_time`) and
  **responsibilities** (`team_responsibilities`: title, category, owner, active). Nothing is hard-coded to a name:
  `responsible_for(category)` (SQL) / `recipientsFor(category)` (push) resolve the owner; no owner → shared with everyone.
  Work categories are one list in SQL + `workCategory` in `labels.ts`.
- **Tasks:** `secondary_assigned_to`, `category` (suggests the owner in the form — always overridable), status
  `waiting_team`, `auto_key` (automation-created tasks never duplicate). Quick filters on `/tasks`: mine / each partner / unassigned / today / overdue / waiting.
- **Work engine** `src/lib/work-engine.ts` (pure, tested in `work-engine.test.ts`) + loader `src/lib/data/work.ts`.
  Rules only, no AI. Ranks: blocked → overdue → client waiting → today → deadline → follow-up → questionnaire → proposal →
  contract/payment → stalled → suggestions. Suggestions (portfolio, social, missing links/handoff, quiet clients) only
  when a person has < 3 urgent items. Drives `/today` (personal + team view), the dashboard blocks and the morning push.
- **Morning push** `/api/cron/digest`: idempotent — one summary per person per Israeli day, only on working days and
  after their `morning_time`; claimed in `notification_log` (unique user/kind/day) before sending. Triggered every 15 min
  by **pg_cron + pg_net** (set up once with `npm run schedule:morning -- <production URL>`; the key lives in
  `app_private.cron_key`), plus a daily Vercel Cron fallback (needs `CRON_SECRET` in Vercel once `cron_key` exists).
  Per-person switches in `profiles.notify_prefs` (events + `digest_*` parts).
- **Client relationship:** `client_interactions` (updates `clients.last_interaction_at`, opens a follow-up when dated),
  `follow_ups` (keeps `clients.next_follow_up_date`), view `client_relationship` (first/last purchase, last payment,
  revenue, projects — money still only from payments), `alert_states` (snooze/dismiss of computed "inactive client"
  alerts, shared by the team). Client statuses added: lead / new / returning / inactive. Client tab "קשר".
- **Proposals** (`/proposals`, `proposals` + `proposal_items`): builder pre-filled from a questionnaire
  (`draftFromQuestionnaire` in `src/lib/domain/proposals.ts` — restates answers, never invents prices), secure client
  link `/o/<token>` (view → viewed; accept with name / decline via `respond_to_proposal()`, service role only),
  duplicate, print/PDF, convert to project (existing project prices are only filled when empty), contract from proposal
  (`/contracts/new?proposal=`). Accepting opens a "prepare contract" task for the contracts owner.
- **Digital signature:** "send for signature" freezes the text in `contract_versions` (immutable, SHA-256 of canonical
  JSON — `src/lib/contract-hash.ts`) and creates `/s/<token>`. The client draws a signature; `sign_contract()` re-checks
  token + version + hash and writes `contract_signatures` (name, ID, email, PNG, IP, UA, time). Editing a sent/signed
  agreement bumps the version and returns it to draft (DB trigger `contracts_versioning`) — the signed copy never
  changes. Signed copy: `/contracts/<id>/signed?v=N`; the signature PNG is also stored in the client's files.
- **Client portal** `/p/<token>` now also shows progress, next stage, deadline, what's needed (questionnaire / proposal /
  contract links, deposit), a payments summary and signed documents.
- **Also:** project owner (`projects.owner_id`; change requests go to the owner, else development), link kinds
  Claude Code + DNS, reference types + preview image (`src/lib/link-preview.ts`, public hosts only), approval kind
  "feature", portfolio display name / services / featured, AI handoff adds the agreed scope and `CODEX_PROMPT.md`,
  "project completed" also offers a 30-day follow-up and a balance check.
- **Social reels:** album section `reels` ("מוכן לעלות כריל"), `files.caption` / `files.posted_at`. `/social?tab=ready`
  lists every unposted reel; on iPhone "שיתוף" opens the share sheet (Instagram / Save Video) and copies the caption.
  Album page shows one section at a time (chips) to keep the phone screen calm.
- **Mobile nav:** the bottom bar is now היום / לקוחות / פרויקטים / משימות / עוד (dashboard moved into "עוד").

## 5. Environment & database

`.env.local` (never commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`, `SUPABASE_DB_URL` (direct/pooler connection string, only for scripts).

Migrations are tracked in `internal.app_migrations`. Apply new ones with `npm run db:migrate`.
Applied so far on production: 0100 schema, 0200 logic, 0300 security, 0400 social_and_automation, 0500 duplicate_max_choices, 0600 contract_generator, 0700 task_statuses, 0800 v2_upgrade, 0900 push_notifications, 1000 v3_enums, 1100 v3_daily_workflow.
**Network note:** the direct host `db.<ref>.supabase.co` is IPv6-only and does not resolve on IPv4-only networks
(`getaddrinfo ENOTFOUND`). Use the Session pooler instead: user `postgres.<ref>`, host
`aws-0-ap-northeast-1.pooler.supabase.com`, port 5432 (same password) — e.g. `SUPABASE_DB_URL=… npm run db:migrate`.
**Enum values added with `alter type … add value` cannot be used in the same migration file.**

Workflow for a DB change: write `supabase/migrations/<timestamp>_name.sql` → add a test in `supabase/tests/db.test.ts`
→ `npm run test:db` → `npm run db:migrate` → `npm run db:types` → `npx tsc --noEmit`.

## 6. Quality gates (run before every commit)

```bash
npm run lint && npx tsc --noEmit && npm run test:db && npm run test:unit && npx next build
```

## 7. State at handoff (2026-09-28)

- Production DB was wiped clean on 2026-09-27 at the owner's request. It contains ONLY: the 3 questionnaire
  templates ("אתר תדמית — אפיון מלא", "חנות אונליין (E-commerce)", "מערכת / אפליקציית SaaS", each with a
  general link; each ends with the shared "עיצוב, תחושה וקופי" step from `scripts/design-step.ts`,
  added via `npm run templates:add-design`), the 2 staff users and workspace settings. Everything created from now on is real data —
  never run `npm run seed` (demo data) against production again.
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
- A certified e-signature provider (the built-in signature is a drawn signature + audit trail, not a qualified certificate).
- Payment gateway (`payments.external_provider/external_id` exist).
- Zip download of a whole Social album.
- Realtime updates (currently pages refresh on navigation/action; data is shared instantly between teammates).
