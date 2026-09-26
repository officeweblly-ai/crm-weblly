"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BUCKET, MAX_FILE_BYTES, objectPath, resolveMime } from "@/lib/storage";
import { fileMetaSchema, uploadRequestSchema } from "@/lib/validation/schemas";
import { dbError, NOT_AUTHORIZED, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

export type UploadTicket = { path: string; signedUrl: string; mime: string };

/** Step 1: validate and mint a short-lived signed upload URL. */
export async function requestUpload(input: z.input<typeof uploadRequestSchema>): Promise<ActionResult<UploadTicket>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = uploadRequestSchema.safeParse(input);
  if (!p.success) return fail("פרטי הקובץ לא תקינים.");
  const mime = resolveMime(p.data.name, p.data.mime);
  if (!mime) return fail(`סוג הקובץ "${p.data.name}" לא נתמך. אפשר להעלות תמונות, וידאו, PDF, מסמכי Office, ZIP וקבצי עיצוב.`);
  if (p.data.size > MAX_FILE_BYTES) return fail(`הקובץ "${p.data.name}" גדול מ-50MB.`);

  let prefix = "general";
  if (p.data.album_id) {
    const { data: album } = await s.supabase.from("social_albums").select("id").eq("id", p.data.album_id).maybeSingle();
    if (!album) return fail("התיקייה לא נמצאה.");
    prefix = `social/${p.data.album_id}`;
  } else if (p.data.project_id) {
    const { data: project } = await s.supabase.from("projects").select("client_id").eq("id", p.data.project_id).maybeSingle();
    if (!project) return fail("הפרויקט לא נמצא.");
    prefix = `clients/${project.client_id}/projects/${p.data.project_id}`;
  } else if (p.data.client_id) {
    const { data: client } = await s.supabase.from("clients").select("id").eq("id", p.data.client_id).maybeSingle();
    if (!client) return fail("הלקוח לא נמצא.");
    prefix = `clients/${p.data.client_id}`;
  }

  const path = objectPath(prefix, p.data.name);
  const { data, error } = await s.supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail(`לא ניתן להתחיל העלאה: ${error?.message ?? "שגיאה לא ידועה"}`);
  return ok({ path, signedUrl: data.signedUrl, mime });
}

const confirmSchema = uploadRequestSchema.extend({ path: z.string().min(1).max(500) });

/** Step 2: after the browser uploaded, verify the object exists and record it. */
export async function confirmUpload(input: z.input<typeof confirmSchema>): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = confirmSchema.safeParse(input);
  if (!p.success) return fail("פרטי הקובץ לא תקינים.");
  if (!/^(general|social\/[0-9a-f-]{36}|clients\/[0-9a-f-]{36}(\/projects\/[0-9a-f-]{36})?)\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/.test(p.data.path)) {
    return fail("נתיב קובץ לא תקין.");
  }

  const { data: info, error: infoError } = await s.supabase.storage.from(BUCKET).info(p.data.path);
  if (infoError || !info) return fail("הקובץ לא הגיע לשרת. נסה להעלות שוב.");

  const { data, error } = await s.supabase
    .from("files")
    .insert({
      storage_path: p.data.path,
      original_name: p.data.name,
      mime_type: info.contentType ?? resolveMime(p.data.name, p.data.mime) ?? "application/octet-stream",
      size_bytes: info.size ?? p.data.size,
      category: p.data.album_id ? "social" : p.data.category,
      client_id: p.data.album_id ? null : p.data.client_id,
      project_id: p.data.album_id ? null : p.data.project_id,
      album_id: p.data.album_id,
      album_section: p.data.album_id ? (p.data.album_section ?? "other") : null,
      source: "staff",
    })
    .select("id")
    .single();
  if (error) {
    await s.supabase.storage.from(BUCKET).remove([p.data.path]);
    return dbError(error, "שמירת פרטי הקובץ נכשלה");
  }
  revalidatePath("/", "layout");
  return ok({ id: data.id }, `הקובץ "${p.data.name}" הועלה`);
}

/** Short-lived signed URL for preview or download. */
export async function getFileUrl(id: string, download = false): Promise<ActionResult<{ url: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: file } = await s.supabase.from("files").select("storage_path, original_name, bucket").eq("id", id).maybeSingle();
  if (!file) return fail("הקובץ לא נמצא.");
  const { data, error } = await s.supabase.storage
    .from(file.bucket)
    .createSignedUrl(file.storage_path, 300, download ? { download: file.original_name } : undefined);
  if (error || !data) return fail("לא ניתן לפתוח את הקובץ כרגע.");
  return ok({ url: data.signedUrl });
}

export async function updateFileMeta(input: z.input<typeof fileMetaSchema>): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = fileMetaSchema.safeParse(input);
  if (!p.success) return fail("נתונים לא תקינים.");
  const { error } = await s.supabase.from("files").update({ category: p.data.category, project_id: p.data.project_id }).eq("id", p.data.id);
  if (error) return dbError(error, "עדכון הקובץ נכשל");
  revalidatePath("/", "layout");
  return ok(undefined, "פרטי הקובץ עודכנו");
}

export async function deleteFile(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: file } = await s.supabase.from("files").select("storage_path, bucket, original_name").eq("id", id).maybeSingle();
  if (!file) return fail("הקובץ לא נמצא — ייתכן שכבר נמחק.");
  const { error } = await s.supabase.from("files").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת הקובץ נכשלה");
  const { error: storageError } = await s.supabase.storage.from(file.bucket).remove([file.storage_path]);
  if (storageError) console.error("[storage] orphan object", file.storage_path, storageError.message);
  revalidatePath("/", "layout");
  return ok(undefined, `הקובץ "${file.original_name}" נמחק`);
}
