"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expenseCategory } from "@/lib/domain/labels";
import { notify } from "@/lib/push";
import { expenseSchema, goalSchema, strategySchema } from "@/lib/validation/schemas";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

function refresh() {
  revalidatePath("/", "layout");
}

const NO_ACCESS = fail("התפקיד שלך לא כולל גישה לאזור הזה.");

async function allowed(area: string) {
  const s = await staffClient();
  if (!s) return null;
  const { data } = await s.supabase.rpc("has_permission", { p_area: area });
  return data ? s : false;
}

const money = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

// ===========================================================================
// Expenses
// ===========================================================================
export async function createExpense(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await allowed("finances");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const p = parseForm(expenseSchema, fd);
  if (!p.success) return p.result;
  const file_id = z.uuid().safeParse(fd.get("file_id")).data ?? null;
  const { data, error } = await s.supabase.from("business_expenses").insert({ ...p.data, file_id }).select("id").single();
  if (error) return dbError(error, "שמירת ההוצאה נכשלה");
  notify("staff", "expense_added", {
    title: "נרשמה הוצאה",
    body: `${money(p.data.amount)} · ${p.data.description}${p.data.recurring !== "none" ? (p.data.recurring === "monthly" ? " (חודשי)" : " (שנתי)") : ""}`,
    url: "/business/expenses",
    tag: "expense",
  }, { actor: s.userId });
  refresh();
  return ok({ id: data.id }, `ההוצאה נרשמה · ${expenseCategory.label(p.data.category)}`);
}

export async function updateExpense(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await allowed("finances");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const p = parseForm(expenseSchema, fd);
  if (!p.success) return p.result;
  const fileRaw = fd.get("file_id");
  const patch = fileRaw === null ? p.data : { ...p.data, file_id: z.uuid().safeParse(fileRaw).data ?? null };
  const { error } = await s.supabase.from("business_expenses").update(patch).eq("id", id);
  if (error) return dbError(error, "עדכון ההוצאה נכשל");
  refresh();
  return ok({ id }, "ההוצאה עודכנה");
}

/** Stops a recurring expense from this month on (keeps its history). */
export async function endRecurringExpense(id: string): Promise<ActionResult> {
  const s = await allowed("finances");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const { data: e } = await s.supabase.from("business_expenses").select("spent_on").eq("id", id).maybeSingle();
  if (!e) return fail("ההוצאה לא נמצאה.");
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await s.supabase.from("business_expenses").update({ ended_on: today < e.spent_on ? e.spent_on : today }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, "המנוי הופסק — ההיסטוריה נשמרת");
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const s = await allowed("finances");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const { error } = await s.supabase.from("business_expenses").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined, "ההוצאה נמחקה");
}

// ===========================================================================
// Strategy & goals
// ===========================================================================
export async function saveStrategy(fd: FormData): Promise<ActionResult<null>> {
  const s = await allowed("strategy");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const p = parseForm(strategySchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("business_strategy").update({ ...p.data, updated_by: s.userId }).eq("id", true);
  if (error) return dbError(error, "שמירת האסטרטגיה נכשלה");
  refresh();
  return ok(null, "האסטרטגיה נשמרה");
}

export async function createGoal(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await allowed("strategy");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const p = parseForm(goalSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("business_goals").insert(p.data).select("id").single();
  if (error) return dbError(error, "שמירת היעד נכשלה");
  refresh();
  return ok({ id: data.id }, `היעד "${p.data.title}" נוסף`);
}

export async function updateGoal(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await allowed("strategy");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const p = parseForm(goalSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("business_goals").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון היעד נכשל");
  refresh();
  return ok({ id }, "היעד עודכן");
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  const s = await allowed("strategy");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const { error } = await s.supabase.from("business_goals").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined, "היעד נמחק");
}
