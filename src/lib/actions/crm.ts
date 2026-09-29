"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_CHECKLIST, DEV_CHECKLIST, projectStatus, taskStatus } from "@/lib/domain/labels";
import { BUCKET } from "@/lib/storage";
import {
  clientSchema,
  contractSchema,
  noteSchema,
  paymentSchema,
  projectSchema,
  projectStatusSchema,
  taskSchema,
} from "@/lib/validation/schemas";
import { notify, recipientsFor } from "@/lib/push";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";
import type { ServerClient } from "@/lib/supabase/server";

/** Pages are server-rendered from live data; after a write, refresh everything. */
function refresh() {
  revalidatePath("/", "layout");
}

async function removeObjects(supabase: ServerClient, filter: { client_id?: string; project_id?: string }) {
  let q = supabase.from("files").select("storage_path");
  if (filter.client_id) q = q.eq("client_id", filter.client_id);
  if (filter.project_id) q = q.eq("project_id", filter.project_id);
  const { data } = await q;
  const paths = (data ?? []).map((f) => f.storage_path);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("[storage] cleanup failed", error.message);
  }
}

// ===========================================================================
// Clients
// ===========================================================================
export async function createClientRecord(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(clientSchema, fd);
  if (!p.success) return p.result;

  // Duplicate guard: same email or phone already belongs to a client.
  const digits = p.data.phone?.replace(/\D/g, "");
  const or = [p.data.email ? `email.eq."${p.data.email.replace(/"/g, "")}"` : null, digits && digits.length >= 7 ? `phone_digits.eq.${digits}` : null].filter(Boolean);
  if (or.length && fd.get("allow_duplicate") !== "1") {
    const { data: dup } = await s.supabase.from("clients").select("id, name").or(or.join(",")).limit(1).maybeSingle();
    if (dup) {
      return fail(`כבר קיים לקוח עם אותו טלפון או אימייל: ${dup.name}. אם זה בכוונה, סמן "ליצור בכל זאת".`, {
        allow_duplicate: dup.id,
      });
    }
  }

  const { data, error } = await s.supabase.from("clients").insert(p.data).select("id").single();
  if (error) return dbError(error, "יצירת הלקוח נכשלה");
  notify("staff", "client_created", { title: "לקוח חדש נפתח", body: p.data.business_name ? `${p.data.name} · ${p.data.business_name}` : p.data.name, url: `/clients/${data.id}`, tag: "client" }, { actor: s.userId });
  refresh();
  return ok({ id: data.id }, `תיק הלקוח "${p.data.name}" נפתח`);
}

