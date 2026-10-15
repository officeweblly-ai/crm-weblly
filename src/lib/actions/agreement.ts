"use server";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { contentHash } from "@/lib/contract-hash";
import { defaultPartnerAgreement, partnerAgreementSchema } from "@/lib/domain/partners";
import { renderPdf } from "@/lib/pdf";
import { notify } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { dbError, NOT_AUTHORIZED, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const NO_ACCESS = fail("התפקיד שלך לא כולל גישה להסכם השותפים.");

async function partnersClient() {
  const s = await staffClient();
  if (!s) return null;
  const { data } = await s.supabase.rpc("has_permission", { p_area: "partners" });
  return data ? s : false;
}

function refresh(token?: string | null) {
  revalidatePath("/", "layout");
  if (token) revalidatePath(`/agreement/${token}`);
}

// ===========================================================================
// Signing through the secure link (no login — the token is the credential)
// ===========================================================================
const signSchema = z.object({
  party: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  version: z.number().int().min(1),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z
    .string()
    .startsWith("data:image/png;base64,", "החתימה לא נקלטה")
    .max(590_000, "החתימה גדולה מדי — נסו לחתום שוב"),
  typedName: z.string().trim().max(120).optional(),
  agree: z.literal(true, "צריך לאשר שקראת את ההסכם"),
  replace: z.boolean(),
});

/**
 * Re-reads the live agreement, checks that what the signer read (version +
 * hash) is still exactly the text, and lets sign_partner_agreement_link() lock
 * the row, freeze the version and record the signature — one transaction.
 */
export async function signAgreement(token: string, input: z.input<typeof signSchema>): Promise<ActionResult<{ complete: boolean; replaced: boolean }>> {
  if (!TOKEN_RE.test(token)) return fail("הקישור לא תקין.");
  const p = signSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const db = createAdminClient();
  const { data: a } = await db.from("partner_agreements").select("id, title, content, version").eq("sign_token", token).maybeSingle();
  if (!a) return fail("הקישור כבר לא פעיל.");
  const hash = contentHash({ title: a.title, content: a.content });
  if (a.version !== p.data.version || hash !== p.data.hash) {
    return fail("ההסכם עודכן מאז שנפתח. רעננו את העמוד וקראו את הנוסח המעודכן לפני החתימה.");
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const { data, error } = await db.rpc("sign_partner_agreement_link", {
    p_token: token,
    p_party: p.data.party,
    p_version: a.version,
    p_title: a.title,
    p_content: a.content as Json,
    p_hash: hash,
    p_signature: p.data.signature,
    p_typed_name: p.data.typedName ?? "",
    p_ip: ip,
    p_user_agent: h.get("user-agent")?.slice(0, 300) ?? "",
    p_replace: p.data.replace,
  });
  if (error) {
    if (error.hint === "stale") return fail("ההסכם עודכן מאז שנפתח. רעננו את העמוד וקראו את הנוסח המעודכן.");
    if (error.hint === "already_signed") return fail("כבר קיימת חתימה. כדי להחליף אותה — בחרו \"שינוי חתימה\".");
    if (error.hint === "invalid") return fail("הקישור כבר לא פעיל.");
    if (error.hint === "party") return fail("החותם שנבחר אינו צד להסכם.");
    if (error.code === "23514") return fail("החתימה לא נקלטה. נסו לחתום שוב.");
    console.error("[agreement sign]", error.message);
    return fail("החתימה נכשלה. נסו שוב בעוד רגע.");
  }
  const r = data as { agreement_id: string; version: number; signed: number; needed: number; complete: boolean; replaced: boolean };

  const content = partnerAgreementSchema.safeParse(a.content).data;
  const party = content?.parties.find((x) => x.key === p.data.party);
  const verb = party?.gender === "f" ? "חתמה" : "חתם";
  notify("staff", "partner_agreement", {
    title: r.complete ? "הסכם השותפות נחתם על ידי שני הצדדים" : `${party?.name ?? "שותף"} ${r.replaced ? "החליף/ה חתימה" : verb} על הסכם השותפות`,
    body: r.complete ? `${a.title} · גרסה ${r.version}` : `חתמו ${r.signed} מתוך ${r.needed}`,
    url: `/contracts/partnership/${a.id}`,
    tag: "partners",
  });

  // Fully signed → produce and keep the final signed PDF of this exact version.
  if (r.complete) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const origin = `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : proto}://${host}`;
      after(() => storeSignedPdf(a.id, token, r.version, origin));
    }
  }
  refresh(token);
  return ok({ complete: r.complete, replaced: r.replaced }, r.complete ? "ההסכם נחתם על ידי שני הצדדים" : r.replaced ? "החתימה הוחלפה" : "החתימה נשמרה");
}

