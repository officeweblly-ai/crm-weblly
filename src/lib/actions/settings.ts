"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { profileSchema, settingsSchema } from "@/lib/validation/schemas";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

export async function updateWorkspace(fd: FormData): Promise<ActionResult<null>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(settingsSchema, fd);
  if (!p.success) return p.result;
  const { data, error } = await s.supabase.from("workspace_settings").update(p.data).eq("id", true).select("id").maybeSingle();
  if (error) return dbError(error, "שמירת ההגדרות נכשלה");
  if (!data) return fail("רק בעל החשבון יכול לשנות את הגדרות העסק.");
  revalidatePath("/", "layout");
  return ok(null, "הגדרות העסק נשמרו");
}

export async function updateMyProfile(fd: FormData): Promise<ActionResult<null>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(profileSchema, fd);
  if (!p.success) return p.result;
  const { error } = await s.supabase.from("profiles").update(p.data).eq("id", s.userId);
  if (error) return dbError(error, "שמירת הפרופיל נכשלה");
  revalidatePath("/", "layout");
  return ok(null, "הפרופיל עודכן");
}

export async function setMemberAccess(id: string, patch: { is_active?: boolean; role?: "admin" | "member" }): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.object({ is_active: z.boolean().optional(), role: z.enum(["admin", "member"]).optional() }).safeParse(patch);
  if (!parsed.success) return fail("נתונים לא תקינים.");
  const { error } = await s.supabase.from("profiles").update(parsed.data).eq("id", id);
  if (error) {
    if (error.code === "42501") return fail("רק בעל החשבון יכול לשנות הרשאות, ואי אפשר לשנות את ההרשאות של עצמך.");
    return dbError(error, "העדכון נכשל");
  }
  revalidatePath("/settings");
  return ok(undefined, parsed.data.is_active === undefined ? "ההרשאה עודכנה" : parsed.data.is_active ? "המשתמש הופעל" : "הגישה של המשתמש הושבתה");
}

const memberSchema = z.object({
  email: z.email("כתובת אימייל לא תקינה").transform((v) => v.trim().toLowerCase()),
  full_name: z.string().trim().min(1, "יש להזין שם").max(120),
  password: z.string().min(10, "סיסמה זמנית של 10 תווים לפחות").max(72),
  role: z.enum(["admin", "member"]).default("admin"),
});

/** Owner adds a teammate (e.g. a business partner). The account is active immediately. */
export async function addTeamMember(fd: FormData): Promise<ActionResult<null>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: isOwner } = await s.supabase.rpc("is_owner");
  if (!isOwner) return fail("רק בעל החשבון יכול להוסיף משתמשים.");
  const p = parseForm(memberSchema, fd);
  if (!p.success) return p.result;

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: p.data.email,
    password: p.data.password,
    email_confirm: true,
    user_metadata: { full_name: p.data.full_name },
  });
  if (error || !data.user) {
    if (error?.message.toLowerCase().includes("already")) return fail("כבר קיים משתמש עם האימייל הזה.", { email: "קיים כבר" });
    return fail(`יצירת המשתמש נכשלה: ${error?.message ?? "שגיאה לא ידועה"}`);
  }
  const { error: pErr } = await admin.from("profiles").update({ is_active: true, role: p.data.role, full_name: p.data.full_name }).eq("id", data.user.id);
  if (pErr) return dbError(pErr, "המשתמש נוצר אבל ההפעלה נכשלה — הפעל אותו ידנית ברשימה");
  revalidatePath("/settings");
  return ok(null, `${p.data.full_name} נוסף/ה לצוות ויכול/ה להתחבר עכשיו`);
}

export async function changeMyPassword(fd: FormData): Promise<ActionResult<null>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 10) return fail("הסיסמה צריכה להיות באורך 10 תווים לפחות.", { password: "לפחות 10 תווים" });
  if (password !== confirm) return fail("הסיסמאות לא תואמות.", { confirm: "לא תואם" });
  const { error } = await s.supabase.auth.updateUser({ password });
  if (error) return fail(`שינוי הסיסמה נכשל: ${error.message}`);
  return ok(null, "הסיסמה שונתה");
}

/** Owner-only: removes every demo row (is_demo) with everything under it, including stored files. */
export async function clearDemoData(): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: isOwner } = await s.supabase.rpc("is_owner");
  if (!isOwner) return fail("רק בעל החשבון יכול למחוק נתוני דמו.");
  const { data: demoClients } = await s.supabase.from("clients").select("id").eq("is_demo", true);
  const ids = (demoClients ?? []).map((c) => c.id);
  if (ids.length) {
    const { data: files } = await s.supabase.from("files").select("storage_path").in("client_id", ids);
    const paths = (files ?? []).map((f) => f.storage_path);
    for (let i = 0; i < paths.length; i += 100) await s.supabase.storage.from("crm-files").remove(paths.slice(i, i + 100));
    const { error } = await s.supabase.from("clients").delete().in("id", ids);
    if (error) return dbError(error, "המחיקה נכשלה");
  }
  await s.supabase.from("leads").delete().eq("is_demo", true);
  await s.supabase.from("form_templates").delete().eq("is_demo", true);
  revalidatePath("/", "layout");
  return ok(undefined, "נתוני הדמו נמחקו — נשארו רק הנתונים האמיתיים שלך");
}
