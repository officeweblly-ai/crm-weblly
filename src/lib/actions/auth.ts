"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionResult } from "./result";

const loginSchema = z.object({
  email: z.email("כתובת אימייל לא תקינה"),
  password: z.string().min(1, "יש להזין סיסמה"),
});

export async function signIn(fd: FormData): Promise<ActionResult<{ next: string }>> {
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return fail("בדוק את פרטי ההתחברות.", fieldErrors);
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "invalid_credentials") return fail("האימייל או הסיסמה שגויים.");
    if (error.code === "email_not_confirmed") return fail("כתובת האימייל עוד לא אומתה.");
    return fail(`ההתחברות נכשלה: ${error.message}`);
  }
  const next = String(fd.get("next") ?? "/");
  // Only same-site relative paths — prevents open redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return { ok: true, data: { next: safeNext } };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
