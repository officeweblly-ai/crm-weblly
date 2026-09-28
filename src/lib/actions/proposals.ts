"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { proposalNumber } from "@/lib/domain/proposals";
import { env } from "@/lib/env";
import { notify, recipientsFor } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { ServerClient } from "@/lib/supabase/server";
import { proposalResponseSchema, proposalSchema } from "@/lib/validation/schemas";
import { dbError, formToObject, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

/**
 * Proposals: build (often pre-filled from a questionnaire) → send a secure
 * link → the client views / accepts / declines → convert to a project →
 * create the contract. Staff check → zod → Supabase (RLS) → Hebrew message.
 */
function refresh() {
  revalidatePath("/", "layout");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

type Parsed = z.infer<typeof proposalSchema>;

function rowFrom(p: Parsed) {
  const { included: _i, excluded: _e, milestones, ...rest } = p;
  void _i;
  void _e;
  return { ...rest, milestones: milestones as unknown as Json };
}

async function writeItems(supabase: ServerClient, proposalId: string, p: Pick<Parsed, "included" | "excluded">) {
  await supabase.from("proposal_items").delete().eq("proposal_id", proposalId);
  const base = Date.now() / 1000;
  const rows = [
    ...p.included.map((title, i) => ({ proposal_id: proposalId, kind: "included", title, position: base + i })),
    ...p.excluded.map((title, i) => ({ proposal_id: proposalId, kind: "excluded", title, position: base + 1000 + i })),
  ];
  if (!rows.length) return null;
  const { error } = await supabase.from("proposal_items").insert(rows);
  return error;
}

async function nextNumber(supabase: ServerClient) {
  const year = new Date().getFullYear();
  const { count } = await supabase.from("proposals").select("id", { count: "exact", head: true }).like("number", `HZ-${year}-%`);
  return { year, seq: (count ?? 0) + 1 };
}

export async function createProposal(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(proposalSchema, fd);
  if (!p.success) return p.result;
  const next = await nextNumber(s.supabase);
  const year = next.year;
  let seq = next.seq;
  for (let attempt = 0; attempt < 5; attempt++, seq++) {
    const { data, error } = await s.supabase
      .from("proposals")
      .insert({ ...rowFrom(p.data), status: "draft", number: proposalNumber(year, seq) })
      .select("id")
      .single();
    if (!error) {
      const itemsError = await writeItems(s.supabase, data.id, p.data);
      if (itemsError) return dbError(itemsError, "ההצעה נשמרה אבל הפריטים לא — נסו לשמור שוב");
      refresh();
      return ok({ id: data.id }, `הצעת המחיר ${proposalNumber(year, seq)} נשמרה כטיוטה`);
    }
    // 23505 = two proposals got the same number at once — take the next one.
    if (error.code !== "23505") return dbError(error, "שמירת ההצעה נכשלה");
  }
  return fail("לא הצלחנו להקצות מספר הצעה. נסו שוב.");
}

export async function updateProposal(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(proposalSchema, fd);
  if (!p.success) return p.result;
  const { data: current } = await s.supabase.from("proposals").select("status").eq("id", id).maybeSingle();
  if (!current) return fail("ההצעה לא נמצאה.");
  if (current.status === "accepted") return fail("הצעה שהלקוח אישר לא נערכת. שכפלו אותה כדי ליצור גרסה חדשה.");
  const { status: _s, ...row } = rowFrom(p.data);
  void _s;
  const { error } = await s.supabase.from("proposals").update(row).eq("id", id);
  if (error) return dbError(error, "שמירת ההצעה נכשלה");
  const itemsError = await writeItems(s.supabase, id, p.data);
  if (itemsError) return dbError(itemsError, "שמירת הפריטים נכשלה");
  refresh();
  return ok({ id }, current.status === "draft" ? "ההצעה נשמרה" : "ההצעה עודכנה — הלקוח יראה את הגרסה החדשה בקישור");
}

export async function duplicateProposal(id: string): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: src } = await s.supabase.from("proposals").select("*, proposal_items(kind, title, description, amount, position)").eq("id", id).maybeSingle();
  if (!src) return fail("ההצעה לא נמצאה.");
  const { year, seq } = await nextNumber(s.supabase);
  const { data, error } = await s.supabase
    .from("proposals")
    .insert({
      number: proposalNumber(year, seq),
      client_id: src.client_id,
      project_id: src.project_id,
      submission_id: src.submission_id,
      title: `${src.title} (עותק)`,
      project_type: src.project_type,
      intro: src.intro,
      scope: src.scope,
      price: src.price,
      deposit: src.deposit,
      milestones: src.milestones,
      delivery_estimate: src.delivery_estimate,
      notes: src.notes,
      internal_notes: src.internal_notes,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return dbError(error, "השכפול נכשל");
  if (src.proposal_items.length) {
    await s.supabase.from("proposal_items").insert(src.proposal_items.map((i) => ({ ...i, proposal_id: data.id })));
  }
  refresh();
  return ok({ id: data.id }, "נוצר עותק לעריכה");
}

/** Creates the secure link (once) and marks the proposal as sent. */
export async function sendProposal(id: string): Promise<ActionResult<{ url: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: p } = await s.supabase.from("proposals").select("status, public_token, price").eq("id", id).maybeSingle();
  if (!p) return fail("ההצעה לא נמצאה.");
  if (Number(p.price) <= 0) return fail("לפני השליחה — קבעו מחיר להצעה.");
  const token = p.public_token ?? randomBytes(32).toString("base64url");
  const status = p.status === "draft" || p.status === "expired" ? "sent" : p.status;
  const { error } = await s.supabase.from("proposals").update({ public_token: token, status, ...(p.status === "expired" ? { sent_at: new Date().toISOString() } : {}) }).eq("id", id);
  if (error) return dbError(error, "השליחה נכשלה");
  refresh();
  return ok({ url: `${env.siteUrl()}/o/${token}` }, p.status === "draft" ? "ההצעה סומנה כנשלחה — שלחו ללקוח את הקישור" : "הקישור מוכן");
}

/** Manual status (e.g. the client accepted on the phone). */
export async function setProposalStatus(id: string, status: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = z.enum(["draft", "sent", "accepted", "rejected", "expired"]).safeParse(status);
  if (!parsed.success) return fail("סטטוס לא תקין.");
  const { data: before } = await s.supabase.from("proposals").select("status, client_id, project_id, title").eq("id", id).maybeSingle();
  if (!before) return fail("ההצעה לא נמצאה.");
  const { error } = await s.supabase.from("proposals").update({ status: parsed.data }).eq("id", id);
  if (error) return dbError(error, "העדכון נכשל");
  refresh();
  return ok(undefined, parsed.data === "accepted" ? "ההצעה סומנה כמאושרת — אפשר להמשיך לפרויקט ולחוזה" : "סטטוס ההצעה עודכן");
}

export async function deleteProposal(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: p } = await s.supabase.from("proposals").select("status").eq("id", id).maybeSingle();
  if (!p) return fail("ההצעה לא נמצאה.");
  if (p.status === "accepted") return fail("הצעה שאושרה נשמרת לתיעוד ולא נמחקת.");
  const { error } = await s.supabase.from("proposals").delete().eq("id", id);
  if (error) return dbError(error, "המחיקה נכשלה");
  refresh();
  return ok(undefined, "ההצעה נמחקה");
}