/** Renders the signed version to PDF and stores it in private storage. Never throws. */
async function storeSignedPdf(id: string, token: string, version: number, origin: string) {
  try {
    const url = new URL(`/agreement/${token}`, origin);
    url.searchParams.set("v", String(version));
    const pdf = await renderPdf(url);
    const db = createAdminClient();
    const path = `partner-agreements/${id}/v${version}-signed-${Date.now()}.pdf`;
    const up = await db.storage.from("crm-files").upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (up.error) throw up.error;
    // Only if the version is still complete (a signature might have been replaced meanwhile).
    await db.from("partner_agreement_versions").update({ signed_pdf_path: path }).eq("agreement_id", id).eq("version", version).not("completed_at", "is", null);
  } catch (e) {
    console.error("[agreement pdf]", (e as Error).message);
  }
}

// ===========================================================================
// Staff: create, edit (a new version once signed), signed copy, link
// ===========================================================================
export async function createPartnershipAgreement(): Promise<ActionResult<{ id: string }>> {
  const s = await partnersClient();
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const { title, content } = defaultPartnerAgreement();
  const { data, error } = await s.supabase
    .from("partner_agreements")
    .insert({ title, content: content as Json, sign_token: randomBytes(32).toString("base64url") })
    .select("id")
    .single();
  if (error) return dbError(error, "יצירת ההסכם נכשלה");
  refresh();
  return ok({ id: data.id }, "הסכם השותפות נוצר — אפשר לשלוח את קישור החתימה");
}

const editSchema = z.object({ title: z.string().trim().min(1, "חסרה כותרת").max(200), content: partnerAgreementSchema });

export async function updatePartnershipAgreement(id: string, input: { title: string; content: unknown }): Promise<ActionResult<{ version: number }>> {
  const s = await partnersClient();
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const p = editSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const total = p.data.content.parties.reduce((n, x) => n + x.equity, 0);
  if (Math.abs(total - 100) > 0.01) return fail(`סך אחוזי הבעלות צריך להיות 100% (כרגע ${total}%).`);
  if (new Set(p.data.content.parties.map((x) => x.key)).size !== p.data.content.parties.length) return fail("מזהה שותף כפול.");

  const { data: before } = await s.supabase.from("partner_agreements").select("version, status, sign_token").eq("id", id).maybeSingle();
  if (!before) return fail("ההסכם לא נמצא.");
  const { data, error } = await s.supabase
    .from("partner_agreements")
    .update({ title: p.data.title, content: p.data.content as Json })
    .eq("id", id)
    .select("version")
    .single();
  if (error) return dbError(error, "שמירת ההסכם נכשלה");
  const bumped = data.version > before.version;
  if (bumped) {
    notify("staff", "partner_agreement", {
      title: "הסכם השותפות עודכן",
      body: `נפתחה גרסה ${data.version} — צריך לחתום מחדש. הגרסה החתומה הקודמת נשמרה.`,
      url: `/contracts/partnership/${id}`,
      tag: "partners",
    }, { actor: s.userId });
  }
  refresh(before.sign_token);
  return ok({ version: data.version }, bumped ? `נשמר כגרסה ${data.version} — החתימות על הגרסה הקודמת נשמרו, וצריך לחתום מחדש` : "ההסכם נשמר");
}

/** A short-lived link to the stored final signed PDF. */
export async function signedPdfUrl(id: string, version: number): Promise<ActionResult<{ url: string }>> {
  const s = await partnersClient();
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const { data: v } = await s.supabase.from("partner_agreement_versions").select("signed_pdf_path").eq("agreement_id", id).eq("version", version).maybeSingle();
  if (!v?.signed_pdf_path) return fail("העותק החתום עדיין בהכנה. נסו שוב בעוד דקה.");
  const { data, error } = await createAdminClient().storage.from("crm-files").createSignedUrl(v.signed_pdf_path, 120, { download: `הסכם שותפות WEBLLY — גרסה ${version} — חתום.pdf` });
  if (error || !data) return fail("לא הצלחנו לפתוח את הקובץ.");
  return ok({ url: data.signedUrl });
}

/** Re-creates the stored signed PDF on demand (e.g. if it failed in the background). */
export async function regenerateSignedPdf(id: string, version: number): Promise<ActionResult> {
  const s = await partnersClient();
  if (s === null) return NOT_AUTHORIZED;
  if (!s) return NO_ACCESS;
  const { data: a } = await s.supabase.from("partner_agreements").select("sign_token").eq("id", id).maybeSingle();
  const { data: v } = await s.supabase.from("partner_agreement_versions").select("completed_at").eq("agreement_id", id).eq("version", version).maybeSingle();
  if (!a?.sign_token || !v?.completed_at) return fail("הגרסה הזו עדיין לא נחתמה על ידי שני הצדדים.");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const origin = `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : (h.get("x-forwarded-proto") ?? "https")}://${host}`;
  await storeSignedPdf(id, a.sign_token, version, origin);
  refresh(a.sign_token);
  return ok(undefined, "העותק החתום נשמר");
}
