"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contentHash } from "@/lib/contract-hash";
import { expenseCategory } from "@/lib/domain/labels";
import { partnerAgreementSchema } from "@/lib/domain/partners";
import { notify } from "@/lib/push";
import { expenseSchema, goalSchema, signatureSchema, strategySchema } from "@/lib/validation/schemas";
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

// ===========================================================================
// Partner agreement
// ===========================================================================
export async function createPartnerAgreement(input: { title: string; content: unknown }): Promise<ActionResult<{ id: string }>> {
  const s = await allowed("partners");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const title = z.string().trim().min(1, "חסרה כותרת").max(200).safeParse(input.title);
  const content = partnerAgreementSchema.safeParse(input.content);
  if (!title.success) return fail(title.error.issues[0].message);
  if (!content.success) return fail(content.error.issues[0].message);
  const { data, error } = await s.supabase.from("partner_agreements").insert({ title: title.data, content: content.data }).select("id").single();
  if (error) return dbError(error, "שמירת ההסכם נכשלה");
  refresh();
  return ok({ id: data.id }, "הסכם השותפים נשמר כטיוטה");
}

export async function updatePartnerAgreement(id: string, input: { title: string; content: unknown }): Promise<ActionResult<{ id: string; version: number }>> {
  const s = await allowed("partners");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const title = z.string().trim().min(1, "חסרה כותרת").max(200).safeParse(input.title);
  const content = partnerAgreementSchema.safeParse(input.content);
  if (!title.success) return fail(title.error.issues[0].message);
  if (!content.success) return fail(content.error.issues[0].message);
  const total = content.data.partners.reduce((n, p) => n + p.equity, 0);
  if (Math.abs(total - 100) > 0.01) return fail(`סך אחוזי הבעלות צריך להיות 100% (כרגע ${total}%).`);
  const { data: before } = await s.supabase.from("partner_agreements").select("version, status").eq("id", id).maybeSingle();
  const { data, error } = await s.supabase.from("partner_agreements").update({ title: title.data, content: content.data }).eq("id", id).select("id, version").single();
  if (error) return dbError(error, "שמירת ההסכם נכשלה");
  if (before && before.status !== "draft") {
    notify(content.data.partners.map((p) => p.user_id), "partner_agreement", {
      title: "הסכם השותפים השתנה",
      body: data.version > before.version ? `נפתחה גרסה ${data.version} — צריך לחתום מחדש` : "הנוסח עודכן",
      url: "/business/partners",
      tag: "partners",
    }, { actor: s.userId });
  }
  refresh();
  return ok({ id: data.id, version: data.version }, data.version > (before?.version ?? 1) ? `נשמר — נפתחה גרסה ${data.version} לחתימה מחדש` : "ההסכם נשמר");
}

export async function signPartnerAgreement(id: string, fd: FormData): Promise<ActionResult<{ signed: number; needed: number }>> {
  const s = await allowed("partners");
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const p = parseForm(signatureSchema, fd);
  if (!p.success) return p.result;
  const { data: a } = await s.supabase.from("partner_agreements").select("title, content, version").eq("id", id).maybeSingle();
  if (!a) return fail("ההסכם לא נמצא.");
  const hash = contentHash({ title: a.title, content: a.content });
  if (a.version !== p.data.version || hash !== p.data.hash) return fail("ההסכם השתנה מאז שנפתח — רעננו את העמוד וקראו שוב לפני החתימה.");
  const { data, error } = await s.supabase.rpc("sign_partner_agreement", {
    p_id: id,
    p_version: p.data.version,
    p_name: p.data.name,
    p_id_number: p.data.id_number ?? "",
    p_signature: p.data.signature,
    p_hash: hash,
  });
  if (error) {
    if (error.hint === "stale") return fail("ההסכם השתנה — רעננו את העמוד.");
    return dbError(error, "החתימה נכשלה");
  }
  const r = data as { signed: number; needed: number };
  const others = (partnerAgreementSchema.safeParse(a.content).data?.partners ?? []).map((x) => x.user_id);
  notify(others, "partner_agreement", {
    title: r.signed >= r.needed ? "הסכם השותפים נחתם על ידי כולם" : `${p.data.name} חתם/ה על הסכם השותפים`,
    body: r.signed >= r.needed ? a.title : `חתמו ${r.signed} מתוך ${r.needed} — מחכה לחתימה שלך`,
    url: "/business/partners",
    tag: "partners",
  }, { actor: s.userId });
  refresh();
  return ok(r, r.signed >= r.needed ? "ההסכם נחתם על ידי כל השותפים" : "החתימה נשמרה — מחכים לשותף השני");
}

export async function partnerAgreementHash(id: string): Promise<string | null> {
  const s = await allowed("partners");
  if (!s) return null;
  const { data: a } = await s.supabase.from("partner_agreements").select("title, content").eq("id", id).maybeSingle();
  return a ? contentHash({ title: a.title, content: a.content }) : null;
}