/**
 * Accepted proposal → project. Reuses client, type, scope, price and deposit.
 * An existing project gets the agreed price only if it has none yet, so real
 * numbers are never silently overwritten.
 */
export async function convertProposalToProject(id: string): Promise<ActionResult<{ projectId: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { data: p } = await s.supabase.from("proposals").select("*, proposal_items(kind, title, position)").eq("id", id).maybeSingle();
  if (!p) return fail("ההצעה לא נמצאה.");
  if (p.status !== "accepted") return fail("אפשר להמיר לפרויקט רק הצעה שאושרה.");
  if (p.converted_project_id) return ok({ projectId: p.converted_project_id }, "ההצעה כבר הומרה לפרויקט");

  const included = p.proposal_items.filter((i) => i.kind === "included").sort((a, b) => a.position - b.position).map((i) => `• ${i.title}`);
  const description = [p.scope, included.length ? `כלול:\n${included.join("\n")}` : null].filter(Boolean).join("\n\n").slice(0, 5000) || null;
  let projectId = p.project_id;

  if (projectId) {
    const { data: project } = await s.supabase.from("projects").select("total_price, description, status").eq("id", projectId).maybeSingle();
    if (!project) projectId = null;
    else {
      const patch: { total_price?: number; deposit_amount?: number; description?: string | null; project_type?: typeof p.project_type & {}; next_action?: string; status?: "awaiting_deposit" } = {};
      if (Number(project.total_price) === 0) {
        patch.total_price = Number(p.price);
        patch.deposit_amount = Number(p.deposit);
      }
      if (!project.description) patch.description = description;
      if (p.project_type) patch.project_type = p.project_type;
      if (["lead", "questionnaire_sent", "questionnaire_received"].includes(project.status)) {
        patch.status = "awaiting_deposit";
        patch.next_action = "לשלוח חוזה לחתימה ולגבות מקדמה";
      }
      const { error } = await s.supabase.from("projects").update(patch).eq("id", projectId);
      if (error) return dbError(error, "עדכון הפרויקט נכשל");
    }
  }
  if (!projectId) {
    const { data, error } = await s.supabase
      .from("projects")
      .insert({
        client_id: p.client_id,
        name: p.title.replace(/^הצעת מחיר\s*[—-]\s*/, ""),
        project_type: p.project_type ?? "business_site",
        total_price: Number(p.price),
        deposit_amount: Number(p.deposit),
        status: "awaiting_deposit",
        description,
        next_action: "לשלוח חוזה לחתימה ולגבות מקדמה",
      })
      .select("id")
      .single();
    if (error) return dbError(error, "יצירת הפרויקט נכשלה");
    projectId = data.id;
  }
  await s.supabase.from("proposals").update({ converted_project_id: projectId, project_id: projectId }).eq("id", id);
  refresh();
  return ok({ projectId: projectId! }, "הפרויקט מוכן — המחיר, המקדמה והתכולה הועברו מההצעה");
}

