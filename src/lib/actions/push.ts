"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREF_KEYS, sendPush, vapidKeys } from "@/lib/push";
import { dbError, NOT_AUTHORIZED, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

export async function getPushPublicKey(): Promise<ActionResult<{ key: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { publicKey } = await vapidKeys();
  return ok({ key: publicKey });
}

const subscriptionSchema = z.object({
  endpoint: z.url().startsWith("https://").max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(8).max(100) }),
});

/** Saves this device for the signed-in staff member (moves it over if another user had it). */
export async function subscribePush(input: unknown, userAgent: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = subscriptionSchema.safeParse(input);
  if (!p.success) return fail("פרטי המכשיר לא תקינים.");
  const db = createAdminClient();
  const { error } = await db.from("push_subscriptions").upsert(
    { user_id: s.userId, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, user_agent: userAgent.slice(0, 300) },
    { onConflict: "endpoint" },
  );
  if (error) return dbError(error, "שמירת המכשיר נכשלה");
  revalidatePath("/settings");
  return ok(undefined, "ההתראות הופעלו במכשיר הזה");
}

export async function unsubscribePush(endpoint: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", s.userId);
  if (error) return dbError(error, "הביטול נכשל");
  revalidatePath("/settings");
  return ok(undefined, "ההתראות כובו במכשיר הזה");
}

export async function sendTestPush(): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  // A test always goes out, regardless of the per-event preferences.
  const { sent } = await sendPush([s.userId], "test", { title: "weblly", body: "ההתראות עובדות. כך ייראו עדכונים מהמערכת.", url: "/today", tag: "test" }).catch(() => ({ sent: 0 }));
  if (!sent) return fail("לא נמצא מכשיר פעיל. הפעילו התראות במכשיר הזה ונסו שוב.");
  return ok(undefined, sent === 1 ? "נשלחה התראת בדיקה" : `נשלחה התראת בדיקה ל-${sent} מכשירים`);
}

const prefsSchema = z.partialRecord(z.enum(PREF_KEYS), z.boolean());

export async function setNotifyPrefs(prefs: unknown): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = prefsSchema.safeParse(prefs);
  if (!p.success) return fail("הגדרות לא תקינות.");
  // Merge: a screen that shows only some switches never resets the others.
  const { data: me } = await s.supabase.from("profiles").select("notify_prefs").eq("id", s.userId).maybeSingle();
  const current = me?.notify_prefs && typeof me.notify_prefs === "object" && !Array.isArray(me.notify_prefs) ? me.notify_prefs : {};
  const { error } = await s.supabase.from("profiles").update({ notify_prefs: { ...current, ...p.data } }).eq("id", s.userId);
  if (error) return dbError(error, "שמירת ההגדרות נכשלה");
  revalidatePath("/settings");
  return ok(undefined, "העדפות ההתראות נשמרו");
}
