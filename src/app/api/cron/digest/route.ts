import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkInput } from "@/lib/data/work";
import { sendPush, wants, type DigestPart } from "@/lib/push";
import { israelNow } from "@/lib/format";
import { buildWorkItems, morningDue, morningMessage, planFor, type WorkGroup, type WorkItem } from "@/lib/work-engine";

/**
 * Personal morning summary. Safe to call as often as you like (every 15
 * minutes from pg_cron, plus a daily Vercel Cron as a fallback): each active
 * partner gets at most ONE summary per Israeli day, only on their working
 * days, only after their chosen time, and only if "סיכום בוקר" is on.
 * notification_log (unique per person/day) is claimed before sending, so two
 * overlapping runs can never both send.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron) or
 * `x-cron-key: <app_private.cron_key>` (pg_cron). If neither secret exists
 * the endpoint stays callable — the once-a-day claim makes that harmless.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Parts of the summary each person can switch off in Settings → notifications. */
const PART_OF: Partial<Record<WorkGroup, DigestPart>> = {
  overdue: "digest_overdue",
  blocked: "digest_overdue",
  follow_up: "digest_follow_ups",
  lead: "digest_follow_ups",
  project_deadline: "digest_deadlines",
  client_health: "digest_inactive_clients",
  past_client: "digest_inactive_clients",
};

async function authorized(request: Request, db: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const { data } = await db.from("app_private").select("value").eq("key", "cron_key").maybeSingle();
  if (data?.value && request.headers.get("x-cron-key") === data.value) return true;
  return !secret && !data?.value;
}

export async function GET(request: Request) {
  const db = createAdminClient();
  if (!(await authorized(request, db))) return new Response("Unauthorized", { status: 401 });

  const now = israelNow();
  const { data: sentToday } = await db.from("notification_log").select("user_id").eq("kind", "morning_summary").eq("day", now.date);
  const done = new Set((sentToday ?? []).map((r) => r.user_id));

  const { data: people } = await db.from("profiles").select("id, full_name, email, working_days, morning_time, notify_prefs").eq("is_active", true);
  const due = (people ?? []).filter((p) => !done.has(p.id) && wants(p.notify_prefs, "daily_digest") && morningDue(p, now));
  if (!due.length) return Response.json({ at: now, sent: 0, due: 0 });

  const { input } = await loadWorkInput(db);
  const items = buildWorkItems(input);
  const results: { user: string; status: string; devices: number }[] = [];

  for (const person of due) {
    // Claim today's slot first; a concurrent run gets a conflict and skips.
    const { data: claim } = await db
      .from("notification_log")
      .upsert({ user_id: person.id, kind: "morning_summary", day: now.date, status: "pending" }, { onConflict: "user_id,kind,day", ignoreDuplicates: true })
      .select("id");
    if (!claim?.length) continue;

    const visible = items.filter((i: WorkItem) => {
      const part = PART_OF[i.group];
      return !part || wants(person.notify_prefs, part);
    });
    const plan = planFor(visible, person.id);
    const first = (person.full_name || "").trim().split(/\s+/)[0] ?? "";
    const msg = morningMessage(first, plan);
    let status = "sent";
    let devices = 0;
    let error: string | null = null;
    try {
      devices = (await sendPush([person.id], "daily_digest", { title: msg.title, body: msg.body, url: "/today", tag: "morning" })).sent;
      if (!devices) status = "no_device";
    } catch (e) {
      status = "failed";
      error = (e as Error).message.slice(0, 500);
    }
    await db.from("notification_log").update({ status, devices, error, title: msg.title, body: msg.body, url: "/today" }).eq("id", claim[0].id);
    results.push({ user: person.id, status, devices });
  }
  return Response.json({ at: now, due: due.length, results });
}
