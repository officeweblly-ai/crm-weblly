"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromIsraelTime, isoDateOffset } from "@/lib/format";
import { followUpSchema, interactionSchema } from "@/lib/validation/schemas";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

/**
 * Client relationship: interactions (the DB updates "last interaction" and
 * opens a follow-up when a date is given), follow-ups, and snoozing /
 * dismissing computed alerts such as "no contact for 90 days".
 */
function refresh() {
  revalidatePath("/", "layout");
}

export async function createInteraction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(interactionSchema, fd);
  if (!p.success) return p.result;
  const { occurred_at, ...rest } = p.data;
  // A date alone means noon (Israel) that day, so it never lands on the day before.
  const when = occurred_at ? fromIsraelTime(occurred_at) : new Date();
  if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 86_400_000) return fail("תאריך לא תקין.", { occurred_at: "תאריך לא תקין" });
  const { data, error } = await s.supabase
    .from("client_interactions")
    .insert({ ...rest, occurred_at: when.toISOString(), user_id: s.userId })
    .select("id")
    .single();
  if (error) return dbError(error, "שמירת האינטראקציה נכשלה");
  refresh();
  return ok({ id: data.id }, p.data.follow_up_date ? "נשמר — ונקבע מעקב" : "האינטראקציה נשמרה");
}

export async function deleteInteraction(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("client_interactions").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined, "האינטראקציה נמחקה");
}

export async function createFollowUp(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(followUpSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("follow_ups").insert(p.data).select("id").single();
  if (error) return dbError(error, "יצירת המעקב נכשלה");
  refresh();
  return ok({ id: data.id }, "המעקב נקבע");
}

export async function setFollowUpStatus(id: string, status: "open" | "done" | "cancelled"): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.enum(["open", "done", "cancelled"]).safeParse(status);
  if (!parsed.success) return fail("סטטוס לא תקין.");
  const { error } = await s.supabase.from("follow_ups").update({ status: parsed.data }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, parsed.data === "done" ? "המעקב סומן כבוצע" : parsed.data === "cancelled" ? "המעקב בוטל" : "המעקב נפתח מחדש");
}

/** Moves an open follow-up by N days (e.g. "tomorrow" / "next week"). */
export async function postponeFollowUp(id: string, days: number): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const n = z.number().int().min(1).max(365).safeParse(days);
  if (!n.success) return fail("מספר ימים לא תקין.");
  const { error } = await s.supabase.from("follow_ups").update({ due_date: isoDateOffset(n.data) }).eq("id", id).eq("status", "open");
  if (error) return dbError(error, "הדחייה נכשלה");
  refresh();
  return ok(undefined, n.data === 1 ? "נדחה למחר" : `נדחה ב-${n.data} ימים`);
}

const alertKey = z.string().regex(/^client:[0-9a-f-]{36}:(2y|purchase_1y|90d|purchase_6m|30d)$/);

export async function snoozeAlert(key: string, days: number): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const k = alertKey.safeParse(key);
  const n = z.number().int().min(1).max(365).safeParse(days);
  if (!k.success || !n.success) return fail("נתונים לא תקינים.");
  const { error } = await s.supabase
    .from("alert_states")
    .upsert({ key: k.data, snoozed_until: isoDateOffset(n.data), dismissed_at: null, updated_by: s.userId, updated_at: new Date().toISOString() });
  if (error) return dbError(error, "הדחייה נכשלה");
  refresh();
  return ok(undefined, `נזכיר שוב בעוד ${n.data} ימים`);
}

export async function dismissAlert(key: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const k = alertKey.safeParse(key);
  if (!k.success) return fail("נתונים לא תקינים.");
  const { error } = await s.supabase
    .from("alert_states")
    .upsert({ key: k.data, dismissed_at: new Date().toISOString(), snoozed_until: null, updated_by: s.userId, updated_at: new Date().toISOString() });
  if (error) return dbError(error, "הפעולה נכשלה");
  refresh();
  return ok(undefined, "ההתראה הוסרה");
}
