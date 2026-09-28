import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push for the installed app (iPhone 16.4+ from the home screen, Android,
 * desktop). Sending happens after the response via `after()`, so a slow or
 * failing push service never slows down or breaks the action that triggered it.
 *
 * VAPID keys: taken from env (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)
 * when set; otherwise generated once and kept in public.app_private, which only
 * the service role can read — so it works with zero manual setup.
 */
export const NOTIFY_EVENTS = [
  "daily_digest",
  "task_assigned",
  "questionnaire_submitted",
  "approval_response",
  "proposal_response",
  "contract_signed",
  "payment_added",
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

/**
 * Parts of the morning summary each person can switch off. Missing key = on.
 * (The summary itself is "daily_digest".)
 */
export const DIGEST_PARTS = ["digest_overdue", "digest_follow_ups", "digest_deadlines", "digest_inactive_clients"] as const;
export type DigestPart = (typeof DIGEST_PARTS)[number];
export const PREF_KEYS = [...NOTIFY_EVENTS, ...DIGEST_PARTS] as const;

export type PushPayload = { title: string; body: string; url: string; tag?: string };

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

export async function vapidKeys(): Promise<Keys> {
  if (cached) return cached;
  const envPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;
  if (envPublic && envPrivate) return (cached = { publicKey: envPublic, privateKey: envPrivate });

  const db = createAdminClient();
  const { data } = await db.from("app_private").select("value").eq("key", "vapid").maybeSingle();
  if (data) return (cached = JSON.parse(data.value) as Keys);
  const fresh = webpush.generateVAPIDKeys();
  // Two first requests at once: the second insert is ignored and both read the winner.
  await db.from("app_private").upsert({ key: "vapid", value: JSON.stringify(fresh) }, { onConflict: "key", ignoreDuplicates: true });
  const { data: stored } = await db.from("app_private").select("value").eq("key", "vapid").single();
  return (cached = JSON.parse(stored!.value) as Keys);
}

/**
 * Who should hear about something: the person who owns that work area in
 * Team → responsibilities (plus any explicit people), or the whole team when
 * nobody owns it. Never hard-coded names.
 */
export async function recipientsFor(category: string, ...explicit: (string | null | undefined)[]): Promise<string[] | "staff"> {
  const ids = explicit.filter((x): x is string => Boolean(x));
  const db = createAdminClient();
  const { data } = await db.rpc("responsible_for", { p_category: category });
  if (data) ids.push(data as string);
  return ids.length ? [...new Set(ids)] : "staff";
}

export function wants(prefs: unknown, event: NotifyEvent | DigestPart): boolean {
  const p = prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>) : {};
  return p[event] !== false;
}

/** Sends now (awaited). Recipients: specific staff ids, or every active staff member. */
export async function sendPush(to: string[] | "staff", event: NotifyEvent | "test", payload: PushPayload): Promise<{ sent: number }> {
  const db = createAdminClient();
  let q = db.from("profiles").select("id, notify_prefs").eq("is_active", true);
  if (to !== "staff") {
    if (!to.length) return { sent: 0 };
    q = q.in("id", to);
  }
  const { data: people } = await q;
  const ids = (people ?? []).filter((p) => event === "test" || wants(p.notify_prefs, event)).map((p) => p.id);
  if (!ids.length) return { sent: 0 };

  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids);
  if (!subs?.length) return { sent: 0 };

  const keys = await vapidKeys();
  const contact = process.env.VAPID_SUBJECT ?? "mailto:office.weblly@gmail.com";
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];
  const used: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: { subject: contact, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 60 * 60 * 24,
          urgency: "high",
          topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        });
        sent++;
        used.push(s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The device unsubscribed or the app was removed — forget it.
        if (code === 404 || code === 410) dead.push(s.id);
        else console.error("[push] send failed", code, (e as Error).message);
      }
    }),
  );
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  if (used.length) await db.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", used);
  return { sent };
}

/** Fire-and-forget: runs after the response; never throws into the caller. */
export function notify(to: string[] | "staff" | (() => Promise<string[] | "staff">), event: NotifyEvent, payload: PushPayload) {
  after(async () => {
    try {
      await sendPush(typeof to === "function" ? await to() : to, event, payload);
    } catch (e) {
      console.error("[push] notify failed", (e as Error).message);
    }
  });
}
