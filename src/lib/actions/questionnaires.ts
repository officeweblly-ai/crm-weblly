"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CLIENT_FIELD_MAPPINGS, conditionSchema, OPTION_TYPES, optionSchema } from "@/lib/domain/forms";
import { buildSnapshot } from "@/lib/questionnaire-snapshot";
import { questionType, type QuestionType } from "@/lib/domain/labels";
import { env } from "@/lib/env";
import { createRequestSchema, templateSchema } from "@/lib/validation/schemas";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";
import type { ServerClient } from "@/lib/supabase/server";

function refresh() {
  revalidatePath("/", "layout");
}

// ===========================================================================
// Templates
// ===========================================================================
export async function createTemplate(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(templateSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("form_templates").insert(p.data).select("id").single();
  if (error) return dbError(error, "יצירת התבנית נכשלה");
  // Every template starts with one section so the builder is never empty.
  await s.supabase.from("form_sections").insert({ template_id: data.id, title: "פרטים כלליים", position: 0 });
  refresh();
  return ok({ id: data.id }, `התבנית "${p.data.name}" נוצרה`);
}

export async function updateTemplate(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(templateSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("form_templates").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון התבנית נכשל");
  refresh();
  return ok({ id }, "פרטי התבנית נשמרו");
}

export async function duplicateTemplate(id: string): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data, error } = await s.supabase.rpc("duplicate_form_template", { p_template_id: id });
  if (error || !data) return dbError(error, "שכפול התבנית נכשל");
  refresh();
  return ok({ id: data }, "התבנית שוכפלה");
}

export async function setTemplateArchived(id: string, archived: boolean): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("form_templates").update({ is_archived: archived }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, archived ? "התבנית הועברה לארכיון" : "התבנית הוחזרה לשימוש");
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("form_templates").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת התבנית נכשלה");
  refresh();
  return ok(undefined, "התבנית נמחקה. שאלונים שכבר נשלחו ממנה נשמרו כמו שהם.");
}

// ===========================================================================
// Sections
// ===========================================================================
export async function addSection(templateId: string): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { count } = await s.supabase.from("form_sections").select("id", { count: "exact", head: true }).eq("template_id", templateId);
  const { data, error } = await s.supabase
    .from("form_sections")
    .insert({ template_id: templateId, title: `שלב ${(count ?? 0) + 1}`, position: count ?? 0 })
    .select("id")
    .single();
  if (error) return dbError(error, "הוספת השלב נכשלה");
  refresh();
  return ok({ id: data.id }, "נוסף שלב חדש");
}

const sectionPatch = z.object({ title: z.string().trim().max(200).optional(), description: z.string().trim().max(1000).nullable().optional() });

export async function updateSection(id: string, patch: z.input<typeof sectionPatch>): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = sectionPatch.safeParse(patch);
  if (!p.success) return fail("נתונים לא תקינים.");
  const { error } = await s.supabase.from("form_sections").update({ ...p.data, description: p.data.description || null }).eq("id", id);
  if (error) return dbError(error, "שמירת השלב נכשלה");
  refresh();
  return ok(undefined);
}

export async function deleteSection(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: sec } = await s.supabase.from("form_sections").select("template_id").eq("id", id).maybeSingle();
  if (!sec) return fail("השלב לא נמצא.");
  const { count } = await s.supabase.from("form_sections").select("id", { count: "exact", head: true }).eq("template_id", sec.template_id);
  if ((count ?? 0) <= 1) return fail("תבנית צריכה לפחות שלב אחד.");
  const { error } = await s.supabase.from("form_sections").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת השלב נכשלה");
  await clearDanglingConditions(s.supabase, sec.template_id);
  refresh();
  return ok(undefined, "השלב והשאלות שבו נמחקו");
}

export async function reorderSections(templateId: string, ids: string[]): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = z.array(z.uuid()).max(200).safeParse(ids);
  if (!p.success) return fail("סדר לא תקין.");
  const { error } = await s.supabase.rpc("reorder_form_sections", { p_template_id: templateId, p_ids: p.data });
  if (error) return dbError(error, "שמירת הסדר נכשלה");
  refresh();
  return ok(undefined);
}

