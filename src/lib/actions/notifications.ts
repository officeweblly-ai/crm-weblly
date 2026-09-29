"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_AUTHORIZED, staffClient } from "./helpers";
import { ok, type ActionResult } from "./result";

export type InboxItem = { id: string; kind: string; title: string; body: string; url: string | null; read_at: string | null; created_at: string };

/** The bell: latest items + unread count (RLS: only your own). */
export async function myNotifications(limit = 20): Promise<ActionResult<{ items: InboxItem[]; unread: number }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const n = z.number().int().min(1).max(200).catch(20).parse(limit);
  const [{ data }, { count }] = await Promise.all([
    s.supabase.from("notifications").select("id, kind, title, body, url, read_at, created_at").eq("user_id", s.userId).order("created_at", { ascending: false }).limit(n),
    s.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", s.userId).is("read_at", null),
  ]);
  return ok({ items: data ?? [], unread: count ?? 0 });
}

export async function unreadCount(): Promise<number> {
  const s = await staffClient();
  if (!s) return 0;
  const { count } = await s.supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", s.userId).is("read_at", null);
  return count ?? 0;
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  let q = s.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", s.userId).is("read_at", null);
  if (ids?.length) q = q.in("id", z.array(z.uuid()).max(200).parse(ids));
  await q;
  revalidatePath("/", "layout");
  return ok(undefined, "סומן כנקרא");
}

export async function clearReadNotifications(): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  await s.supabase.from("notifications").delete().eq("user_id", s.userId).not("read_at", "is", null);
  revalidatePath("/", "layout");
  return ok(undefined, "ההתראות שנקראו נוקו");
}