export async function updateClientRecord(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(clientSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase
    .from("clients")
    .update({ ...p.data, archived_at: p.data.status === "archived" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return dbError(error, "עדכון הלקוח נכשל");
  refresh();
  return ok({ id }, "פרטי הלקוח עודכנו");
}

export async function setClientArchived(id: string, archived: boolean): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase
    .from("clients")
    .update({ status: archived ? "archived" : "active", archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, archived ? "הלקוח הועבר לארכיון" : "הלקוח הוחזר מהארכיון");
}

export async function setClientStatus(id: string, status: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = clientSchema.shape.status.safeParse(status);
  if (!parsed.success) return fail("סטטוס לא תקין.");
  const { error } = await s.supabase
    .from("clients")
    .update({ status: parsed.data, archived_at: parsed.data === "archived" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return dbError(error, "עדכון הסטטוס נכשל");
  refresh();
  return ok(undefined, "סטטוס הלקוח עודכן");
}

export async function deleteClientRecord(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  await removeObjects(s.supabase, { client_id: id });
  const { error } = await s.supabase.from("clients").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת הלקוח נכשלה");
  refresh();
  return ok(undefined, "הלקוח וכל הנתונים שלו נמחקו");
}

// ===========================================================================
// Projects
// ===========================================================================
export async function createProject(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(projectSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("projects").insert(p.data).select("id").single();
  if (error) return dbError(error, "יצירת הפרויקט נכשלה");
  refresh();
  return ok({ id: data.id }, `הפרויקט "${p.data.name}" נוצר`);
}

export async function updateProject(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(projectSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("projects").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון הפרויקט נכשל");
  refresh();
  return ok({ id }, "הפרויקט עודכן");
}

/** Used by the status control and the Kanban board. */
export async function setProjectStatus(input: z.input<typeof projectStatusSchema>): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = projectStatusSchema.safeParse(input);
  if (!p.success) return fail("סטטוס לא תקין.");
  const { data: before } = await s.supabase.from("projects").select("status").eq("id", p.data.id).maybeSingle();
  const { data: row, error } = await s.supabase
    .from("projects")
    .update({ status: p.data.status, ...(p.data.board_position !== undefined ? { board_position: p.data.board_position } : {}) })
    .eq("id", p.data.id)
    .select("id, name, owner_id")
    .maybeSingle();
  const data = row ? { ...row, previous: before?.status } : null;
  if (error) return dbError(error, "עדכון הסטטוס נכשל");
  if (!data) return fail("הפרויקט לא נמצא — ייתכן שנמחק.");
  if (data.previous !== p.data.status) {
    notify(async () => (data.owner_id ? [data.owner_id] : "staff"), "project_status", {
      title: `${data.name}: ${projectStatus.label(p.data.status)}`,
      body: "הפרויקט עבר לשלב חדש",
      url: `/projects/${data.id}`,
      tag: `project-${data.id}`,
    }, { actor: s.userId });
  }
  refresh();
  return ok(undefined, "סטטוס הפרויקט עודכן");
}

export async function updateNextAction(id: string, nextAction: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const value = nextAction.trim().slice(0, 300) || null;
  const { error } = await s.supabase.from("projects").update({ next_action: value }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, "הפעולה הבאה עודכנה");
}

export async function deleteProject(id: string): Promise<ActionResult<{ clientId: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: project } = await s.supabase.from("projects").select("client_id").eq("id", id).maybeSingle();
  if (!project) return fail("הפרויקט לא נמצא.");
  await removeObjects(s.supabase, { project_id: id });
  const { error } = await s.supabase.from("projects").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת הפרויקט נכשלה");
  refresh();
  return ok({ clientId: project.client_id }, "הפרויקט נמחק");
}

// ===========================================================================
// Payments
// ===========================================================================
/** A deposit on a project that hasn't reached design yet → offer (never force) moving it to design. */
const BEFORE_DESIGN = ["lead", "questionnaire_sent", "questionnaire_received", "awaiting_deposit"];

export async function createPayment(fd: FormData): Promise<ActionResult<{ id: string; suggestDesign: { projectId: string; name: string } | null }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(paymentSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("payments").insert(p.data).select("id").single();
  if (error) return dbError(error, "רישום התשלום נכשל");
  let suggestDesign: { projectId: string; name: string } | null = null;
  const { data: project } = await s.supabase.from("projects").select("id, name, status").eq("id", p.data.project_id).maybeSingle();
  if (p.data.kind === "deposit" && project && BEFORE_DESIGN.includes(project.status)) suggestDesign = { projectId: project.id, name: project.name };
  if (project) {
    const userId = s.userId;
    // The partner who recorded it already knows.
    notify(() => recipientsFor("finance"), "payment_added", {
      title: p.data.kind === "deposit" ? "התקבלה מקדמה" : "נרשם תשלום",
      body: `${new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(p.data.amount)} · ${project.name}`,
      url: `/projects/${project.id}#payments`,
      tag: `payment-${data.id}`,
    }, { actor: userId });
  }
  refresh();
  return ok({ id: data.id, suggestDesign }, "התשלום נרשם — היתרה עודכנה");
}

export async function updatePayment(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(paymentSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("payments").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון התשלום נכשל");
  refresh();
  return ok({ id }, "התשלום עודכן — היתרה חושבה מחדש");
}

export async function deletePayment(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("payments").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת התשלום נכשלה");
  refresh();
  return ok(undefined, "התשלום נמחק — היתרה חושבה מחדש");
}

// ===========================================================================
// Tasks
// ===========================================================================
export async function createTask(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(taskSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("tasks").insert(p.data).select("id").single();
  if (error) return dbError(error, "יצירת המשימה נכשלה");
  await notifyAssignee(s, p.data.assigned_to, p.data.title, p.data.project_id, p.data.due_date);
  await notifyAssignee(s, p.data.secondary_assigned_to, p.data.title, p.data.project_id, p.data.due_date);
  refresh();
  return ok({ id: data.id }, "המשימה נוספה");
}

export async function updateTask(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(taskSchema, fd);
  if (!p.success) return p.result;
  const { data: before } = await s.supabase.from("tasks").select("assigned_to, secondary_assigned_to").eq("id", id).maybeSingle();
  const { error } = await s.supabase.from("tasks").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון המשימה נכשל");
  if (before && before.assigned_to !== p.data.assigned_to) await notifyAssignee(s, p.data.assigned_to, p.data.title, p.data.project_id, p.data.due_date);
  if (before && before.secondary_assigned_to !== p.data.secondary_assigned_to) await notifyAssignee(s, p.data.secondary_assigned_to, p.data.title, p.data.project_id, p.data.due_date);
  refresh();
  return ok({ id }, "המשימה עודכנה");
}

/** Push to whoever just got the task — unless they assigned it to themselves. */
async function notifyAssignee(s: { supabase: ServerClient; userId: string }, assignee: string | null, title: string, projectId: string | null, due: string | null) {
  if (!assignee || assignee === s.userId) return;
  const [{ data: me }, { data: project }] = await Promise.all([
    s.supabase.from("profiles").select("full_name").eq("id", s.userId).maybeSingle(),
    projectId ? s.supabase.from("projects").select("name").eq("id", projectId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const by = me?.full_name?.split(" ")[0];
  notify([assignee], "task_assigned", {
    title: "משימה חדשה בשבילך",
    body: [title, project?.name, due ? `יעד: ${due.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · ") + (by ? ` (מ${by})` : ""),
    url: projectId ? `/projects/${projectId}#tasks` : "/tasks",
    tag: "task",
  }, { actor: s.userId });
}

export async function setTaskStatus(id: string, status: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.enum(taskStatus.values).safeParse(status);
  if (!parsed.success) return fail("סטטוס לא תקין.");
  const { data: task, error } = await s.supabase.from("tasks").update({ status: parsed.data }).eq("id", id).select("title, created_by, assigned_to, project_id").maybeSingle();
  if (error) return dbError(error, "עדכון המשימה נכשל");
  if (task && parsed.data === "done") {
    // Whoever opened it (or owned it) hears that it's done — never the person who closed it.
    const to = [task.created_by, task.assigned_to].filter((x): x is string => Boolean(x));
    if (to.length) {
      notify(to, "task_completed", {
        title: "משימה הושלמה",
        body: task.title,
        url: task.project_id ? `/projects/${task.project_id}#tasks` : "/tasks",
        tag: "task-done",
      }, { actor: s.userId });
    }
  }
  refresh();
  return ok(undefined, parsed.data === "done" ? "המשימה סומנה כהושלמה" : `סטטוס המשימה: ${taskStatus.label(parsed.data)}`);
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("tasks").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת המשימה נכשלה");
  refresh();
  return ok(undefined, "המשימה נמחקה");
}

/** Adds the chosen checklist items to a project (skips existing titles). */
export async function addChecklist(projectId: string, titles: string[], list: "default" | "dev" = "default"): Promise<ActionResult<{ added: number }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const allowed = new Map((list === "dev" ? DEV_CHECKLIST : DEFAULT_CHECKLIST).map((c, i) => [c.title, { ...c, i }]));
  const chosen = titles.filter((t) => allowed.has(t));
  if (!chosen.length) return fail("לא נבחרו משימות.");
  const { data: existing } = await s.supabase.from("tasks").select("title").eq("project_id", projectId);
  const have = new Set((existing ?? []).map((t) => t.title));
  const base = Date.now() / 1000;
  const rows = chosen
    .filter((t) => !have.has(t))
    .map((t) => {
      const c = allowed.get(t)!;
      return { title: t, priority: c.priority, project_id: projectId, position: base + c.i };
    });
  if (!rows.length) return ok({ added: 0 }, "כל המשימות שנבחרו כבר קיימות בפרויקט");
  const { error } = await s.supabase.from("tasks").insert(rows);
  if (error) return dbError(error, "הוספת הצ׳קליסט נכשלה");
  refresh();
  return ok({ added: rows.length }, `נוספו ${rows.length} משימות לפרויקט`);
}

/** Pickers for the task form: active staff + other open tasks of the same project. */
export async function taskFormOptions(
  projectId: string | null,
  taskId?: string,
): Promise<ActionResult<{ staff: { value: string; label: string }[]; tasks: { value: string; label: string }[]; owners: Record<string, string>; projectOwner: string | null }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const [{ data: staff }, { data: tasks }, { data: resp }, { data: project }] = await Promise.all([
    s.supabase.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name"),
    projectId ? s.supabase.from("tasks").select("id, title").eq("project_id", projectId).neq("status", "done").order("position").limit(200) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    s.supabase.from("team_responsibilities").select("category, assigned_to").eq("is_active", true).not("assigned_to", "is", null).order("position"),
    projectId ? s.supabase.from("projects").select("owner_id").eq("id", projectId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // Category → who owns it (first active responsibility wins), for the assignee suggestion.
  const owners: Record<string, string> = {};
  for (const r of resp ?? []) if (r.assigned_to && !owners[r.category]) owners[r.category] = r.assigned_to;
  return ok({
    staff: (staff ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email })),
    tasks: (tasks ?? []).filter((t) => t.id !== taskId).map((t) => ({ value: t.id, label: t.title })),
    owners,
    projectOwner: project?.owner_id ?? null,
  });
}

// ---------------------------------------------------------------------------
// Sub-tasks (checklist inside a task)
// ---------------------------------------------------------------------------
export async function addChecklistItem(taskId: string, title: string): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const clean = title.trim().slice(0, 300);
  if (!clean) return fail("יש להזין תת-משימה.");
  const { data, error } = await s.supabase.from("task_checklist_items").insert({ task_id: taskId, title: clean }).select("id").single();
  if (error) return dbError(error, "הוספת תת-המשימה נכשלה");
  refresh();
  return ok({ id: data.id });
}

export async function toggleChecklistItem(id: string, isDone: boolean): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("task_checklist_items").update({ is_done: isDone }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined);
}

export async function deleteChecklistItem(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("task_checklist_items").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined);
}

// ===========================================================================
// Notes
// ===========================================================================
export async function createNote(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(noteSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("notes").insert(p.data).select("id").single();
  if (error) return dbError(error, "שמירת ההערה נכשלה");
  refresh();
  return ok({ id: data.id }, "ההערה נשמרה");
}

export async function updateNote(id: string, input: { body?: string; is_pinned?: boolean; share_with_ai?: boolean }): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const patch: { body?: string; is_pinned?: boolean; share_with_ai?: boolean } = {};
  if (input.share_with_ai !== undefined) patch.share_with_ai = input.share_with_ai;
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) return fail("ההערה ריקה.");
    patch.body = body.slice(0, 10000);
  }
  if (input.is_pinned !== undefined) patch.is_pinned = input.is_pinned;
  const { error } = await s.supabase.from("notes").update(patch).eq("id", id);
  if (error) return dbError(error, "עדכון ההערה נכשל");
  refresh();
  if (input.share_with_ai !== undefined) return ok(undefined, input.share_with_ai ? "ההערה תיכלל בחבילת הפיתוח ל-AI" : "ההערה לא תיכלל בחבילת ה-AI");
  return ok(undefined, input.is_pinned === undefined ? "ההערה עודכנה" : input.is_pinned ? "ההערה הוצמדה" : "ההצמדה בוטלה");
}

export async function deleteNote(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("notes").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת ההערה נכשלה");
  refresh();
  return ok(undefined, "ההערה נמחקה");
}

// ===========================================================================
// Contracts
// ===========================================================================
export async function createContract(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(contractSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("contracts").insert(p.data).select("id").single();
  if (error) return dbError(error, "שמירת החוזה נכשלה");
  refresh();
  return ok({ id: data.id }, `החוזה "${p.data.title}" נשמר`);
}

export async function updateContract(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(contractSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("contracts").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון החוזה נכשל");
  refresh();
  return ok({ id }, "החוזה עודכן");
}

export async function deleteContract(id: string, withFile: boolean): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: contract } = await s.supabase.from("contracts").select("file_id").eq("id", id).maybeSingle();
  if (!contract) return fail("החוזה לא נמצא.");
  const { error } = await s.supabase.from("contracts").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת החוזה נכשלה");
  if (withFile && contract.file_id) {
    const { data: file } = await s.supabase.from("files").select("storage_path").eq("id", contract.file_id).maybeSingle();
    if (file) {
      await s.supabase.from("files").delete().eq("id", contract.file_id);
      await s.supabase.storage.from(BUCKET).remove([file.storage_path]);
    }
  }
  refresh();
  return ok(undefined, "החוזה נמחק");
}

// ===========================================================================
// V4 — questionnaire details that differ from the client file
// ===========================================================================
const SUGGESTIBLE = [
  "name", "business_name", "phone", "email", "website", "company_id", "address", "city", "industry",
  "contact_role", "alt_contact_name", "alt_contact_phone", "alt_contact_email",
] as const;

/** Applies the chosen suggested values to the client and clears them from the submission. */
export async function resolveClientSuggestions(submissionId: string, apply: string[]): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: sub } = await s.supabase.from("form_submissions").select("client_id, client_suggestions").eq("id", submissionId).maybeSingle();
  if (!sub?.client_id) return fail("השאלון לא נמצא.");
  const suggested = (sub.client_suggestions ?? {}) as Record<string, string>;
  const patch: Partial<Record<(typeof SUGGESTIBLE)[number], string>> = {};
  for (const f of apply) {
    const key = SUGGESTIBLE.find((k) => k === f);
    if (key && typeof suggested[key] === "string") patch[key] = suggested[key];
  }
  if (Object.keys(patch).length) {
    const { error } = await s.supabase.from("clients").update(patch).eq("id", sub.client_id);
    if (error) return dbError(error, "עדכון הלקוח נכשל");
  }
  await s.supabase.from("form_submissions").update({ client_suggestions: {} }).eq("id", submissionId);
  refresh();
  return ok(undefined, Object.keys(patch).length ? "פרטי הלקוח עודכנו מהשאלון" : "הפרטים מהשאלון נשמרו רק בשאלון");
}
