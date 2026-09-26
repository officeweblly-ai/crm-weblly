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
    assert.equal(Number(m.open_tasks), 1);
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
