"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildHandoff, type HandoffFile } from "@/lib/ai-handoff";
import { CLIENT_SAFE_LINK_KINDS, type ProjectLinkKind } from "@/lib/domain/labels";
import { env } from "@/lib/env";
import { approvalSchema, clientPresentationSchema, projectLinkSchema, referenceSchema } from "@/lib/validation/schemas";
import { dbError, formToObject, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

/**
 * Everything that lives *inside* a project page in V2: links, references,
 * approvals, the client presentation link, the AI handoff and the
 * "project completed" follow-ups. Same pattern as the rest of the app:
 * staff check → zod → Supabase (RLS) → revalidate → Hebrew message.
 */
function refresh() {
  revalidatePath("/", "layout");
}

// ===========================================================================
// Links
// ===========================================================================
function linkData(fd: FormData) {
  const p = parseForm(projectLinkSchema, fd);
  if (!p.success) return p;
  // Admin consoles (Supabase, Vercel…) can never be shown to the client.
  const clientVisible = p.data.client_visible && CLIENT_SAFE_LINK_KINDS.includes(p.data.kind as ProjectLinkKind);
  return { success: true as const, data: { ...p.data, client_visible: clientVisible } };
}

export async function createProjectLink(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = linkData(fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("project_links").insert(p.data).select("id").single();
  if (error) return dbError(error, "שמירת הקישור נכשלה");
  refresh();
  return ok({ id: data.id }, "הקישור נשמר");
}

export async function updateProjectLink(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = linkData(fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("project_links").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון הקישור נכשל");
  refresh();
  return ok({ id }, "הקישור עודכן");
}

export async function deleteProjectLink(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("project_links").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת הקישור נכשלה");
  refresh();
  return ok(undefined, "הקישור נמחק");
}

// ===========================================================================
// References
// ===========================================================================
export async function createReference(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(referenceSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("project_references").insert(p.data).select("id").single();
  if (error) return dbError(error, "שמירת הרפרנס נכשלה");
  refresh();
  return ok({ id: data.id }, "הרפרנס נשמר");
}

export async function updateReference(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(referenceSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("project_references").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון הרפרנס נכשל");
  refresh();
  return ok({ id }, "הרפרנס עודכן");
}

export async function deleteReference(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("project_references").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת הרפרנס נכשלה");
  refresh();
  return ok(undefined, "הרפרנס נמחק");
}

// ===========================================================================
// Client presentation (secure link, like questionnaires)
// ===========================================================================
export async function setPresentationLink(projectId: string, mode: "create" | "regenerate" | "revoke"): Promise<ActionResult<{ url: string | null }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const token = mode === "revoke" ? null : randomBytes(32).toString("base64url");
  const { error } = await s.supabase
    .from("projects")
    .update({ portal_token: token, portal_enabled_at: token ? new Date().toISOString() : null })
    .eq("id", projectId);
  if (error) return dbError(error, "עדכון הקישור נכשל");
  refresh();
  const url = token ? `${env.siteUrl()}/p/${token}` : null;
  return ok(
    { url },
    mode === "revoke" ? "הקישור בוטל — מי שיש לו אותו כבר לא יוכל לצפות" : mode === "regenerate" ? "נוצר קישור חדש. הקישור הקודם הפסיק לעבוד" : "נוצר קישור צפייה ללקוח",
  );
}

export async function updatePresentation(projectId: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(clientPresentationSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("projects").update(p.data).eq("id", projectId);
  if (error) return dbError(error, "השמירה נכשלה");
  refresh();
  return ok({ id: projectId }, "העדכון ללקוח נשמר");
}

// ===========================================================================
// Approvals
// ===========================================================================
export async function createApproval(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(approvalSchema, formToObject(fd));
  if (!p.success) return p.result;
  if (!p.data.preview_url && !p.data.file_ids.length && !p.data.description) {
    return fail("הוסיפו קישור Preview, קבצים או תיאור — שהלקוח יידע מה הוא מאשר.", { preview_url: "חסר מה לאשר" });
  }
  if (p.data.file_ids.length) {
    const { count } = await s.supabase.from("files").select("id", { count: "exact", head: true }).in("id", p.data.file_ids).eq("project_id", p.data.project_id);
    if (count !== p.data.file_ids.length) return fail("אחד הקבצים לא שייך לפרויקט.");
  }
  const { data, error } = await s.supabase.from("project_approvals").insert(p.data).select("id").single();
  if (error) return dbError(error, "יצירת בקשת האישור נכשלה");
  refresh();
  return ok({ id: data.id }, "בקשת האישור נוצרה — היא מופיעה ללקוח בקישור הצפייה");
}

export async function cancelApproval(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data, error } = await s.supabase.from("project_approvals").update({ status: "cancelled" }).eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (error) return dbError(error, "הביטול נכשל");
  if (!data) return fail("אפשר לבטל רק בקשה שעדיין ממתינה ללקוח.");
  refresh();
  return ok(undefined, "בקשת האישור בוטלה");
}

// ===========================================================================
// AI development handoff
// ===========================================================================
const handoffOptions = z.object({ includeContacts: z.boolean(), includeFileLinks: z.boolean() });

export async function generateAiHandoff(
  projectId: string,
  options: z.input<typeof handoffOptions>,
): Promise<ActionResult<{ id: string; files: HandoffFile[]; megaPrompt: string; createdAt: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const o = handoffOptions.safeParse(options);
  if (!o.success) return fail("אפשרויות לא תקינות.");
  const pkg = await buildHandoff(s.supabase, projectId, o.data);
  if (!pkg) return fail("הפרויקט לא נמצא.");

  const { data: h, error } = await s.supabase
    .from("project_ai_handoffs")
    .insert({ project_id: projectId, options: o.data, mega_prompt: pkg.megaPrompt })
    .select("id, created_at")
    .single();
  if (error) return dbError(error, "שמירת החבילה נכשלה");
  const { error: filesError } = await s.supabase
    .from("project_ai_handoff_files")
    .insert(pkg.files.map((f, i) => ({ handoff_id: h.id, name: f.name, content: f.content, position: i })));
  if (filesError) return dbError(filesError, "שמירת קבצי החבילה נכשלה");
  refresh();
  return ok({ id: h.id, files: pkg.files, megaPrompt: pkg.megaPrompt, createdAt: h.created_at }, "חבילת הפיתוח מוכנה");
}

// ===========================================================================
// "Project completed" follow-ups — each one is a suggestion the user clicks.
// ===========================================================================
export async function openSocialAlbumForProject(projectId: string): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: existing } = await s.supabase.from("social_albums").select("id").eq("project_id", projectId).limit(1).maybeSingle();
  if (existing) return ok({ id: existing.id }, "לפרויקט כבר יש תיקיית סושיאל");
  const { data: project } = await s.supabase.from("projects").select("name, client_id").eq("id", projectId).maybeSingle();
  if (!project) return fail("הפרויקט לא נמצא.");
  const { data, error } = await s.supabase
    .from("social_albums")
    .insert({ title: project.name, client_id: project.client_id, project_id: projectId })
    .select("id")
    .single();
  if (error) return dbError(error, "פתיחת התיקייה נכשלה");
  refresh();
  return ok({ id: data.id }, "נפתחה תיקיית סושיאל לפרויקט");
}

export async function moveClientToMaintenance(projectId: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: project } = await s.supabase.from("projects").select("client_id").eq("id", projectId).maybeSingle();
  if (!project) return fail("הפרויקט לא נמצא.");
  const { error } = await s.supabase.from("clients").update({ status: "maintenance", archived_at: null }).eq("id", project.client_id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, "הלקוח הועבר לתפעול ותחזוקת אתר");
}
