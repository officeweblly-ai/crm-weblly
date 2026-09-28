/**
 * Database test-suite. Runs every migration against an in-process Postgres
 * (PGlite) with minimal stand-ins for Supabase's `auth` and `storage` schemas,
 * then exercises RLS, triggers and business functions.
 *
 *   npm run test:db
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const MIGRATIONS = join(__dirname, "..", "migrations");

const SUPABASE_STUBS = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
`;

const OWNER = "11111111-1111-1111-1111-111111111111";
const SECOND = "22222222-2222-2222-2222-222222222222";

let db: PGlite;
let passed = 0;

async function as(role: "anon" | "authenticated" | "service_role" | "postgres", sub: string | null = null) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  if (role !== "postgres") await db.exec(`set role ${role};`);
}

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0];
}

async function rejects(sql: string, params: unknown[] = [], match?: RegExp) {
  try {
    await db.query(sql, params);
  } catch (e) {
    if (match) assert.match((e as Error).message, match);
    return;
  }
  throw new Error(`Expected failure: ${sql}`);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

async function main() {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
    console.log(`  migrated ${f}`);
  }

  await test("first user becomes active owner, second is pending", async () => {
    await as("postgres");
    await db.query(`insert into auth.users (id, email) values ($1, 'owner@studio.test'), ($2, 'second@studio.test')`, [OWNER, SECOND]);
    const o = await one<{ role: string; is_active: boolean }>(`select role, is_active from profiles where id = $1`, [OWNER]);
    const s = await one<{ role: string; is_active: boolean }>(`select role, is_active from profiles where id = $1`, [SECOND]);
    assert.equal(o.role, "owner");
    assert.equal(o.is_active, true);
    assert.equal(s.is_active, false);
  });

  let leadId = "";
  await test("staff can create a lead; activity logged", async () => {
    await as("authenticated", OWNER);
    const l = await one<{ id: string }>(
      `insert into leads (name, business_name, phone, email, source, project_type, estimated_value)
       values ('דנה לוי', 'סטודיו דנה', '050-123-4567', 'dana@example.com', 'instagram', 'landing_page', 4500) returning id`,
    );
    leadId = l.id;
    const a = await one<{ n: number }>(`select count(*)::int n from activity_logs where type = 'lead.created'`);
    assert.equal(a.n, 1);
  });

  await test("pending user and anon see nothing", async () => {
    await as("authenticated", SECOND);
    const r = await db.query(`select * from leads`);
    assert.equal(r.rows.length, 0);
    await rejects(`insert into leads (name) values ('x')`, [], /row-level security/);
    await as("anon");
    await rejects(`select * from leads`, [], /permission denied/);
    await rejects(`select * from form_submissions`, [], /permission denied/);
    await rejects(`select public.dashboard_metrics()`, [], /permission denied/);
  });

  let clientId = "";
  let projectId = "";
  await test("convert lead → client + project atomically", async () => {
    await as("authenticated", OWNER);
    const r = await one<{ convert_lead: { client_id: string; project_id: string; reused_client: boolean } }>(
      `select convert_lead($1, true, 'דף נחיתה — סטודיו דנה')`, [leadId],
    );
    clientId = r.convert_lead.client_id;
    projectId = r.convert_lead.project_id;
    assert.equal(r.convert_lead.reused_client, false);
    const c = await one<{ name: string; phone_digits: string }>(`select name, phone_digits from clients where id = $1`, [clientId]);
    assert.equal(c.name, "דנה לוי");
    assert.equal(c.phone_digits, "0501234567");
    const p = await one<{ total_price: string; project_type: string }>(`select total_price, project_type from projects where id = $1`, [projectId]);
    assert.equal(Number(p.total_price), 4500);
    assert.equal(p.project_type, "landing_page");
    const l = await one<{ status: string; converted_project_id: string }>(`select status, converted_project_id from leads where id = $1`, [leadId]);
    assert.equal(l.status, "converted");
    assert.equal(l.converted_project_id, projectId);
    await rejects(`select convert_lead($1)`, [leadId], /already converted/);
  });

  await test("second lead with same phone reuses the client", async () => {
    const l = await one<{ id: string }>(`insert into leads (name, phone) values ('דנה', '0501234567') returning id`);
    const r = await one<{ convert_lead: { client_id: string; reused_client: boolean } }>(`select convert_lead($1, false)`, [l.id]);
    assert.equal(r.convert_lead.reused_client, true);
    assert.equal(r.convert_lead.client_id, clientId);
  });

  await test("financials are derived from payments (add / edit / delete)", async () => {
    await db.query(`update projects set total_price = 6000, deposit_amount = 2000 where id = $1`, [projectId]);
    const pay = await one<{ id: string }>(`insert into payments (project_id, amount, method, kind) values ($1, 2000, 'bit', 'deposit') returning id`, [projectId]);
    let f = await one<{ amount_paid: string; balance_due: string; deposit_covered: boolean }>(`select * from project_financials where project_id = $1`, [projectId]);
    assert.equal(Number(f.amount_paid), 2000);
    assert.equal(Number(f.balance_due), 4000);
    assert.equal(f.deposit_covered, true);
    await db.query(`update payments set amount = 1500 where id = $1`, [pay.id]);
    f = await one(`select * from project_financials where project_id = $1`, [projectId]);
    assert.equal(Number(f.balance_due), 4500);
    assert.equal(f.deposit_covered, false);
    await db.query(`delete from payments where id = $1`, [pay.id]);
    f = await one(`select * from project_financials where project_id = $1`, [projectId]);
    assert.equal(Number(f.amount_paid), 0);
    await rejects(`insert into payments (project_id, amount) values ($1, 0)`, [projectId], /check constraint/);
    const types = await db.query<{ type: string }>(`select type from activity_logs where type like 'payment.%' order by created_at`);
    assert.deepEqual(types.rows.map((r) => r.type).sort(), ["payment.added", "payment.deleted", "payment.updated"]);
    await db.query(`insert into payments (project_id, amount, paid_at) values ($1, 1000, (now() at time zone 'Asia/Jerusalem')::date)`, [projectId]);
  });

  await test("child rows inherit client from project", async () => {
    const t = await one<{ client_id: string }>(`insert into tasks (title, project_id) values ('קבלת לוגו', $1) returning client_id`, [projectId]);
    assert.equal(t.client_id, clientId);
    const done = await one<{ completed_at: string | null }>(`update tasks set status = 'done' where project_id = $1 returning completed_at`, [projectId]);
    assert.ok(done.completed_at);
    const re = await one<{ completed_at: string | null }>(`update tasks set status = 'todo' where project_id = $1 returning completed_at`, [projectId]);
    assert.equal(re.completed_at, null);
  });

  let templateId = "";
  let qHasSite = "";
  let qUrl = "";
  let qName = "";
  let qLogo = "";
  await test("form builder: sections, questions, reorder, duplicate with remapped conditions", async () => {
    templateId = (await one<{ id: string }>(`insert into form_templates (name) values ('אתר תדמית') returning id`)).id;
    const s1 = (await one<{ id: string }>(`insert into form_sections (template_id, title, position) values ($1, 'פרטים', 0) returning id`, [templateId])).id;
    const s2 = (await one<{ id: string }>(`insert into form_sections (template_id, title, position) values ($1, 'אתר', 1) returning id`, [templateId])).id;
    qName = (await one<{ id: string }>(`insert into form_questions (section_id, type, label, required, maps_to, position) values ($1, 'short_text', 'שם מלא', true, 'client.name', 0) returning id`, [s1])).id;
    qHasSite = (await one<{ id: string }>(`insert into form_questions (section_id, type, label, required, position) values ($1, 'yes_no', 'יש אתר?', true, 0) returning id`, [s2])).id;
    qUrl = (await one<{ id: string }>(
      `insert into form_questions (section_id, type, label, required, position, condition) values ($1, 'url', 'כתובת', true, 1, $2) returning id`,
      [s2, JSON.stringify({ question_id: qHasSite, operator: "equals", value: "yes" })],
    )).id;
    qLogo = (await one<{ id: string }>(`insert into form_questions (section_id, type, label, position) values ($1, 'image_upload', 'לוגו', 2) returning id`, [s2])).id;
    await db.query(`select reorder_form_sections($1, $2::uuid[])`, [templateId, [s2, s1]]);
    const pos = await one<{ position: number }>(`select position from form_sections where id = $1`, [s1]);
    assert.equal(pos.position, 1);
    await db.query(`select reorder_form_questions($1, $2::uuid[])`, [s1, [qName, qLogo]]);
    const moved = await one<{ section_id: string }>(`select section_id from form_questions where id = $1`, [qLogo]);
    assert.equal(moved.section_id, s1);
    await db.query(`select reorder_form_questions($1, $2::uuid[])`, [s2, [qHasSite, qUrl, qLogo]]);

    const dup = await one<{ duplicate_form_template: string }>(`select duplicate_form_template($1)`, [templateId]);
    const cond = await one<{ cond: string; has: string }>(
      `select q.condition->>'question_id' cond,
              (select q2.id from form_questions q2 join form_sections s2 on s2.id = q2.section_id where s2.template_id = $1 and q2.label = 'יש אתר?')::text has
       from form_questions q join form_sections s on s.id = q.section_id
       where s.template_id = $1 and q.label = 'כתובת'`, [dup.duplicate_form_template],
    );
    assert.equal(cond.cond, cond.has);
    assert.notEqual(cond.cond, qHasSite);
  });

  let submissionId = "";
  await test("questionnaire lifecycle moves project status", async () => {
    const s = await one<{ id: string }>(
      `insert into form_submissions (token, template_id, project_id, title, form_snapshot)
       values (repeat('a', 43), $1, $2, 'אתר תדמית', '{}'::jsonb) returning id`, [templateId, projectId],
    );
    submissionId = s.id;
    const c = await one<{ client_id: string }>(`select client_id from form_submissions where id = $1`, [s.id]);
    assert.equal(c.client_id, clientId);
    await db.query(`update form_submissions set status = 'sent', sent_at = now() where id = $1`, [s.id]);
    const p = await one<{ status: string }>(`select status from projects where id = $1`, [projectId]);
    assert.equal(p.status, "questionnaire_sent");
  });

  await test("finalize is service-role only and preserves answers", async () => {
    await rejects(`select finalize_questionnaire($1, '[]'::jsonb, '{}'::jsonb)`, [submissionId], /permission denied/);
    await as("service_role");
    const keep = await one<{ id: string }>(
      `insert into files (storage_path, original_name, mime_type, size_bytes, submission_id, question_id, source, category)
       values ('submissions/x/logo.png', 'logo.png', 'image/png', 100, $1, $2, 'questionnaire', 'branding') returning id`, [submissionId, qLogo],
    );
    await db.query(
      `insert into files (storage_path, original_name, mime_type, size_bytes, submission_id, question_id, source)
       values ('submissions/x/removed.png', 'removed.png', 'image/png', 100, $1, $2, 'questionnaire')`, [submissionId, qLogo],
    );
    const answers = [
      { question_id: qName, section_title: "פרטים", section_position: 1, question_label: "שם מלא", question_type: "short_text", position: 0, value: "דנה לוי" },
      { question_id: qHasSite, section_title: "אתר", section_position: 0, question_label: "יש אתר?", question_type: "yes_no", position: 0, value: "yes" },
      { question_id: qUrl, section_title: "אתר", section_position: 0, question_label: "כתובת", question_type: "url", position: 1, value: "https://dana.co.il" },
      { question_id: qLogo, section_title: "אתר", section_position: 0, question_label: "לוגו", question_type: "image_upload", position: 2, value: [{ file_id: keep.id, name: "logo.png" }] },
    ];
    const r = await one<{ finalize_questionnaire: { client_id: string; orphan_paths: string[] } }>(
      `select finalize_questionnaire($1, $2::jsonb, '{}'::jsonb)`, [submissionId, JSON.stringify(answers)],
    );
    assert.equal(r.finalize_questionnaire.client_id, clientId);
    assert.deepEqual(r.finalize_questionnaire.orphan_paths, ["submissions/x/removed.png"]);
    const f = await one<{ client_id: string; project_id: string }>(`select client_id, project_id from files where id = $1`, [keep.id]);
    assert.equal(f.client_id, clientId);
    assert.equal(f.project_id, projectId);
    const p = await one<{ status: string }>(`select status from projects where id = $1`, [projectId]);
    assert.equal(p.status, "questionnaire_received");
    await rejects(`select finalize_questionnaire($1, '[]'::jsonb, '{}'::jsonb)`, [submissionId], /closed/);

    await as("authenticated", OWNER);
    await db.query(`update form_answers set internal_note = 'לבדוק דומיין' where submission_id = $1 and question_id = $2`, [submissionId, qUrl]);
    await rejects(`update form_answers set value = '"hacked"' where submission_id = $1`, [submissionId], /permission denied/);
    await rejects(`delete from form_answers where submission_id = $1`, [submissionId], /permission denied/);
    await rejects(`insert into activity_logs (type, description) values ('x', 'y')`, [], /permission denied/);
  });

  await test("questionnaire without client creates one (and dedupes by email)", async () => {
    await as("service_role");
    const snap = "{}";
    const s1 = await one<{ id: string }>(`insert into form_submissions (token, title, form_snapshot) values (repeat('b', 43), 'שאלון', $1) returning id`, [snap]);
    const r1 = await one<{ finalize_questionnaire: { client_id: string; created_client: boolean } }>(
      `select finalize_questionnaire($1, '[]'::jsonb, $2::jsonb)`, [s1.id, JSON.stringify({ name: "יוסי כהן", email: "Yossi@Example.com", business_name: "כהן שיפוצים" })],
    );
    assert.equal(r1.finalize_questionnaire.created_client, true);
    const auto = await one<{ status: string; client_id: string; name: string }>(
      `select p.status, p.client_id, p.name from form_submissions s join projects p on p.id = s.project_id where s.id = $1`, [s1.id],
    );
    assert.equal(auto.status, "questionnaire_received");
    assert.equal(auto.client_id, r1.finalize_questionnaire.client_id);
    assert.match(auto.name, /כהן שיפוצים/);
    const s2 = await one<{ id: string }>(`insert into form_submissions (token, title, form_snapshot) values (repeat('c', 43), 'שאלון', $1) returning id`, [snap]);
    const r2 = await one<{ finalize_questionnaire: { client_id: string; created_client: boolean } }>(
      `select finalize_questionnaire($1, '[]'::jsonb, $2::jsonb)`, [s2.id, JSON.stringify({ name: "יוסי", email: "yossi@example.com" })],
    );
    assert.equal(r2.finalize_questionnaire.created_client, false);
    assert.equal(r2.finalize_questionnaire.client_id, r1.finalize_questionnaire.client_id);
  });

  await test("social albums: staff only, files attach to albums", async () => {
    await as("authenticated", OWNER);
    const a = await one<{ id: string }>(`insert into social_albums (title) values ('בניית CRM ללקוח') returning id`);
    await db.query(`insert into files (storage_path, original_name, mime_type, size_bytes, album_id, album_section, category) values ('social/x.mp4', 'x.mp4', 'video/mp4', 10, $1, 'process', 'social')`, [a.id]);
    await as("anon");
    await rejects(`select * from social_albums`, [], /permission denied/);
    await as("authenticated", OWNER);
    await db.query(`delete from social_albums where id = $1`, [a.id]);
    const n = await one<{ n: number }>(`select count(*)::int n from files where storage_path = 'social/x.mp4'`);
    assert.equal(n.n, 0);
  });

  await test("client lifecycle statuses", async () => {
    await as("authenticated", OWNER);
    const c = await one<{ status: string }>(`insert into clients (name, status) values ('לקוח תחזוקה', 'maintenance') returning status`);
    assert.equal(c.status, "maintenance");
  });

  await test("dashboard metrics compute from real rows", async () => {
    await as("authenticated", OWNER);
    const m = (await one<{ dashboard_metrics: Record<string, number> }>(`select dashboard_metrics()`)).dashboard_metrics;
    assert.equal(Number(m.revenue_this_month), 1000);
    assert.equal(Number(m.outstanding_balance), 5000);
    // 1 converted-lead project + 2 opened automatically by questionnaires
    assert.equal(Number(m.active_projects), 3);
    // 1 manual task + 3 "review the questionnaire" tasks opened by V3 (one per submitted questionnaire)
    assert.equal(Number(m.open_tasks), 4);
  });

  await test("profiles: only owner changes roles; members cannot self-promote", async () => {
    await as("authenticated", SECOND);
    await rejects(`update profiles set is_active = true where id = $1`, [SECOND]);
    await as("authenticated", OWNER);
    await db.query(`update profiles set is_active = true where id = $1`, [SECOND]);
    await as("authenticated", SECOND);
    await rejects(`update profiles set role = 'owner' where id = $1`, [SECOND], /owner/);
    const r = await db.query(`select * from leads`);
    assert.ok(r.rows.length > 0);
    await rejects(`update profiles set email = 'x' where id = $1`, [SECOND], /permission denied/);
  });

  await test("contracts: signed status stamps signed_at", async () => {
    await as("authenticated", OWNER);
    const c = await one<{ signed_at: string | null }>(`insert into contracts (client_id, project_id, title, status) values ($1, $2, 'הסכם', 'signed') returning signed_at`, [clientId, projectId]);
    assert.ok(c.signed_at);
  });

  // -------------------------------------------------------------------------
  // V2
  // -------------------------------------------------------------------------
  await test("v2: questionnaire received sets the next action when empty", async () => {
    await as("authenticated", OWNER);
    const p = await one<{ next_action: string }>(`select next_action from projects where id = $1`, [projectId]);
    assert.equal(p.next_action, "לעבור על האפיון");
  });

  await test("v2 tasks: new statuses, dates, blocking, checklist, history", async () => {
    await as("authenticated", OWNER);
    const a = await one<{ id: string }>(`insert into tasks (title, project_id, status, start_date, due_date, assigned_to) values ('עיצוב Hero', $1, 'in_progress', '2026-10-01', '2026-10-05', $2) returning id`, [projectId, OWNER]);
    const b = await one<{ id: string }>(`insert into tasks (title, project_id, blocked_by_task_id, status) values ('פיתוח Hero', $1, $2, 'blocked') returning id`, [projectId, a.id]);
    await rejects(`update tasks set blocked_by_task_id = id where id = $1`, [b.id], /not_self_blocked/);
    await rejects(`insert into tasks (title, start_date, due_date) values ('x', '2026-10-05', '2026-10-01')`, [], /dates_order/);
    await db.query(`update tasks set status = 'waiting_client' where id = $1`, [a.id]);
    const log = await one<{ n: number }>(`select count(*)::int n from activity_logs where type = 'task.status_changed' and entity_id = $1`, [a.id]);
    assert.equal(log.n, 1);
    await db.query(`insert into task_checklist_items (task_id, title) values ($1, 'כותרת'), ($1, 'כפתור')`, [a.id]);
    await db.query(`update task_checklist_items set is_done = true where task_id = $1 and title = 'כותרת'`, [a.id]);
    const c = await one<{ done: number; total: number }>(`select count(*) filter (where is_done)::int done, count(*)::int total from task_checklist_items where task_id = $1`, [a.id]);
    assert.deepEqual(c, { done: 1, total: 2 });
    // Deleting the blocking task frees the blocked one.
    await db.query(`delete from tasks where id = $1`, [a.id]);
    const freed = await one<{ blocked_by_task_id: string | null }>(`select blocked_by_task_id from tasks where id = $1`, [b.id]);
    assert.equal(freed.blocked_by_task_id, null);
    await db.query(`delete from tasks where id = $1`, [b.id]);
  });

  await test("v2 links + references are staff-only", async () => {
    await as("authenticated", OWNER);
    await db.query(`insert into project_links (project_id, kind, url, client_visible) values ($1, 'staging', 'https://staging.dana.co.il', true)`, [projectId]);
    await db.query(`insert into project_references (project_id, title, url, category, note) values ($1, 'Stripe', 'https://stripe.com', 'hero', 'האנימציה בכותרת')`, [projectId]);
    await rejects(`insert into project_references (project_id, title, url, category) values ($1, 'x', 'https://x.com', 'nope')`, [projectId], /check constraint/);
    await as("anon");
    await rejects(`select * from project_links`, [], /permission denied/);
    await rejects(`select * from project_references`, [], /permission denied/);
  });

  let approvalId = "";
  await test("v2 approvals: client answers only through the project token", async () => {
    await as("authenticated", OWNER);
    const token = "t".repeat(43);
    await db.query(`update projects set portal_token = $2, portal_enabled_at = now() where id = $1`, [projectId, token]);
    const created = await one<{ n: number }>(`select count(*)::int n from activity_logs where type = 'project.portal_created'`);
    assert.equal(created.n, 1);
    approvalId = (await one<{ id: string }>(`insert into project_approvals (project_id, title, kind) values ($1, 'עיצוב דסקטופ', 'design_desktop') returning id`, [projectId])).id;
    // Staff cannot fake a client answer, and nobody but the server may call the function.
    await rejects(`insert into approval_feedback (approval_id, decision) values ($1, 'approved')`, [approvalId], /permission denied/);
    await rejects(`select respond_to_approval($1, $2, 'approved')`, [token, approvalId], /permission denied/);

    await as("service_role");
    await rejects(`select respond_to_approval($1, $2, 'approved')`, ["x".repeat(43), approvalId], /Invalid link/);
    await rejects(`select respond_to_approval($1, $2, 'changes_requested', '  ')`, [token, approvalId], /comment is required/);
    const r = await one<{ respond_to_approval: { status: string; task_id: string } }>(
      `select respond_to_approval($1, $2, 'changes_requested', 'להגדיל את הלוגו', 'דנה')`, [token, approvalId],
    );
    assert.equal(r.respond_to_approval.status, "changes_requested");
    const t = await one<{ title: string; priority: string; project_id: string }>(`select title, priority, project_id from tasks where id = $1`, [r.respond_to_approval.task_id]);
    assert.match(t.title, /עיצוב דסקטופ/);
    assert.equal(t.project_id, projectId);
    await rejects(`select respond_to_approval($1, $2, 'approved')`, [token, approvalId], /already answered/);
    const log = await one<{ n: number }>(`select count(*)::int n from activity_logs where type = 'approval.changes_requested'`);
    assert.equal(log.n, 1);

    await as("authenticated", OWNER);
    const second = (await one<{ id: string }>(`insert into project_approvals (project_id, title, kind, create_task_on_changes) values ($1, 'גרסה 2', 'design_desktop', false) returning id`, [projectId])).id;
    await as("service_role");
    const ok = await one<{ respond_to_approval: { status: string; task_id: string | null } }>(`select respond_to_approval($1, $2, 'approved')`, [token, second]);
    assert.equal(ok.respond_to_approval.status, "approved");
    assert.equal(ok.respond_to_approval.task_id, null);

    await as("authenticated", OWNER);
    await db.query(`update projects set portal_token = null where id = $1`, [projectId]);
    await as("service_role");
    await rejects(`select respond_to_approval($1, $2, 'approved')`, [token, second], /Invalid link/);
    await as("anon");
    await rejects(`select * from project_approvals`, [], /permission denied/);
  });

  await test("v2 AI handoff + portfolio", async () => {
    await as("authenticated", OWNER);
    const h = await one<{ id: string }>(`insert into project_ai_handoffs (project_id, mega_prompt) values ($1, 'prompt') returning id`, [projectId]);
    await db.query(`insert into project_ai_handoff_files (handoff_id, name, content, position) values ($1, 'PROJECT_CONTEXT.md', '# x', 0)`, [h.id]);
    await rejects(`insert into project_ai_handoff_files (handoff_id, name, content) values ($1, '../evil', 'x')`, [h.id], /check constraint/);
    const item = await one<{ id: string; published_at: string | null }>(`insert into portfolio_items (project_id, client_id, title, status) values ($1, $2, 'סטודיו דנה', 'published') returning id, published_at`, [projectId, clientId]);
    assert.ok(item.published_at);
    await rejects(`insert into portfolio_items (project_id, title) values ($1, 'כפול')`, [projectId], /duplicate key/);
    const f = await one<{ id: string }>(`insert into files (storage_path, original_name, mime_type, size_bytes, project_id) values ('clients/x/cover.png', 'cover.png', 'image/png', 1, $1) returning id`, [projectId]);
    await db.query(`insert into portfolio_media (item_id, file_id, kind) values ($1, $2, 'cover')`, [item.id, f.id]);
    const f2 = await one<{ id: string }>(`insert into files (storage_path, original_name, mime_type, size_bytes, project_id) values ('clients/x/cover2.png', 'cover2.png', 'image/png', 1, $1) returning id`, [projectId]);
    await rejects(`insert into portfolio_media (item_id, file_id, kind) values ($1, $2, 'cover')`, [item.id, f2.id], /duplicate key/);
    const draft = await one<{ published_at: string | null }>(`update portfolio_items set status = 'draft' where id = $1 returning published_at`, [item.id]);
    assert.equal(draft.published_at, null);
  });

  await test("push: devices are private per user, secrets are server-only", async () => {
    await as("service_role");
    await db.query(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/owner', 'k', 'a'), ($2, 'https://push.example/second', 'k', 'a')`, [OWNER, SECOND]);
    await db.query(`insert into app_private (key, value) values ('vapid', 'secret')`);
    await rejects(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'http://insecure', 'k', 'a')`, [OWNER], /check constraint/);
    await as("authenticated", OWNER);
    const mine = await db.query<{ endpoint: string }>(`select endpoint from push_subscriptions`);
    assert.deepEqual(mine.rows.map((r) => r.endpoint), ["https://push.example/owner"]);
    await rejects(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x', 'k', 'a')`, [OWNER], /permission denied/);
    await rejects(`select * from app_private`, [], /permission denied/);
    await db.query(`update profiles set notify_prefs = '{"daily_digest": false}' where id = $1`, [OWNER]);
    await as("anon");
    await rejects(`select * from push_subscriptions`, [], /permission denied/);
  });

  // -------------------------------------------------------------------------
  // V3
  // -------------------------------------------------------------------------
  await test("v3 team: responsibilities route automations, profile fields are self-editable", async () => {
    await as("authenticated", SECOND);
    await db.query(`update profiles set job_title = 'שותפה', working_days = '{0,1,2,3}', morning_time = '09:15' where id = $1`, [SECOND]);
    await rejects(`update profiles set working_days = '{7}' where id = $1`, [SECOND], /check constraint/);
    await as("authenticated", OWNER);
    await db.query(`insert into team_responsibilities (title, category, assigned_to) values ('פיתוח', 'development', $1), ('הצעות מחיר', 'proposals', $2), ('חוזים', 'contracts', $2), ('גבייה', 'finance', $2)`, [OWNER, SECOND]);
    const who = await one<{ dev: string; prop: string; none: string | null }>(`select responsible_for('development') dev, responsible_for('proposals') prop, responsible_for('social') none`);
    assert.equal(who.dev, OWNER);
    assert.equal(who.prop, SECOND);
    assert.equal(who.none, null);
    // An inactive responsibility is ignored.
    await db.query(`update team_responsibilities set is_active = false where category = 'development'`);
    assert.equal((await one<{ r: string | null }>(`select responsible_for('development') r`)).r, null);
    await db.query(`update team_responsibilities set is_active = true where category = 'development'`);
    await rejects(`insert into team_responsibilities (title, category) values ('x', 'nope')`, [], /check constraint/);
    await rejects(`select open_auto_task('k', 't', 'development', null, null)`, [], /permission denied/);
    await as("anon");
    await rejects(`select * from team_responsibilities`, [], /permission denied/);
  });

  let v3Client = "";
  let v3Project = "";
  await test("v3 tasks: owner + secondary, waiting for team, category", async () => {
    await as("authenticated", OWNER);
    v3Client = (await one<{ id: string }>(`insert into clients (name, business_name) values ('נועה ברק', 'GOOM') returning id`)).id;
    v3Project = (await one<{ id: string }>(`insert into projects (client_id, name, total_price, deposit_amount, status, owner_id) values ($1, 'אתר GOOM', 10000, 4000, 'development', $2) returning id`, [v3Client, OWNER])).id;
    const t = await one<{ id: string }>(`insert into tasks (title, project_id, assigned_to, secondary_assigned_to, category, status) values ('גרסת מובייל', $1, $2, $3, 'development', 'waiting_team') returning id`, [v3Project, OWNER, SECOND]);
    await rejects(`update tasks set secondary_assigned_to = assigned_to where id = $1`, [t.id], /secondary_differs/);
    await rejects(`update tasks set category = 'nope' where id = $1`, [t.id], /check constraint/);
    await db.query(`update tasks set status = 'blocked' where id = $1`, [t.id]);
    const log = await one<{ n: number }>(`select count(*)::int n from activity_logs where type = 'task.status_changed' and entity_id = $1`, [t.id]);
    assert.equal(log.n, 1);
  });

  await test("v3 questionnaire received opens one review task for the proposals owner", async () => {
    await as("service_role");
    const s = await one<{ id: string }>(`insert into form_submissions (token, title, form_snapshot, client_id, project_id) values (repeat('q', 43), 'אתר תדמית', '{}', $1, $2) returning id`, [v3Client, v3Project]);
    await db.query(`select finalize_questionnaire($1, '[]'::jsonb, '{}'::jsonb)`, [s.id]);
    const t = await one<{ title: string; assigned_to: string; category: string; auto_key: string }>(`select title, assigned_to, category, auto_key from tasks where auto_key = $1`, [`questionnaire_review:${s.id}`]);
    assert.match(t.title, /GOOM/);
    assert.equal(t.assigned_to, SECOND);
    assert.equal(t.category, "proposals");
    // The same event can't open a second task.
    await as("postgres");
    const again = await one<{ id: string | null }>(`select open_auto_task($1, 'x', 'proposals', null, $2) id`, [`questionnaire_review:${s.id}`, v3Client]);
    assert.equal(again.id, null);
  });

  await test("v3 interactions update the client and open a follow-up", async () => {
    await as("authenticated", OWNER);
    await db.query(`insert into client_interactions (client_id, kind, summary, next_action, follow_up_date, occurred_at) values ($1, 'phone', 'שיחה על התמונות', 'לבקש תמונות', '2026-10-05', '2026-09-20T10:00:00Z')`, [v3Client]);
    const c = await one<{ last_interaction_at: string; next_follow_up_date: string }>(`select last_interaction_at, next_follow_up_date::text from clients where id = $1`, [v3Client]);
    assert.ok(c.last_interaction_at);
    assert.equal(c.next_follow_up_date, "2026-10-05");
    const f = await one<{ id: string; reason: string; assigned_to: string }>(`select id, reason, assigned_to from follow_ups where client_id = $1`, [v3Client]);
    assert.equal(f.reason, "לבקש תמונות");
    assert.equal(f.assigned_to, OWNER);
    // An older interaction never moves the date backwards; internal notes don't count as contact.
    await db.query(`insert into client_interactions (client_id, kind, summary, occurred_at) values ($1, 'whatsapp', 'ישן', '2026-01-01T10:00:00Z')`, [v3Client]);
    await db.query(`insert into client_interactions (client_id, kind, summary) values ($1, 'internal_note', 'הערה')`, [v3Client]);
    const after = await one<{ d: string }>(`select last_interaction_at::date::text d from clients where id = $1`, [v3Client]);
    assert.equal(after.d, "2026-09-20");
    await db.query(`update follow_ups set status = 'done' where id = $1`, [f.id]);
    const done = await one<{ next_follow_up_date: string | null; done_at: string | null }>(
      `select c.next_follow_up_date, f.done_at from clients c, follow_ups f where c.id = $1 and f.id = $2`, [v3Client, f.id]);
    assert.equal(done.next_follow_up_date, null);
    assert.ok(done.done_at);
    const types = await db.query<{ type: string }>(`select distinct type from activity_logs where client_id = $1 and type in ('interaction.added', 'followup.created', 'followup.done')`, [v3Client]);
    assert.equal(types.rows.length, 3);
    const rel = await one<{ total_revenue: string; project_count: number; last_activity_at: string }>(`select * from client_relationship where client_id = $1`, [v3Client]);
    assert.equal(Number(rel.total_revenue), 0);
    assert.equal(rel.project_count, 1);
    assert.ok(rel.last_activity_at);
  });

  let proposalId = "";
  await test("v3 proposals: client answers only through the token; accepting opens a contract task", async () => {
    await as("authenticated", OWNER);
    const token = "p".repeat(43);
    proposalId = (await one<{ id: string }>(
      `insert into proposals (client_id, project_id, title, price, deposit, status, public_token, valid_until) values ($1, $2, 'הצעה לאתר GOOM', 12000, 4000, 'sent', $3, '2099-01-01') returning id`,
      [v3Client, v3Project, token],
    )).id;
    await db.query(`insert into proposal_items (proposal_id, title) values ($1, 'עיצוב ופיתוח'), ($1, 'התאמה למובייל')`, [proposalId]);
    await db.query(`insert into proposal_items (proposal_id, kind, title) values ($1, 'excluded', 'צילום מוצרים')`, [proposalId]);
    await rejects(`update proposals set deposit = 20000 where id = $1`, [proposalId], /deposit_le_price/);
    await rejects(`select respond_to_proposal($1, 'accepted', 'נועה')`, [token], /permission denied/);
    await as("service_role");
    await db.query(`select mark_proposal_viewed($1)`, [token]);
    assert.equal((await one<{ status: string }>(`select status from proposals where id = $1`, [proposalId])).status, "viewed");
    await rejects(`select respond_to_proposal($1, 'accepted', 'נועה')`, ["z".repeat(43)], /Invalid link/);
    await rejects(`select respond_to_proposal($1, 'accepted', '  ')`, [token], /name is required/);
    const r = await one<{ respond_to_proposal: { status: string; task_id: string } }>(`select respond_to_proposal($1, 'accepted', 'נועה ברק')`, [token]);
    assert.equal(r.respond_to_proposal.status, "accepted");
    const t = await one<{ title: string; assigned_to: string }>(`select title, assigned_to from tasks where id = $1`, [r.respond_to_proposal.task_id]);
    assert.match(t.title, /חוזה/);
    assert.equal(t.assigned_to, SECOND);
    await rejects(`select respond_to_proposal($1, 'rejected')`, [token], /already answered/);
    const p = await one<{ responded_at: string | null; viewed_at: string | null }>(`select responded_at, viewed_at from proposals where id = $1`, [proposalId]);
    assert.ok(p.responded_at && p.viewed_at);
    // Expired offers can't be accepted.
    await as("authenticated", OWNER);
    const old = "o".repeat(43);
    await db.query(`insert into proposals (client_id, title, status, public_token, valid_until) values ($1, 'ישנה', 'sent', $2, '2020-01-01')`, [v3Client, old]);
    await as("service_role");
    await rejects(`select respond_to_proposal($1, 'accepted', 'x')`, [old], /expired/);
    await as("anon");
    await rejects(`select * from proposals`, [], /permission denied/);
  });

  await test("v3 contracts: signing binds to a frozen version; edits after signing create a new version", async () => {
    await as("authenticated", OWNER);
    const token = "s".repeat(43);
    const hash = "a".repeat(64);
    const c = await one<{ id: string }>(
      `insert into contracts (client_id, project_id, title, content, proposal_id) values ($1, $2, 'הסכם GOOM', '{"scope": "v1"}', $3) returning id`,
      [v3Client, v3Project, proposalId],
    );
    await db.query(`insert into contract_versions (contract_id, version, title, content, content_hash) values ($1, 1, 'הסכם GOOM', '{"scope": "v1"}', $2)`, [c.id, hash]);
    await db.query(`update contracts set status = 'sent', sign_token = $2, sent_at = now() where id = $1`, [c.id, token]);
    await rejects(`update contract_versions set content = '{}' where contract_id = $1`, [c.id], /permission denied/);
    await rejects(`delete from contract_versions where contract_id = $1`, [c.id], /permission denied/);
    await rejects(`insert into contract_signatures (contract_id, version, signer_name, signature_png, content_hash) values ($1, 1, 'x', 'data:image/png;base64,AA', 'x')`, [c.id], /permission denied/);

    const png = "data:image/png;base64,iVBORw0KGgo=";
    await as("service_role");
    await rejects(`select sign_contract($1, 1, $2, 'נועה', null, null, $3)`, [token, "b".repeat(64), png], /changed/);
    await rejects(`select sign_contract($1, 2, $2, 'נועה', null, null, $3)`, [token, hash, png], /changed/);
    await rejects(`select sign_contract($1, 1, $2, 'נועה', null, null, 'not-an-image')`, [token, hash], /check constraint/);
    const r = await one<{ sign_contract: { status: string; version: number; task_id: string | null } }>(
      `select sign_contract($1, 1, $2, 'נועה ברק', '123456789', 'noa@goom.co.il', $3, '1.2.3.4', 'iPhone')`, [token, hash, png],
    );
    assert.equal(r.sign_contract.status, "signed");
    assert.ok(r.sign_contract.task_id, "deposit not covered → a finance task is opened");
    const signed = await one<{ status: string; signed_version: number; signed_at: string }>(`select status, signed_version, signed_at from contracts where id = $1`, [c.id]);
    assert.equal(signed.status, "signed");
    assert.equal(signed.signed_version, 1);
    assert.ok(signed.signed_at);
    await rejects(`select sign_contract($1, 1, $2, 'נועה', null, null, $3)`, [token, hash, png], /Already signed/);

    // Changing the text after signing → version 2 in draft; version 1 and its signature stay.
    await as("authenticated", OWNER);
    const v2 = await one<{ version: number; status: string; signed_at: string | null }>(`update contracts set content = '{"scope": "v2"}' where id = $1 returning version, status, signed_at`, [c.id]);
    assert.deepEqual(v2, { version: 2, status: "draft", signed_at: null });
    const kept = await one<{ content: { scope: string }; sigs: number }>(
      `select v.content, (select count(*)::int from contract_signatures s where s.contract_id = $1 and s.version = 1) sigs from contract_versions v where v.contract_id = $1 and v.version = 1`, [c.id]);
    assert.equal(kept.content.scope, "v1");
    assert.equal(kept.sigs, 1);
    // A draft (not re-sent) can't be signed.
    await as("service_role");
    await rejects(`select sign_contract($1, 2, $2, 'נועה', null, null, $3)`, [token, hash, png], /not open for signing/);
    const log = await one<{ n: number }>(`select count(*)::int n from activity_logs where type = 'contract.signed_digitally'`);
    assert.equal(log.n, 1);
  });

  await test("v3 approvals: change requests go to the project owner", async () => {
    await as("authenticated", OWNER);
    const token = "u".repeat(43);
    await db.query(`update projects set portal_token = $2, owner_id = $3 where id = $1`, [v3Project, token, SECOND]);
    const a = await one<{ id: string }>(`insert into project_approvals (project_id, title, kind) values ($1, 'Hero מובייל', 'feature') returning id`, [v3Project]);
    await as("service_role");
    const r = await one<{ respond_to_approval: { task_id: string } }>(`select respond_to_approval($1, $2, 'changes_requested', 'להקטין את הכותרת')`, [token, a.id]);
    const t = await one<{ assigned_to: string; category: string }>(`select assigned_to, category from tasks where id = $1`, [r.respond_to_approval.task_id]);
    assert.equal(t.assigned_to, SECOND);
    assert.equal(t.category, "development");
  });

  await test("v3 links, references, social reels, portfolio fields", async () => {
    await as("authenticated", OWNER);
    await db.query(`insert into project_links (project_id, kind, url) values ($1, 'claude_code', 'https://claude.ai'), ($1, 'dns', 'https://dash.cloudflare.com')`, [v3Project]);
    const logged = await one<{ n: number }>(`select count(*)::int n from activity_logs where type = 'project.link_added' and project_id = $1`, [v3Project]);
    assert.equal(logged.n, 2);
    await db.query(`insert into project_references (project_id, title, url, category) values ($1, 'Dribbble', 'https://dribbble.com/x', 'dribbble')`, [v3Project]);
    await db.query(`insert into project_approvals (project_id, title, kind) values ($1, 'x', 'feature')`, [v3Project]);
    const a = await one<{ id: string }>(`insert into social_albums (title) values ('רילס') returning id`);
    await db.query(`insert into files (storage_path, original_name, mime_type, size_bytes, album_id, album_section, category, caption) values ('social/r.mp4', 'r.mp4', 'video/mp4', 10, $1, 'reels', 'social', 'לפני ואחרי')`, [a.id]);
    await rejects(`insert into files (storage_path, original_name, mime_type, size_bytes, album_section) values ('social/y.mp4', 'y.mp4', 'video/mp4', 1, 'nope')`, [], /check constraint/);
    await db.query(`insert into portfolio_items (title, services, is_featured, client_display_name) values ('GOOM', '{"עיצוב","פיתוח"}', true, 'GOOM')`);
  });

  await test("v3 notification log: private per user, written by the server only", async () => {
    await as("service_role");
    await db.query(`insert into notification_log (user_id, kind, day, title, body) values ($1, 'morning_summary', '2026-09-29', 'בוקר טוב', 'x'), ($2, 'morning_summary', '2026-09-29', 'בוקר טוב', 'y')`, [OWNER, SECOND]);
    await rejects(`insert into notification_log (user_id, kind, day) values ($1, 'morning_summary', '2026-09-29')`, [OWNER], /duplicate key/);
    await as("authenticated", OWNER);
    const mine = await db.query<{ body: string }>(`select body from notification_log`);
    assert.deepEqual(mine.rows.map((r) => r.body), ["x"]);
    await rejects(`insert into notification_log (user_id, kind, day) values ($1, 'x', '2026-09-30')`, [OWNER], /permission denied/);
    await as("authenticated", OWNER);
    await db.query(`insert into alert_states (key, snoozed_until) values ('inactive:x:90d', '2026-10-15')`);
    await as("anon");
    await rejects(`select * from alert_states`, [], /permission denied/);
    await rejects(`select * from contract_signatures`, [], /permission denied/);
  });

  await test("deleting a client cascades cleanly (no FK errors from activity triggers)", async () => {
    await as("authenticated", OWNER);
    await db.query(`delete from clients where id = $1`, [clientId]);
    const n = await one<{ n: number }>(`select count(*)::int n from projects where client_id = $1`, [clientId]);
    assert.equal(n.n, 0);
    const l = await one<{ converted_client_id: string | null }>(`select converted_client_id from leads where id = $1`, [leadId]);
    assert.equal(l.converted_client_id, null);
  });

  console.log(`\n${passed} database tests passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
