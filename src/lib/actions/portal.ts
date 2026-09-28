"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, recipientsFor } from "@/lib/push";
import { approvalResponseSchema } from "@/lib/validation/schemas";
import { formToObject, parseForm } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The client approves or asks for changes from the presentation link. The
 * token is the only credential; respond_to_approval re-checks that the
 * approval belongs to the token's project, records the answer, logs it and
 * (optionally) opens a task for the requested changes — all in one transaction.
 */
export async function respondToApproval(token: string, fd: FormData): Promise<ActionResult<{ status: string }>> {
  if (!TOKEN_RE.test(token)) return fail("הקישור לא תקין.");
  const p = parseForm(approvalResponseSchema, formToObject(fd));
  if (!p.success) return p.result;
  const db = createAdminClient();
  const { data, error } = await db.rpc("respond_to_approval", {
    p_token: token,
    p_approval_id: p.data.approval_id,
    p_decision: p.data.decision,
    p_comment: p.data.comment ?? undefined,
    p_author: p.data.author ?? undefined,
  });
  if (error) {
    if (error.hint === "closed") return fail("כבר התקבלה תשובה על הבקשה הזו. תודה!");
    if (error.hint === "comment_required") return fail("כתבו בקצרה מה תרצו לשנות.", { comment: "חסר תיאור" });
    if (error.hint === "invalid") return fail("הקישור כבר לא פעיל. בקשו מאיתנו קישור חדש.");
    console.error("[portal] respond failed", error.message);
    return fail("השליחה נכשלה. נסו שוב בעוד רגע.");
  }
  revalidatePath(`/p/${token}`);
  revalidatePath("/", "layout");
  const status = (data as { status: string }).status;
  const [{ data: approval }, { data: project }] = await Promise.all([
    db.from("project_approvals").select("title").eq("id", p.data.approval_id).maybeSingle(),
    db.from("projects").select("id, name").eq("portal_token", token).maybeSingle(),
  ]);
  if (project) {
    const { data: owner } = await db.from("projects").select("owner_id").eq("id", project.id).maybeSingle();
    notify(() => recipientsFor("development", owner?.owner_id), "approval_response", {
      title: status === "approved" ? "הלקוח אישר" : "הלקוח ביקש שינויים",
      body: `${approval?.title ?? "בקשת אישור"} · ${project.name}${p.data.comment ? ` — "${p.data.comment.slice(0, 120)}"` : ""}`,
      url: `/projects/${project.id}#approvals`,
      tag: `approval-${p.data.approval_id}`,
    });
  }
  return ok({ status }, status === "approved" ? "תודה! האישור נשלח לצוות." : "תודה! בקשת השינוי נשלחה לצוות.");
}
