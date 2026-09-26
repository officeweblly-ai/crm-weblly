import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { fail, type ActionResult } from "./result";

/**
 * Every mutation goes through here: it verifies an active staff session and
 * hands back an RLS-scoped client. RLS is still the final authority.
 */
export async function staffClient(): Promise<{ supabase: ServerClient; userId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) return null;
  return { supabase, userId };
}

export const NOT_AUTHORIZED = fail("אין לך הרשאה לבצע את הפעולה. נסה להתחבר מחדש.");

/** FormData → plain object; empty strings become undefined. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const val = v.trim() === "" ? undefined : v;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      out[key] = [...((out[key] as string[]) ?? []), ...(val === undefined ? [] : [val])];
    } else {
      out[k] = val;
    }
  }
  return out;
}

export function parseForm<S extends z.ZodType>(schema: S, input: FormData | Record<string, unknown>):
  | { success: true; data: z.infer<S> }
  | { success: false; result: ActionResult<never> } {
  const obj = input instanceof FormData ? formToObject(input) : input;
  const parsed = schema.safeParse(obj);
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { success: false, result: fail("יש שדות שצריך לתקן — הם מסומנים באדום.", fieldErrors) };
}

/** Maps database errors to messages that say what actually went wrong. */
export function dbError(error: PostgrestError | null, fallback: string): ActionResult<never> {
  if (!error) return fail(fallback);
  console.error("[db]", error.code, error.message, error.details);
  switch (error.code) {
    case "23505":
      return fail("קיימת כבר רשומה עם אותם פרטים.");
    case "23503":
      return fail("הפעולה נכשלה כי הרשומה מקושרת לנתונים אחרים שלא קיימים או נמחקו.");
    case "23514":
      if (error.message.includes("deposit_le_total")) return fail("המקדמה לא יכולה להיות גבוהה מהמחיר הכולל.", { deposit_amount: "המקדמה גבוהה מהמחיר הכולל" });
      if (error.message.includes("dates_order")) return fail("תאריך היעד חייב להיות אחרי תאריך ההתחלה.", { deadline: "לפני תאריך ההתחלה" });
      if (error.message.includes("email")) return fail("כתובת האימייל לא תקינה.", { email: "אימייל לא תקין" });
      return fail("אחד הערכים לא עומד בכללי המערכת. בדוק את הסכומים והתאריכים.");
    case "42501":
      return fail("אין לך הרשאה לבצע את הפעולה.");
    case "PGRST116":
      return fail("הרשומה לא נמצאה — ייתכן שנמחקה.");
    default:
      return fail(`${fallback} (${error.message})`);
  }
}
