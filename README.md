# Studio CRM — ניהול לקוחות לעסק לבניית אתרים

An internal operating system for a web-development studio: one place for the whole
client lifecycle — **lead → client → project → questionnaire → assets → deposit →
design → development → approval → final payment → delivery**.

Open a client and see everything: who they are, what they bought, what they answered
in the questionnaire, which files they uploaded, what's been paid, what's left, and
what the next action is.

The UI is Hebrew-first (RTL) and fully responsive.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Turbopack) |
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS v4, Radix primitives, lucide icons, sonner toasts, dnd-kit |
| Data | Supabase — PostgreSQL, Auth, Storage, Row Level Security |
| Validation | zod (server-side on every mutation; shared rules for the public form) |
| Tests | PGlite (real Postgres in-process) for the database, `node:test` for domain logic |

Fonts: IBM Plex Sans Hebrew (UI), Frank Ruhl Libre (client/project headings), IBM Plex
Mono (phones, emails, URLs — always rendered LTR).

---

## Quick start

```bash
npm install
cp .env.example .env.local        # then fill in the values (see below)
# apply the database migrations (see "Supabase setup")
npm run create-admin -- you@studio.co.il "a-long-password" "השם שלך"
npm run seed                      # optional: starter templates + demo data
npm run dev                       # http://localhost:3000
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Anon / publishable key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Public questionnaire endpoints (after token validation) and scripts. Never expose. |
| `NEXT_PUBLIC_SITE_URL` | server | Base URL for questionnaire links |

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **Apply migrations** — one of:
   - `npm run db:migrate` — set `SUPABASE_DB_URL` (Connect → Session pooler) in `.env.local`; applies pending files in order, each in a transaction,
   - Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`, or
   - SQL editor: run the files in `supabase/migrations/` **in order**.
3. **Auth** → Providers → Email: keep enabled. Auth → Settings: **disable "Allow new users to sign up"** (staff are created by you).
4. Create your user: `npm run create-admin -- <email> <password> "<name>"`
   (or Dashboard → Authentication → Add user). **The first user automatically becomes the active owner.**
   Later users are created *pending* and must be activated by the owner in **הגדרות → צוות**.
5. **Storage**: the migration creates a private bucket `crm-files` (25 MB limit, allowed MIME
   types enforced by Storage itself). Nothing to click.

### Migrations

| File | Contents |
| --- | --- |
| `20260925000100_schema.sql` | Enums, tables, constraints, indexes, `updated_at`/consistency triggers, financial views |
| `20260925000200_logic.sql` | Activity logging triggers, `convert_lead`, `finalize_questionnaire`, ordering + duplication helpers, `dashboard_metrics` |
| `20260925000300_security.sql` | RLS on every table, column-level privileges, storage bucket + policies, function privileges |

After changing SQL: `npm run test:db` (runs every migration on an in-process Postgres and
exercises RLS/functions) and `npm run db:types` (regenerates `src/lib/supabase/database.types.ts`).

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route type generation + `tsc` |
| `npm run db:migrate` | Apply pending migrations to `SUPABASE_DB_URL` |
| `npm run test:db` | Database test-suite (migrations, RLS, triggers, business functions) — no Docker needed |
| `npm run test:unit` | Questionnaire condition/validation logic |
| `npm run db:types` | Regenerate DB types from the migrations |
| `npm run seed:templates` | Create the starter questionnaire templates (real, reusable) |
| `npm run seed` | Templates **+ demo data** (leads, clients, projects, payments, tasks, a completed questionnaire) |
| `npm run seed:reset` | Delete all demo rows (`is_demo = true`) and everything under them |
| `npm run create-admin` | Create a staff user via the Admin API |

Demo rows are flagged `is_demo` and shown with a **"נתוני דמו"** badge. The app never depends on them.

---

## Architecture notes

### Folder layout

