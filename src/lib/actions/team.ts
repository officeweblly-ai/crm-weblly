"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { memberProfileSchema, responsibilitySchema, teamRoleSchema } from "@/lib/validation/schemas";
import { notify } from "@/lib/push";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

/**
 * Team → partners and responsibilities. A person edits their own working
 * profile; the owner can edit anyone's (RLS: update_profiles policy).
 * Responsibilities are shared data every partner can maintain.
 */
function refresh() {
  revalidatePath("/", "layout");
}

export async function updateMemberProfile(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(memberProfileSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("profiles").update(p.data).eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error, "שמירת הפרטים נכשלה");
  if (!data) return fail("רק בעל החשבון יכול לערוך פרטים של שותף אחר.");
  refresh();
  return ok({ id }, "הפרטים נשמרו");
}

export async function createResponsibility(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(responsibilitySchema, fd);
  if (!p.success) return p.result;
  // New areas always start active (the switch lives in the list).
  const { data, error } = await s.supabase.from("team_responsibilities").insert({ ...p.data, is_active: true }).select("id").single();
  if (error) return dbError(error, "שמירת תחום האחריות נכשלה");
  refresh();
  return ok({ id: data.id }, `תחום האחריות "${p.data.title}" נוסף`);
}

export async function updateResponsibility(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(responsibilitySchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("team_responsibilities").update(p.data).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok({ id }, "תחום האחריות עודכן");
}

/** Quick reassignment from the list (select → person). */
export async function assignResponsibility(id: string, userId: string | null): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.uuid().nullable().safeParse(userId || null);
  if (!parsed.success) return fail("בחירה לא תקינה.");
  const { error } = await s.supabase.from("team_responsibilities").update({ assigned_to: parsed.data }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, parsed.data ? "האחריות הועברה" : "האחריות הוסרה מהשותף");
}

export async function toggleResponsibility(id: string, active: boolean): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("team_responsibilities").update({ is_active: active }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, active ? "תחום האחריות הופעל" : "תחום האחריות הושבת");
}

export async function deleteResponsibility(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("team_responsibilities").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined, "תחום האחריות נמחק");
}

/** Sets who owns a project (used for routing change requests and suggestions). */
export async function setProjectOwner(projectId: string, userId: string | null): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.uuid().nullable().safeParse(userId || null);
  if (!parsed.success) return fail("בחירה לא תקינה.");
  const { error } = await s.supabase.from("projects").update({ owner_id: parsed.data }).eq("id", projectId);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, parsed.data ? "נקבע אחראי לפרויקט" : "הוסר האחראי מהפרויקט");
}

/** Starter list of work areas (unassigned) — the partners decide who owns what. */
export async function seedResponsibilities(): Promise<ActionResult<{ added: number }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { count } = await s.supabase.from("team_responsibilities").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return ok({ added: 0 }, "כבר יש תחומי אחריות");
  const base = Date.now() / 1000;
  const starter = [
    { title: "פיתוח אתרים ומערכות", category: "development", description: "בנייה, Claude Code / Codex, תיקונים טכניים" },
    { title: "העלאה לאוויר", category: "deployment", description: "Vercel, בדיקות אחרונות, Production" },
    { title: "דומיינים ו-DNS", category: "domains", description: null },
    { title: "תקשורת עם לקוחות", category: "client_communication", description: "מענה, Follow-ups, חומרים מהלקוח, אישורים" },
    { title: "לידים ומכירות", category: "sales", description: null },
    { title: "הצעות מחיר", category: "proposals", description: "מאפיון להצעה, מעקב אחרי תשובה" },
    { title: "חוזים", category: "contracts", description: "הכנה, שליחה לחתימה" },
    { title: "גבייה", category: "finance", description: "מקדמות, יתרות, תשלומים באיחור" },
    { title: "ניהול פרויקטים", category: "project_management", description: "פעולה הבאה, לוחות זמנים" },
    { title: "תוכן ותיק עבודות", category: "content", description: null },
    { title: "סושיאל", category: "social", description: "תיקיות סושיאל, רילס" },
  ].map((r, i) => ({ ...r, position: base + i }));
  const { error } = await s.supabase.from("team_responsibilities").insert(starter);
  if (error) return dbError(error, "יצירת הרשימה נכשלה");
  refresh();
  return ok({ added: starter.length }, "נוספה רשימת התחלה — עכשיו בוחרים מי אחראי על כל תחום");
}

// ===========================================================================
// V4 — custom roles & permissions (owner-managed; RLS enforces it too)
// ===========================================================================
async function ownerClient() {
  const s = await staffClient();
  if (!s) return null;
  const { data: isOwner } = await s.supabase.rpc("is_owner");
  return isOwner ? s : null;
}