// ===========================================================================
// Questions
// ===========================================================================
const questionInput = z
  .object({
    type: z.enum(questionType.values),
    label: z.string().trim().min(1, "יש להזין את השאלה").max(500),
    description: z.string().trim().max(1000).nullable().optional(),
    placeholder: z.string().trim().max(200).nullable().optional(),
    required: z.boolean(),
    options: z.array(optionSchema).max(50),
    condition: conditionSchema.nullable(),
    maps_to: z.enum(CLIENT_FIELD_MAPPINGS).nullable(),
    max_choices: z.number().int().min(1).max(50).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (OPTION_TYPES.includes(v.type) && v.options.length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "שאלת בחירה צריכה לפחות שתי אפשרויות" });
    }
    if (v.type === "multi_select" && v.max_choices && v.max_choices >= v.options.length) {
      ctx.addIssue({ code: "custom", path: ["max_choices"], message: "המגבלה צריכה להיות קטנה ממספר האפשרויות (או ללא מגבלה)" });
    }
    const values = v.options.map((o) => o.value);
    if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", path: ["options"], message: "יש אפשרויות כפולות" });
  });
export type QuestionInput = z.input<typeof questionInput>;

export async function addQuestion(sectionId: string, type: QuestionType): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const t = z.enum(questionType.values).safeParse(type);
  if (!t.success) return fail("סוג שאלה לא תקין.");
  const { count } = await s.supabase.from("form_questions").select("id", { count: "exact", head: true }).eq("section_id", sectionId);
  const options = OPTION_TYPES.includes(t.data)
    ? [
        { value: "option_1", label: "אפשרות 1" },
        { value: "option_2", label: "אפשרות 2" },
      ]
    : [];
  const { data, error } = await s.supabase
    .from("form_questions")
    .insert({ section_id: sectionId, type: t.data, label: "שאלה חדשה", options, position: count ?? 0 })
    .select("id")
    .single();
  if (error) return dbError(error, "הוספת השאלה נכשלה");
  refresh();
  return ok({ id: data.id }, "השאלה נוספה");
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = questionInput.safeParse(input);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return fail("יש שדות שצריך לתקן בשאלה.", fieldErrors);
  }
  if (p.data.condition?.question_id === id) return fail("שאלה לא יכולה להיות תלויה בעצמה.");
  const { error } = await s.supabase
    .from("form_questions")
    .update({
      ...p.data,
      description: p.data.description || null,
      placeholder: p.data.placeholder || null,
      options: OPTION_TYPES.includes(p.data.type) ? p.data.options : [],
      max_choices: p.data.type === "multi_select" ? (p.data.max_choices ?? null) : null,
    })
    .eq("id", id);
  if (error) return dbError(error, "שמירת השאלה נכשלה");
  refresh();
  return ok(undefined, "השאלה נשמרה");
}

export async function duplicateQuestion(id: string): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: q } = await s.supabase.from("form_questions").select("*").eq("id", id).maybeSingle();
  if (!q) return fail("השאלה לא נמצאה.");
  const { data: siblings } = await s.supabase.from("form_questions").select("id, position").eq("section_id", q.section_id).order("position");
  const { data, error } = await s.supabase
    .from("form_questions")
    .insert({
      section_id: q.section_id,
      type: q.type,
      label: `${q.label} (עותק)`,
      description: q.description,
      placeholder: q.placeholder,
      required: q.required,
      options: q.options,
      condition: q.condition,
      maps_to: null,
      max_choices: q.max_choices,
      position: q.position + 1,
    })
    .select("id")
    .single();
  if (error) return dbError(error, "שכפול השאלה נכשל");
  // Put the copy right after the original.
  const order = (siblings ?? []).map((x) => x.id);
  order.splice(order.indexOf(id) + 1, 0, data.id);
  await s.supabase.rpc("reorder_form_questions", { p_section_id: q.section_id, p_ids: order });
  refresh();
  return ok({ id: data.id }, "השאלה שוכפלה");
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: q } = await s.supabase.from("form_questions").select("section_id, form_sections(template_id)").eq("id", id).maybeSingle();
  const { error } = await s.supabase.from("form_questions").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת השאלה נכשלה");
  if (q?.form_sections) await clearDanglingConditions(s.supabase, q.form_sections.template_id);
  refresh();
  return ok(undefined, "השאלה נמחקה");
}

/** ids: the complete new order of questions in `sectionId` (may include questions moved in). */
export async function reorderQuestions(sectionId: string, ids: string[]): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = z.array(z.uuid()).max(500).safeParse(ids);
  if (!p.success) return fail("סדר לא תקין.");
  const { error } = await s.supabase.rpc("reorder_form_questions", { p_section_id: sectionId, p_ids: p.data });
  if (error) return dbError(error, "שמירת הסדר נכשלה");
  refresh();
  return ok(undefined);
}