// ===========================================================================
// Public (client) side — /o/<token>
// ===========================================================================
export async function respondToProposal(token: string, fd: FormData): Promise<ActionResult<{ status: string }>> {
  if (!TOKEN_RE.test(token)) return fail("הקישור לא תקין.");
  const p = parseForm(proposalResponseSchema, formToObject(fd));
  if (!p.success) return p.result;
  const db = createAdminClient();
  const { data, error } = await db.rpc("respond_to_proposal", {
    p_token: token,
    p_decision: p.data.decision,
    p_name: p.data.name ?? undefined,
    p_note: p.data.note ?? undefined,
  });
  if (error) {
    if (error.hint === "closed") return fail("כבר התקבלה תשובה על ההצעה הזו. תודה!");
    if (error.hint === "expired") return fail("תוקף ההצעה פג. צרו איתנו קשר ונשלח הצעה מעודכנת.");
    if (error.hint === "name_required") return fail("כתבו את שמכם לאישור.", { name: "חסר שם" });
    if (error.hint === "invalid") return fail("הקישור כבר לא פעיל.");
    console.error("[proposal] respond failed", error.message);
    return fail("השליחה נכשלה. נסו שוב בעוד רגע.");
  }
  const status = (data as { status: string }).status;
  const { data: row } = await db.from("proposals").select("id, title, clients(name, business_name)").eq("public_token", token).maybeSingle();
  if (row) {
    const who = row.clients?.business_name || row.clients?.name || "הלקוח";
    notify(async () => {
      const r = await recipientsFor("proposals");
      return r === "staff" ? recipientsFor("sales") : r;
    }, "proposal_response", {
      title: status === "accepted" ? "הצעת מחיר אושרה" : "הצעת מחיר נדחתה",
      body: status === "accepted" ? `${who} אישר/ה את "${row.title}" — נוספה משימה להכין חוזה.` : `${who} דחה/תה את "${row.title}"${p.data.note ? ` — "${p.data.note.slice(0, 120)}"` : ""}`,
      url: `/proposals/${row.id}`,
      tag: `proposal-${row.id}`,
    });
  }
  revalidatePath(`/o/${token}`);
  refresh();
  return ok({ status }, status === "accepted" ? "תודה! ההצעה אושרה ונחזור אליכם עם ההסכם." : "תודה על התשובה.");
}

