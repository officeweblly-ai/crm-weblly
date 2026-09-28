/**
 * Schedules the personal morning summary inside Supabase (pg_cron + pg_net):
 * every 15 minutes during the morning it calls /api/cron/digest, which sends
 * each partner one summary per day at the time they chose. The call carries
 * a random key kept in public.app_private (service-role only) — it is
 * generated here once and never printed.
 *
 *   npm run schedule:morning -- https://crm-weblly-ix33.vercel.app
 *
 * Safe to re-run: the job is replaced, the key is kept.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  const site = (process.argv[2] ?? process.env.PRODUCTION_URL ?? "").replace(/\/$/, "");
  if (!url) throw new Error("Missing SUPABASE_DB_URL in .env.local");
  if (!/^https:\/\//.test(site)) throw new Error("Pass the production URL, e.g. npm run schedule:morning -- https://crm-weblly-ix33.vercel.app");

  const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
  try {
    await sql`create extension if not exists pg_cron`;
    await sql`create extension if not exists pg_net`;
    await sql`insert into public.app_private (key, value) values ('cron_key', ${randomBytes(32).toString("base64url")}) on conflict (key) do nothing`;
    const command = `select net.http_get(
      url := '${site}/api/cron/digest',
      headers := jsonb_build_object('x-cron-key', (select value from public.app_private where key = 'cron_key')),
      timeout_milliseconds := 55000
    )`;
    // 03:00–11:45 UTC covers every morning time between ~05:00 and ~14:00 in Israel (summer and winter).
    await sql`select cron.schedule('weblly-morning-summary', '*/15 3-11 * * *', ${command})`;
    const [job] = await sql<{ schedule: string; active: boolean }[]>`select schedule, active from cron.job where jobname = 'weblly-morning-summary'`;
    console.log(`Scheduled: ${job.schedule} (active: ${job.active}) → ${site}/api/cron/digest`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
