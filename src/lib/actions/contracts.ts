"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { contractContentSchema, contractNumber } from "@/lib/domain/contracts";
import { contractStatus } from "@/lib/domain/labels";
import { dbError, NOT_AUTHORIZED, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";
import type { Json } from "@/lib/supabase/database.types";

const saveSchema = z.object({
  id: z.uuid().optional(),
  client_id: z.uuid("יש לבחור לקוח"),
  project_id: z.uuid().nullable(),
  title: z.string().trim().min(1, "יש להזין כותרת").max(200),
  content: contractContentSchema,
});

/** Creates or updates a generated agreement (stored as a frozen JSON snapshot). */
export async function saveGeneratedContract(input: z.input<typeof saveSchema>): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = saveSchema.safeParse(input);
  if (!p.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return fail("יש שדות שצריך לתקן בהסכם.", fieldErrors);
  }
  const { id, content, ...rest } = p.data;

  if (id) {
    const { error } = await s.supabase.from("contracts").update({ ...rest, content: content as unknown as Json }).eq("id", id);
    if (error) return dbError(error, "שמירת ההסכם נכשלה");
    revalidatePath("/", "layout");
    return ok({ id }, "ההסכם נשמר");
  }

  const year = new Date().getFullYear();
  const { count } = await s.supabase.from("contracts").select("id", { count: "exact", head: true }).like("contract_number", `WB-${year}-%`);
  let seq = (count ?? 0) + 1;
  for (let attempt = 0; attempt < 5; attempt++, seq++) {
    const { data, error } = await s.supabase
      .from("contracts")
      .insert({ ...rest, content: content as unknown as Json, status: "draft", contract_date: new Date().toISOString().slice(0, 10), contract_number: contractNumber(year, seq) })
      .select("id")
      .single();
    if (!error) {
      revalidatePath("/", "layout");
      return ok({ id: data.id }, `ההסכם ${contractNumber(year, seq)} נוצר`);
    }
    if (error.code !== "23505") return dbError(error, "יצירת ההסכם נכשלה");
  }
  return fail("לא הצלחנו להקצות מספר הסכם. נסה שוב.");
}

export async function setContractStatus(id: string, status: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.enum(contractStatus.values).safeParse(status);
  if (!parsed.success) return fail("סטטוס לא תקין.");
  const { error } = await s.supabase.from("contracts").update({ status: parsed.data }).eq("id", id);
  if (error) return dbError(error, "עדכון הסטטוס נכשל");
  revalidatePath("/", "layout");
  return ok(undefined, parsed.data === "signed" ? "ההסכם סומן כחתום" : "סטטוס ההסכם עודכן");
}

/** Links an uploaded (signed) PDF to the agreement. */
export async function attachContractFile(id: string, fileId: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("contracts").update({ file_id: fileId }).eq("id", id);
  if (error) return dbError(error, "צירוף הקובץ נכשל");
  revalidatePath("/", "layout");
  return ok(undefined, "הקובץ צורף להסכם");
}
