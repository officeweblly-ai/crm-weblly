import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";
import { todayISO } from "@/lib/format";

/**
 * Morning digest, called by Vercel Cron (vercel.json). Each staff member gets
 * one push: their tasks due today / overdue (plus unassigned ones) and leads
 * to call back. Runs at most once per calendar day (Israel time), so a repeated
 * or spoofed call can't spam anyone; with CRON_SECRET set, only Vercel may call it.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = createAdminClient();
  const today = todayISO();
  const { data: last } = await db.from("app_private").select("value").eq("key", "digest_last_date").maybeSingle();
  if (last?.value === today) return Response.json({ skipped: "already sent today" });
  await db.from("app_private").upsert({ key: "digest_last_date", value: today, updated_at: new Date().toISOString() });

  const [{ data: staff }, { data: tasks }, { data: leads }] = await Promise.all([
    db.from("profiles").select("id").eq("is_active", true),
    db.from("tasks").select("assigned_to, due_date").neq("status", "done").lte("due_date", today),
    db.from("leads").select("id").not("status", "in", "(converted,lost)").lte("follow_up_date", today),
  ]);

  let sent = 0;
  for (const person of staff ?? []) {
    const mine = (tasks ?? []).filter((t) => t.assigned_to === person.id || t.assigned_to === null);
    const overdue = mine.filter((t) => t.due_date! < today).length;
    const dueToday = mine.length - overdue;
    const leadCount = (leads ?? []).length;
    if (!mine.length && !leadCount) continue;
    const parts = [
      dueToday ? (dueToday === 1 ? "משימה אחת להיום" : `${dueToday} משימות להיום`) : null,
      overdue ? `${overdue} באיחור` : null,
      leadCount ? (leadCount === 1 ? "ליד אחד לחזור אליו" : `${leadCount} לידים לחזור אליהם`) : null,
    ].filter(Boolean);
    const r = await sendPush([person.id], "daily_digest", { title: "בוקר טוב — מה על הפרק היום", body: parts.join(" · "), url: "/today", tag: "digest" });
    sent += r.sent;
  }
  return Response.json({ sent });
}
