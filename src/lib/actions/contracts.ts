"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { contractContentSchema, contractNumber } from "@/lib/domain/contracts";
import { contentHash } from "@/lib/contract-hash";
import { env } from "@/lib/env";
import { notify, recipientsFor } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { signatureSchema } from "@/lib/validation/schemas";
import { contractStatus } from "@/lib/domain/labels";
import { dbError, formToObject, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";
import type { Json } from "@/lib/supabase/database.types";

const saveSchema = z.object({
  id: z.uuid().optional(),
  client_id: z.uuid("יש לבחור לקוח"),
  project_id: z.uuid().nullable(),
  proposal_id: z.uuid().nullable().optional(),
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
    const { data: before } = await s.supabase.from("contracts").select("version, status").eq("id", id).maybeSingle();
    const { data: after, error } = await s.supabase
      .from("contracts")
      .update({ ...rest, content: content as unknown as Json })
      .eq("id", id)
      .select("version")
      .single();
    if (error) return dbError(error, "שמירת ההסכם נכשלה");
    revalidatePath("/", "layout");
    // Editing a sent/signed agreement never touches that copy (DB trigger): it becomes the next version.
    if (before && after.version > before.version) {
      return ok({ id }, `נשמרה גרסה ${after.version} כטיוטה. ${before.status === "signed" ? "הגרסה החתומה נשמרה כמו שהיא." : "הקישור הקודם לחתימה הושבת עד לשליחה מחדש."}`);
    }
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


// ===========================================================================
// Digital signature
// ===========================================================================
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Freezes the current text as a version (immutable), creates the secure link
 * once, and marks the agreement as sent. Re-sending after edits sends the new
 * version on the same link.
 */
export async function sendContractForSignature(id: string): Promise<ActionResult<{ url: string; version: number }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: c } = await s.supabase.from("contracts").select("id, title, status, version, content, sign_token").eq("id", id).maybeSingle();
  if (!c) return fail("ההסכם לא נמצא.");
  if (!c.content) return fail("חתימה דיגיטלית זמינה להסכם שנוצר במערכת. להסכם שהועלה כקובץ — מעלים עותק חתום.");
  if (c.status === "signed") return fail("ההסכם כבר נחתם. כדי לשנות — ערכו אותו, ותיווצר גרסה חדשה.");
  if (c.status === "cancelled") return fail("ההסכם בוטל.");
  const parsed = contractContentSchema.safeParse(c.content);
  if (!parsed.success) return fail("יש בהסכם שדות חסרים. פתחו את העריכה ושמרו שוב.");

  const { error: vErr } = await s.supabase
    .from("contract_versions")
    .upsert({ contract_id: c.id, version: c.version, title: c.title, content: c.content, content_hash: contentHash(c.content) }, { onConflict: "contract_id,version", ignoreDuplicates: true });
  if (vErr) return dbError(vErr, "שמירת הגרסה נכשלה");
  const token = c.sign_token ?? randomBytes(32).toString("base64url");
  const { error } = await s.supabase.from("contracts").update({ status: "sent", sign_token: token, sent_at: new Date().toISOString() }).eq("id", id);
  if (error) return dbError(error, "השליחה נכשלה");
  revalidatePath("/", "layout");
  return ok({ url: `${env.siteUrl()}/s/${token}`, version: c.version }, `גרסה ${c.version} מוכנה לחתימה — שלחו ללקוח את הקישור`);
}

/** Turns the signing link off (the frozen versions and signatures stay). */
export async function revokeSignLink(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: c } = await s.supabase.from("contracts").select("status").eq("id", id).maybeSingle();
  if (!c) return fail("ההסכם לא נמצא.");
  const { error } = await s.supabase
    .from("contracts")
    .update({ sign_token: null, ...(c.status === "sent" ? { status: "draft" as const } : {}) })
    .eq("id", id);
  if (error) return dbError(error, "הביטול נכשל");
  revalidatePath("/", "layout");
  return ok(undefined, "קישור החתימה בוטל");
}

/**
 * The client signs from /s/<token>. sign_contract re-checks the token, that
 * the version and its hash are exactly what the client read, and records the
 * signature — all in one transaction. The signature image is also kept in the
 * client's files (category "contracts").
 */
export async function signContract(token: string, fd: FormData): Promise<ActionResult<{ version: number }>> {
  if (!TOKEN_RE.test(token)) return fail("הקישור לא תקין.");
  const p = parseForm(signatureSchema, formToObject(fd));
  if (!p.success) return p.result;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const db = createAdminClient();
  const { data, error } = await db.rpc("sign_contract", {
    p_token: token,
    p_version: p.data.version,
    p_hash: p.data.hash,
    p_name: p.data.name,
    p_id_number: p.data.id_number ?? "",
    p_email: p.data.email ?? "",
    p_signature: p.data.signature,
    p_ip: ip ?? undefined,
    p_user_agent: h.get("user-agent")?.slice(0, 300) ?? undefined,
  });
  if (error) {
    if (error.hint === "closed") return fail("ההסכם כבר נחתם. תודה!");
    if (error.hint === "stale") return fail("ההסכם עודכן בזמן שקראתם אותו. רעננו את העמוד וקראו את הגרסה החדשה.");
    if (error.hint === "not_ready") return fail("ההסכם כרגע בעדכון ולא פתוח לחתימה. נשלח לכם קישור מחדש.");
    if (error.hint === "invalid") return fail("הקישור כבר לא פעיל.");
    if (error.code === "23514") return fail("החתימה לא נקלטה. נסו לחתום שוב.", { signature: "חתימה לא תקינה" });
    console.error("[sign] failed", error.message);
    return fail("החתימה נכשלה. נסו שוב בעוד רגע.");
  }
  const result = data as { version: number };

  // Keep the signature image in the client's file, next to the agreement.
  const { data: c } = await db.from("contracts").select("id, title, client_id, project_id").eq("sign_token", token).maybeSingle();
  if (c) {
    try {
      const png = Buffer.from(p.data.signature.split(",")[1] ?? "", "base64");
      const path = `contracts/${c.id}/signature-v${result.version}-${Date.now()}.png`;
      const up = await db.storage.from("crm-files").upload(path, png, { contentType: "image/png", upsert: false });
      if (!up.error) {
        await db.from("files").insert({
          storage_path: path,
          original_name: `חתימה דיגיטלית — ${c.title} (גרסה ${result.version}).png`,
          mime_type: "image/png",
          size_bytes: png.length,
          category: "contracts",
          client_id: c.client_id,
          project_id: c.project_id,
          source: "staff",
        });
      }
    } catch (e) {
      console.error("[sign] storing the signature image failed", (e as Error).message);
    }
    notify(() => recipientsFor("contracts"), "contract_signed", {
      title: "הסכם נחתם",
      body: `${p.data.name} חתם/ה על "${c.title}" (גרסה ${result.version}).`,
      url: `/contracts/${c.id}`,
      tag: `contract-${c.id}`,
    });
  }
  revalidatePath(`/s/${token}`);
  revalidatePath("/", "layout");
  return ok({ version: result.version }, "ההסכם נחתם. תודה!");
}