const ONLY_OWNER = fail("רק בעל החשבון יכול לנהל תפקידים והרשאות.");

function roleInput(fd: FormData) {
  return {
    name: fd.get("name"),
    description: fd.get("description") || undefined,
    color: fd.get("color") || undefined,
    permissions: fd.getAll("permissions").map(String),
  };
}

export async function createTeamRole(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await ownerClient();
  if (!s) return ONLY_OWNER;
  const p = parseForm(teamRoleSchema, roleInput(fd));
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("team_roles").insert(p.data).select("id").single();
  if (error) return error.code === "23505" ? fail("כבר יש תפקיד בשם הזה.", { name: "שם קיים" }) : dbError(error, "שמירת התפקיד נכשלה");
  refresh();
  return ok({ id: data.id }, `התפקיד "${p.data.name}" נוצר`);
}

export async function updateTeamRole(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await ownerClient();
  if (!s) return ONLY_OWNER;
  const p = parseForm(teamRoleSchema, roleInput(fd));
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("team_roles").update(p.data).eq("id", id);
  if (error) return error.code === "23505" ? fail("כבר יש תפקיד בשם הזה.", { name: "שם קיים" }) : dbError(error, "עדכון התפקיד נכשל");
  const { data: holders } = await s.supabase.from("profiles").select("id").eq("team_role_id", id);
  if (holders?.length) {
    notify(holders.map((h) => h.id), "team_changes", { title: "ההרשאות שלך עודכנו", body: `התפקיד "${p.data.name}" עודכן`, url: "/team", tag: "team" }, { actor: s.userId });
  }
  refresh();
  return ok({ id }, "התפקיד עודכן");
}

export async function deleteTeamRole(id: string): Promise<ActionResult> {
  const s = await ownerClient();
  if (!s) return ONLY_OWNER;
  const { error } = await s.supabase.from("team_roles").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת התפקיד נכשלה");
  refresh();
  return ok(undefined, "התפקיד נמחק — מי שהחזיק בו קיבל גישה מלאה עד שיוגדר לו תפקיד חדש");
}

export async function assignTeamRole(userId: string, roleId: string | null): Promise<ActionResult> {
  const s = await ownerClient();
  if (!s) return ONLY_OWNER;
  const parsed = z.object({ userId: z.uuid(), roleId: z.uuid().nullable() }).safeParse({ userId, roleId: roleId || null });
  if (!parsed.success) return fail("בחירה לא תקינה.");
  const { data: role } = parsed.data.roleId ? await s.supabase.from("team_roles").select("name").eq("id", parsed.data.roleId).maybeSingle() : { data: null };
  const { error } = await s.supabase.from("profiles").update({ team_role_id: parsed.data.roleId }).eq("id", parsed.data.userId);
  if (error) return dbError(error, "שיוך התפקיד נכשל");
  notify([parsed.data.userId], "team_changes", {
    title: role ? `התפקיד שלך: ${role.name}` : "קיבלת גישה מלאה",
    body: role ? "ההרשאות שלך במערכת עודכנו" : "התפקיד הוסר — יש לך גישה לכל האזורים",
    url: "/team",
    tag: "team",
  }, { actor: s.userId });
  refresh();
  return ok(undefined, role ? `שויך התפקיד "${role.name}"` : "התפקיד הוסר");
}

/** Starter roles for a small studio — editable, deletable. */
export async function seedTeamRoles(): Promise<ActionResult> {
  const s = await ownerClient();
  if (!s) return ONLY_OWNER;
  const { count } = await s.supabase.from("team_roles").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return ok(undefined, "כבר יש תפקידים");
  const base = Date.now() / 1000;
  const { error } = await s.supabase.from("team_roles").insert([
    { name: "שותף/ה", description: "גישה לכל האזורים", color: "#3346c4", permissions: ["leads", "proposals", "contracts", "finances", "strategy", "partners", "social", "questionnaires"], position: base },
    { name: "מפתח/ת", description: "פרויקטים ומשימות, בלי כספים", color: "#1d7a52", permissions: ["questionnaires"], position: base + 1 },
    { name: "מעצב/ת", description: "פרויקטים, סושיאל ותיק עבודות", color: "#9a5b00", permissions: ["social", "questionnaires"], position: base + 2 },
    { name: "מכירות", description: "לידים, הצעות מחיר וחוזים", color: "#b4333a", permissions: ["leads", "proposals", "contracts"], position: base + 3 },
  ]);
  if (error) return dbError(error, "יצירת התפקידים נכשלה");
  refresh();
  return ok(undefined, "נוספו 4 תפקידים לדוגמה — אפשר לשנות הכול");
}
