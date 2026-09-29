"use server";

import { revalidatePath } from "next/cache";
import { projectType } from "@/lib/domain/labels";
import { convertLeadSchema, leadSchema } from "@/lib/validation/schemas";
import { notify, recipientsFor } from "@/lib/push";
import { dbError, NOT_AUTHORIZED, parseForm, staffClient } from "./helpers";
import { fail, ok, type ActionResult } from "./result";

export async function createLead(fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(leadSchema, fd);
  if (!p.success) return p.result;

  const { data, error } = await s.supabase.from("leads").insert(p.data).select("id").single();
  if (error) return dbError(error, "שמירת הליד נכשלה");
  notify(() => recipientsFor("sales"), "lead_created", {
    title: "ליד חדש",
    body: [p.data.name, p.data.business_name].filter(Boolean).join(" · "),
    url: `/leads/${data.id}`,
    tag: "lead",
  }, { actor: s.userId });
  revalidatePath("/leads");
  revalidatePath("/");
  return ok({ id: data.id }, `הליד "${p.data.name}" נוסף`);
}

export async function updateLead(id: string, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(leadSchema, fd);
  if (!p.success) return p.result;

  const { error } = await s.supabase.from("leads").update(p.data).eq("id", id);
  if (error) return dbError(error, "עדכון הליד נכשל");
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return ok({ id }, "פרטי הליד עודכנו");
}

export async function setLeadStatus(id: string, status: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const parsed = leadSchema.shape.status.safeParse(status);
  if (!parsed.success || parsed.data === "converted") return fail("סטטוס לא תקין — להמרה ללקוח השתמש בכפתור 'הפוך ללקוח'.");
  const { error } = await s.supabase.from("leads").update({ status: parsed.data }).eq("id", id);
  if (error) return dbError(error, "עדכון הסטטוס נכשל");
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return ok(undefined, "סטטוס הליד עודכן");
}

export async function deleteLead(id: string): Promise<ActionResult> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const { error } = await s.supabase.from("leads").delete().eq("id", id);
  if (error) return dbError(error, "מחיקת הליד נכשלה");
  revalidatePath("/leads");
  return ok(undefined, "הליד נמחק");
}

/** Lead → client (+ project) in a single database transaction. */
export async function convertLead(fd: FormData): Promise<ActionResult<{ clientId: string; projectId: string | null }>> {
  const s = await staffClient();
  if (!s) return NOT_AUTHORIZED;
  const p = parseForm(convertLeadSchema, fd);
  if (!p.success) return p.result;

  let projectName = p.data.project_name;
  if (p.data.create_project && !projectName) {
    const { data: lead } = await s.supabase.from("leads").select("name, business_name, project_type").eq("id", p.data.lead_id).single();
    if (lead) projectName = `${projectType.label(lead.project_type ?? "business_site")} — ${lead.business_name ?? lead.name}`;
  }

  const { data, error } = await s.supabase.rpc("convert_lead", {
    p_lead_id: p.data.lead_id,
    p_create_project: p.data.create_project,
    p_project_name: projectName ?? undefined,
  });
  if (error) {
    if (error.hint === "already_converted") return fail("הליד כבר הומר ללקוח.");
    return dbError(error, "ההמרה ללקוח נכשלה");
  }
  const result = data as { client_id: string; project_id: string | null; reused_client: boolean };
  revalidatePath("/leads");
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/");
  return ok(
    { clientId: result.client_id, projectId: result.project_id },
    result.reused_client ? "נמצא לקוח קיים עם אותם פרטים — הליד צורף אליו" : "הליד הומר ללקוח ונפתח לו תיק",
  );
}
