import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { answersSchema, type Answers, type FormSnapshot } from "@/lib/domain/forms";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type PublicForm =
  | { state: "invalid" }
  | { state: "closed"; reason: "completed" | "cancelled" | "expired"; businessName: string; title: string }
  | {
      state: "open";
      title: string;
      businessName: string;
      intro: string;
      contactPhone: string | null;
      contactEmail: string | null;
      snapshot: FormSnapshot;
      draft: Answers;
      step: number;
      lastSavedAt: string | null;
    };

/**
 * Loads exactly what the client needs to fill the form — nothing else.
 * Internal notes, client records and other submissions are never selected.
 */
export async function getPublicForm(token: string): Promise<PublicForm> {
  if (!TOKEN_RE.test(token)) return { state: "invalid" };
  const db = createAdminClient();
  const [{ data: s }, { data: ws }] = await Promise.all([
    db
      .from("form_submissions")
      .select("id, title, status, form_snapshot, draft_answers, draft_step, last_saved_at, opened_at, expires_at")
      .eq("token", token)
      .maybeSingle(),
    db.from("workspace_settings").select("business_name, form_intro, contact_phone, contact_email").maybeSingle(),
  ]);
  if (!s) return { state: "invalid" };
  const businessName = ws?.business_name ?? "";
  if (s.status === "completed" || s.status === "cancelled") return { state: "closed", reason: s.status, businessName, title: s.title };
  if (s.expires_at && new Date(s.expires_at) < new Date()) return { state: "closed", reason: "expired", businessName, title: s.title };

  if (!s.opened_at) {
    await db.from("form_submissions").update({ opened_at: new Date().toISOString() }).eq("id", s.id);
  }
  const draft = answersSchema.safeParse(s.draft_answers);
  return {
    state: "open",
    title: s.title,
    businessName,
    intro: ws?.form_intro ?? "",
    contactPhone: ws?.contact_phone ?? null,
    contactEmail: ws?.contact_email ?? null,
    snapshot: s.form_snapshot as unknown as FormSnapshot,
    draft: draft.success ? (draft.data as Answers) : {},
    step: s.draft_step,
    lastSavedAt: s.last_saved_at,
  };
}
