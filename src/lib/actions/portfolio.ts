"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { projectType } from "@/lib/domain/labels";
import { portfolioSchema } from "@/lib/validation/schemas";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

function refresh() {
  revalidatePath("/", "layout");
}

/**
 * "Add to portfolio" — creates a draft pre-filled from what the project
 * already knows (name, type, description, tech stack, production link),
 * so nothing is typed twice. One portfolio item per project.
 */
export async function addProjectToPortfolio(projectId: string): Promise<ActionResult<{ id: string; existed: boolean }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: existing } = await s.supabase.from("portfolio_items").select("id").eq("project_id", projectId).maybeSingle();
  if (existing) return ok({ id: existing.id, existed: true }, "הפרויקט כבר נמצא בתיק העבודות");

  const [{ data: project }, { data: prod }] = await Promise.all([
    s.supabase.from("projects").select("name, project_type, description, tech_stack, client_id, clients(business_name, website)").eq("id", projectId).maybeSingle(),
    s.supabase.from("project_links").select("url").eq("project_id", projectId).eq("kind", "production").order("position").limit(1).maybeSingle(),
  ]);
  if (!project) return fail("הפרויקט לא נמצא.");
  const technologies = (project.tech_stack ?? "").split(/[,\n]/).map((t) => t.trim()).filter(Boolean).slice(0, 30);
  const { data, error } = await s.supabase
    .from("portfolio_items")
    .insert({
      project_id: projectId,
      client_id: project.client_id,
      title: project.clients?.business_name || project.name,
      client_display_name: project.clients?.business_name || null,
      category: projectType.label(project.project_type),
      summary: project.description ? project.description.slice(0, 1000) : null,
      technologies,
      site_url: prod?.url ?? project.clients?.website ?? null,
      // New items go to the end of the display order.
      position: Date.now() / 1000,
    })
    .select("id")
    .single();
  if (error) return dbError(error, "ההוספה לתיק העבודות נכשלה");
  refresh();
  return ok({ id: data.id, existed: false }, "נוסף לתיק העבודות כטיוטה — אפשר להשלים תמונות ותיאור");
}

export async function updatePortfolioItem(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(portfolioSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("portfolio_items").update(p.data).eq("id", id);
  if (error) return dbError(error, "שמירת הפריט נכשלה");
  refresh();
  return ok({ id }, p.data.status === "published" ? "נשמר ומסומן כמפורסם" : "נשמר כטיוטה");
}

export async function deletePortfolioItem(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  // Media rows go with it; the files themselves stay in the project.
  const { error } = await s.supabase.from("portfolio_items").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined, "הפריט הוסר מתיק העבודות. קבצי הפרויקט לא נמחקו");
}

/** Moves an item one step up/down in the display order (swaps positions). */
export async function movePortfolioItem(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: items } = await s.supabase.from("portfolio_items").select("id, position").order("position");
  const list = items ?? [];
  const i = list.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return ok(undefined);
  const a = list[i];
  const b = list[j];
  // Positions can collide (same timestamp); nudge to keep a strict order.
  const pa = b.position === a.position ? b.position + (direction === "up" ? -0.001 : 0.001) : b.position;
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    s.supabase.from("portfolio_items").update({ position: pa }).eq("id", a.id),
    s.supabase.from("portfolio_items").update({ position: a.position }).eq("id", b.id),
  ]);
  if (e1 || e2) return dbError(e1 ?? e2, "שינוי הסדר נכשל");
  refresh();
  return ok(undefined);
}

const mediaInput = z.object({
  item_id: z.uuid(),
  file_id: z.uuid(),
  kind: z.enum(["cover", "desktop", "mobile", "before", "after", "other"]).nullable(),
});

/** Sets (or clears, with kind = null) how a project file is used in the portfolio item. */
export async function setPortfolioMedia(input: z.input<typeof mediaInput>): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = mediaInput.safeParse(input);
  if (!p.success) return fail("נתונים לא תקינים.");
  const { item_id, file_id, kind } = p.data;
  if (kind === null) {
    const { error } = await s.supabase.from("portfolio_media").delete().eq("item_id", item_id).eq("file_id", file_id);
    if (error) return dbError(error, "העדכון נכשל");
    refresh();
    return ok(undefined, "התמונה הוסרה מהפריט");
  }
  // Only images that belong to the item's project (or were uploaded to it).
  const [{ data: item }, { data: file }] = await Promise.all([
    s.supabase.from("portfolio_items").select("project_id").eq("id", item_id).maybeSingle(),
    s.supabase.from("files").select("project_id, mime_type").eq("id", file_id).maybeSingle(),
  ]);
  if (!item || !file) return fail("הקובץ או הפריט לא נמצאו.");
  if (!file.mime_type.startsWith("image/")) return fail("אפשר לבחור רק תמונות.");
  if (item.project_id && file.project_id !== item.project_id) return fail("התמונה לא שייכת לפרויקט הזה.");
  if (kind === "cover") await s.supabase.from("portfolio_media").update({ kind: "other" }).eq("item_id", item_id).eq("kind", "cover");
  const { error } = await s.supabase.from("portfolio_media").upsert({ item_id, file_id, kind }, { onConflict: "item_id,file_id" });
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, kind === "cover" ? "נקבעה תמונת שער" : "התמונה נוספה לפריט");
}
