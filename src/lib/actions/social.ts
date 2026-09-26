"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BUCKET } from "@/lib/storage";
import { albumSchema } from "@/lib/validation/schemas";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

export async function createAlbum(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(albumSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("social_albums").insert(p.data).select("id").single();
  if (error) return dbError(error, "יצירת התיקייה נכשלה");
  revalidatePath("/social");
  return ok({ id: data.id }, `התיקייה "${p.data.title}" נוצרה`);
}

export async function updateAlbum(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(albumSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("social_albums").update(p.data).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  revalidatePath("/social", "layout");
  return ok({ id }, "פרטי התיקייה עודכנו");
}

export async function setAlbumStatus(id: string, status: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.enum(["collecting", "editing", "published"]).safeParse(status);
  if (!parsed.success) return fail("סטטוס לא תקין.");
  const { error } = await s.supabase.from("social_albums").update({ status: parsed.data }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  revalidatePath("/social", "layout");
  return ok(undefined, "הסטטוס עודכן");
}

export async function deleteAlbum(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: files } = await s.supabase.from("files").select("storage_path").eq("album_id", id);
  const { error } = await s.supabase.from("social_albums").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת התיקייה נכשלה");
  const paths = (files ?? []).map((f) => f.storage_path);
  for (let i = 0; i < paths.length; i += 100) await s.supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  revalidatePath("/social", "layout");
  return ok(undefined, "התיקייה וכל החומרים שבה נמחקו");
}