/** Conditions pointing at deleted questions would hide questions forever — drop them. */
async function clearDanglingConditions(supabase: ServerClient, templateId: string) {
  const { data: sections } = await supabase.from("form_sections").select("id").eq("template_id", templateId);
  const sectionIds = (sections ?? []).map((s) => s.id);
  if (!sectionIds.length) return;
  const { data: questions } = await supabase.from("form_questions").select("id, condition").in("section_id", sectionIds);
  const ids = new Set((questions ?? []).map((q) => q.id));
  const broken = (questions ?? []).filter((q) => {
    const c = q.condition as { question_id?: string } | null;
    return c?.question_id && !ids.has(c.question_id);
  });
  for (const q of broken) await supabase.from("form_questions").update({ condition: null }).eq("id", q.id);
}

// ===========================================================================
// Requests (links sent to clients)
// ===========================================================================
export async function createRequest(fd: FormData): Promise<ActionResult<{ id: string; url: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(createRequestSchema, fd);
  if (!p.success) return p.result;

  const snapshot = await buildSnapshot(s.supabase, p.data.template_id);
  if (!snapshot) return fail("התבנית לא נמצאה.", { template_id: "התבנית לא נמצאה" });
  if (!snapshot.sections.length) return fail("בתבנית אין שאלות עדיין. הוסף שאלות בבונה השאלונים ונסה שוב.", { template_id: "התבנית ריקה" });

  if (p.data.project_id && p.data.client_id) {
    const { data: proj } = await s.supabase.from("projects").select("client_id").eq("id", p.data.project_id).maybeSingle();
    if (!proj || proj.client_id !== p.data.client_id) return fail("הפרויקט לא שייך ללקוח שנבחר.", { project_id: "לא שייך ללקוח" });
  }

  // 256 bits of randomness, URL-safe. Never derived from IDs.
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await s.supabase
    .from("form_submissions")
    .insert({
      token,
      template_id: p.data.template_id,
      client_id: p.data.client_id,
      project_id: p.data.project_id,
      title: p.data.title ?? snapshot.template_name,
      form_snapshot: snapshot,
    })
    .select("id")
    .single();
  if (error) return dbError(error, "יצירת הקישור נכשלה");
  refresh();
  return ok({ id: data.id, url: `${env.siteUrl()}/form/${token}` }, "הקישור לשאלון נוצר");
}

export async function markRequestSent(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase
    .from("form_submissions")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "created");
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, "השאלון סומן כנשלח");
}

export async function cancelRequest(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("form_submissions").update({ status: "cancelled" }).eq("id", id).neq("status", "completed");
  if (error) return dbError(error, "הביטול נכשל");
  refresh();
  return ok(undefined, "הקישור בוטל — הלקוח כבר לא יוכל לפתוח אותו");
}

export async function deleteRequest(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: files } = await s.supabase.from("files").select("storage_path").eq("submission_id", id);
  const { error } = await s.supabase.from("form_submissions").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  if (files?.length) await s.supabase.storage.from("crm-files").remove(files.map((f) => f.storage_path));
  refresh();
  return ok(undefined, "השאלון נמחק");
}

export async function saveSubmissionNotes(id: string, notes: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("form_submissions").update({ internal_notes: notes.trim().slice(0, 10000) || null }).eq("id", id);
  if (error) return dbError(error, "שמירת ההערות נכשלה");
  refresh();
  return ok(undefined, "ההערות הפנימיות נשמרו");
}

export async function saveAnswerNote(answerId: string, note: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("form_answers").update({ internal_note: note.trim().slice(0, 5000) || null }).eq("id", answerId);
  if (error) return dbError(error, "שמירת ההערה נכשלה");
  refresh();
  return ok(undefined, "ההערה נשמרה — התשובה המקורית לא השתנתה");
}

// ===========================================================================
// General link per template (one URL for everyone → a private copy per person)
// ===========================================================================
export async function setTemplatePublicLink(id: string, enabled: boolean): Promise<ActionResult<{ token: string | null }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const token = enabled ? randomBytes(32).toString("base64url") : null;
  const { error } = await s.supabase.from("form_templates").update({ public_token: token }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok({ token }, enabled ? "נוצר קישור כללי לשאלון" : "הקישור הכללי בוטל — מי שיש לו אותו כבר לא יוכל להתחיל שאלון חדש");
}