```
src/
  app/
    (app)/…            authenticated area (layout = auth gate + shell)
    form/[token]/      public questionnaire (no account)
    login/, pending/
  components/
    ui/                design-system primitives (Button, Field, Modal, Confirm, Menu, Badge, tables, …)
    shell/             sidebar, top bar, mobile bottom nav + drawer
    clients/ projects/ payments/ tasks/ files/ contracts/ notes/ activity/ questionnaires/ form/
  lib/
    actions/           server actions — every mutation (auth check → zod → DB)
    data/              server-only queries
    domain/            labels/status model, questionnaire engine (pure, shared client/server)
    validation/        zod schemas
    supabase/          clients (user / service-role / browser) + generated types
  proxy.ts             session refresh + optimistic redirect (Next 16 "proxy" = middleware)
supabase/
  migrations/  tests/
scripts/               seed, create-admin, type generator
```

### Security model

- **Staff-only data.** Every table has RLS; policies call `is_staff()` (an active row in `profiles`).
  The `anon` role has no table privileges at all.
- **Answers are immutable.** `form_answers` rows are inserted only by `finalize_questionnaire`
  (security definer, service-role only). Staff may update `internal_note` only (column privilege +
  trigger guard). Activity logs are append-only.
- **Public questionnaires.** Each link carries a 256-bit random token (`/form/<token>`), never an ID.
  The page and every public server action re-validate the token and the submission state, then
  touch *only that submission* with the service-role client. Internal notes, other clients and
  other submissions are never selected.
- **Files.** Private bucket. Uploads go browser → Storage through short-lived signed upload URLs
  minted after authorization; the server then verifies the object exists before recording it.
  Downloads/previews use signed URLs valid for minutes. Storage keys are random (ASCII); the
  original Hebrew filename is stored in the DB.
- **Roles.** `owner` / `admin` / `member`; only the owner can activate users or change roles
  (enforced in the DB). Adding employees later = create user + activate.

### Data integrity

- **Money is derived, never duplicated.** Projects store the *agreement* (`total_price`,
  `deposit_amount`). `amount_paid`, `balance_due` and `deposit_covered` come from the
  `project_financials` view over `payments` — adding, editing or deleting a payment can't leave
  totals inconsistent. `client_financials` aggregates per client.
- **Consistent relations.** Tasks, notes, files, contracts and submissions that reference a
  project get their `client_id` from that project by trigger.
- **Lead → client** runs in one transaction (`convert_lead`) and reuses an existing client when
  the email or phone already exists.
- **Questionnaire submission** runs in one transaction (`finalize_questionnaire`): saves answers,
  attaches uploads to client/project, creates or de-duplicates the client if needed, marks the
  request completed, advances the project status and logs activity.
- Template snapshots: a questionnaire link freezes the template at creation time, so editing a
  template never changes what a client saw or answered.

### Questionnaire engine

`src/lib/domain/forms.ts` is shared by the builder, the public form and the server validator:
conditions (`equals`, `not_equals`, `includes`, `not_includes`, `answered`, `not_answered`) are
data on each question, chain correctly (a hidden parent hides its dependants) and are cycle-safe.
Hidden questions are neither validated nor stored. Questions can map to client fields
(`maps_to`) so a questionnaire sent before a client exists can create the client.

The public form autosaves to the server (debounced) and to `localStorage` as a backup, warns
before leaving with unsaved changes, and shows per-file upload progress.

### Dates

`date` columns (deadlines, payment dates, follow-ups) are calendar dates — formatted in UTC so they
never shift. Timestamps are shown in `Asia/Jerusalem`. "Month" in revenue metrics = Israeli calendar month.

### Extension points (not built in V1, by design)

- **Payment processing**: `payments.external_provider/external_id` (unique) ready for a gateway webhook.
- **Contracts**: `contracts.template_id`, `signature_provider`, `signature_request_id` for templating/e-signature.
- **Automations**: every meaningful change already lands in `activity_logs` with typed `type` +
  `metadata` — a natural trigger source for reminders/emails.
- **Task templates**: the default checklist lives in `DEFAULT_CHECKLIST` (per-project, opt-in).
