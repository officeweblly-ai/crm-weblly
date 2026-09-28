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

// ===========================================================================
// Client presentation (/p/<token>)
// ===========================================================================
export type PortalFile = { id: string; name: string; mime: string; url: string | null };
export type PortalApproval = {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  preview_url: string | null;
  status: string;
  responded_at: string | null;
  created_at: string;
  files: PortalFile[];
  feedback: { decision: string; comment: string | null; author_name: string | null; created_at: string }[];
};
export type PublicProject =
  | { state: "invalid" }
  | {
      state: "open";
      businessName: string;
      contactPhone: string | null;
      contactEmail: string | null;
      project: { name: string; status: string; client_update: string | null; client_action: string | null; updated_at: string };
      approvals: PortalApproval[];
      files: PortalFile[];
      links: { kind: string; label: string | null; url: string }[];
    };

const PORTAL_URL_TTL = 3600;
const SAFE_LINK_KINDS = ["production", "staging", "figma", "custom"];

/**
 * Loads ONLY what the client may see. Internal notes, tasks, money, contracts
 * and unshared files are never selected — the query itself is the allowlist.
 */
export async function getPublicProject(token: string): Promise<PublicProject> {
  if (!TOKEN_RE.test(token)) return { state: "invalid" };
  const db = createAdminClient();
  const { data: p } = await db
    .from("projects")
    .select("id, name, status, client_update, client_action, updated_at")
    .eq("portal_token", token)
    .maybeSingle();
  if (!p) return { state: "invalid" };

  const [{ data: ws }, { data: approvals }, { data: shared }, { data: links }] = await Promise.all([
    db.from("workspace_settings").select("business_name, contact_phone, contact_email").maybeSingle(),
    db
      .from("project_approvals")
      .select("id, title, kind, description, preview_url, status, responded_at, created_at, file_ids, approval_feedback(decision, comment, author_name, created_at)")
      .eq("project_id", p.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("files").select("id, original_name, mime_type, storage_path, bucket").eq("project_id", p.id).eq("is_shared", true).order("created_at", { ascending: false }).limit(60),
    db.from("project_links").select("kind, label, url").eq("project_id", p.id).eq("client_visible", true).in("kind", SAFE_LINK_KINDS).order("position"),
  ]);

  // Approval files: only ids that really belong to this project.
  const approvalFileIds = [...new Set((approvals ?? []).flatMap((a) => a.file_ids))];
  const { data: approvalFiles } = approvalFileIds.length
    ? await db.from("files").select("id, original_name, mime_type, storage_path, bucket").eq("project_id", p.id).in("id", approvalFileIds)
    : { data: [] };

  const all = [...(shared ?? []), ...(approvalFiles ?? [])];
  const paths = [...new Set(all.map((f) => f.storage_path))];
  const { data: signed } = paths.length ? await db.storage.from(all[0].bucket).createSignedUrls(paths, PORTAL_URL_TTL) : { data: [] };
  const urlOf = new Map((signed ?? []).flatMap((s) => (s.signedUrl && s.path ? [[s.path, s.signedUrl] as [string, string]] : [])));
  const toFile = (f: { id: string; original_name: string; mime_type: string; storage_path: string }): PortalFile => ({
    id: f.id,
    name: f.original_name,
    mime: f.mime_type,
    url: urlOf.get(f.storage_path) ?? null,
  });
  const fileById = new Map((approvalFiles ?? []).map((f) => [f.id, toFile(f)]));

  return {
    state: "open",
    businessName: ws?.business_name ?? "",
    contactPhone: ws?.contact_phone ?? null,
    contactEmail: ws?.contact_email ?? null,
    project: { name: p.name, status: p.status, client_update: p.client_update, client_action: p.client_action, updated_at: p.updated_at },
    approvals: (approvals ?? []).map(({ file_ids, approval_feedback, ...a }) => ({
      ...a,
      files: file_ids.map((id) => fileById.get(id)).filter((f): f is PortalFile => Boolean(f)),
      feedback: [...approval_feedback].sort((x, y) => x.created_at.localeCompare(y.created_at)),
    })),
    files: (shared ?? []).map(toFile),
    links: links ?? [],
  };
}
