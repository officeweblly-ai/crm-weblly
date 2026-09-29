import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify, recipientsFor } from "@/lib/push";
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
      project: { name: string; status: string; client_update: string | null; client_action: string | null; updated_at: string; deadline: string | null };
      approvals: PortalApproval[];
      files: PortalFile[];
      links: { kind: string; label: string | null; url: string }[];
      /** Questionnaires still waiting for the client (their own fill-in links). */
      questionnaires: { title: string; token: string; status: string }[];
      proposals: { title: string; token: string; status: string; price: number }[];
      contracts: { title: string; token: string | null; status: string; signed_at: string | null }[];
      payments: { total: number; paid: number; balance: number; deposit: number; depositDue: number } | null;
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
    .select("id, name, status, client_update, client_action, updated_at, deadline, total_price, deposit_amount")
    .eq("portal_token", token)
    .maybeSingle();
  if (!p) return { state: "invalid" };

  const [{ data: ws }, { data: approvals }, { data: shared }, { data: links }, { data: subs }, { data: props }, { data: contracts }, { data: fin }] = await Promise.all([
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
    db.from("form_submissions").select("title, token, status").eq("project_id", p.id).in("status", ["created", "sent", "in_progress"]).order("created_at"),
    db.from("proposals").select("title, public_token, status, price").eq("project_id", p.id).in("status", ["sent", "viewed", "accepted"]).not("public_token", "is", null).order("created_at", { ascending: false }).limit(3),
    db.from("contracts").select("title, sign_token, status, signed_at").eq("project_id", p.id).in("status", ["sent", "signed"]).order("created_at", { ascending: false }).limit(5),
    db.from("project_financials").select("amount_paid, balance_due").eq("project_id", p.id).maybeSingle(),
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
    project: { name: p.name, status: p.status, client_update: p.client_update, client_action: p.client_action, updated_at: p.updated_at, deadline: p.deadline },
    approvals: (approvals ?? []).map(({ file_ids, approval_feedback, ...a }) => ({
      ...a,
      files: file_ids.map((id) => fileById.get(id)).filter((f): f is PortalFile => Boolean(f)),
      feedback: [...approval_feedback].sort((x, y) => x.created_at.localeCompare(y.created_at)),
    })),
    files: (shared ?? []).map(toFile),
    links: links ?? [],
    questionnaires: (subs ?? []).map((q) => ({ title: q.title, token: q.token, status: q.status })),
    proposals: (props ?? []).map((x) => ({ title: x.title, token: x.public_token!, status: x.status, price: Number(x.price) })),
    // The signing link: to sign while it's out, to view the signed copy after.
    contracts: (contracts ?? []).map((c) => ({ title: c.title, token: c.sign_token, status: c.status, signed_at: c.signed_at })),
    payments:
      Number(p.total_price) > 0
        ? {
            total: Number(p.total_price),
            paid: Number(fin?.amount_paid ?? 0),
            balance: Math.max(0, Number(fin?.balance_due ?? p.total_price)),
            deposit: Number(p.deposit_amount),
            depositDue: Math.max(0, Number(p.deposit_amount) - Number(fin?.amount_paid ?? 0)),
          }
        : null,
  };
}

// ===========================================================================
// Proposal (/o/<token>)
// ===========================================================================
export type PublicProposal =
  | { state: "invalid" }
  | {
      state: "open";
      businessName: string;
      contactPhone: string | null;
      contactEmail: string | null;
      proposal: {
        number: string | null;
        title: string;
        intro: string | null;
        scope: string | null;
        price: number;
        deposit: number;
        milestones: { label: string; amount: number | null; when: string }[];
        delivery_estimate: string | null;
        valid_until: string | null;
        notes: string | null;
        status: string;
        sent_at: string | null;
        response_name: string | null;
        responded_at: string | null;
        client: string;
        included: string[];
        excluded: string[];
      };
    };

/** Only client-facing fields — internal notes are never selected. Opening it marks the proposal as viewed. */
export async function getPublicProposal(token: string): Promise<PublicProposal> {
  if (!TOKEN_RE.test(token)) return { state: "invalid" };
  const db = createAdminClient();
  const [{ data: pr }, { data: ws }] = await Promise.all([
    db
      .from("proposals")
      .select("number, title, intro, scope, price, deposit, milestones, delivery_estimate, valid_until, notes, status, sent_at, response_name, responded_at, clients(name, business_name), proposal_items(kind, title, position)")
      .eq("public_token", token)
      .maybeSingle(),
    db.from("workspace_settings").select("business_name, contact_phone, contact_email").maybeSingle(),
  ]);
  if (!pr || pr.status === "draft") return { state: "invalid" };
  if (pr.status === "sent") {
    await db.rpc("mark_proposal_viewed", { p_token: token });
    const who = pr.clients?.business_name || pr.clients?.name || "";
    notify(() => recipientsFor("proposals"), "proposal_viewed", {
      title: "הלקוח פתח את הצעת המחיר",
      body: [who, pr.title].filter(Boolean).join(" · "),
      url: "/proposals",
      tag: "proposal-viewed",
    });
  }
  const items = [...pr.proposal_items].sort((a, b) => a.position - b.position);
  const { clients, proposal_items: _items, ...rest } = pr;
  void _items;
  return {
    state: "open",
    businessName: ws?.business_name ?? "",
    contactPhone: ws?.contact_phone ?? null,
    contactEmail: ws?.contact_email ?? null,
    proposal: {
      ...rest,
      status: pr.status === "sent" ? "viewed" : pr.status,
      price: Number(pr.price),
      deposit: Number(pr.deposit),
      milestones: Array.isArray(pr.milestones) ? (pr.milestones as PublicProposalMilestone[]) : [],
      client: clients?.business_name || clients?.name || "",
      included: items.filter((i) => i.kind === "included").map((i) => i.title),
      excluded: items.filter((i) => i.kind === "excluded").map((i) => i.title),
    },
  };
}
type PublicProposalMilestone = { label: string; amount: number | null; when: string };

// ===========================================================================
// Contract signing (/s/<token>)
// ===========================================================================
export type PublicContract =
  | { state: "invalid" }
  | { state: "updating"; businessName: string; title: string }
  | {
      state: "open" | "signed";
      businessName: string;
      contactPhone: string | null;
      title: string;
      number: string | null;
      version: number;
      hash: string;
      content: unknown;
      signature: { name: string; idNumber: string | null; png: string; signedAt: string; version: number } | null;
    };

/** The frozen version the client signs — never the live draft. */
export async function getPublicContract(token: string): Promise<PublicContract> {
  if (!TOKEN_RE.test(token)) return { state: "invalid" };
  const db = createAdminClient();
  const [{ data: c }, { data: ws }] = await Promise.all([
    db.from("contracts").select("id, title, status, version, contract_number, signed_version").eq("sign_token", token).maybeSingle(),
    db.from("workspace_settings").select("business_name, contact_phone").maybeSingle(),
  ]);
  if (!c || c.status === "cancelled") return { state: "invalid" };
  const businessName = ws?.business_name ?? "";
  const shownVersion = c.status === "signed" ? (c.signed_version ?? c.version) : c.version;
  if (c.status !== "sent" && c.status !== "signed") return { state: "updating", businessName, title: c.title };

  const [{ data: v }, { data: sig }] = await Promise.all([
    db.from("contract_versions").select("title, content, content_hash, version").eq("contract_id", c.id).eq("version", shownVersion).maybeSingle(),
    c.status === "signed"
      ? db.from("contract_signatures").select("signer_name, signer_id_number, signature_png, signed_at, version").eq("contract_id", c.id).eq("version", shownVersion).order("signed_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!v) return { state: "updating", businessName, title: c.title };
  return {
    state: c.status === "signed" ? "signed" : "open",
    businessName,
    contactPhone: ws?.contact_phone ?? null,
    title: v.title,
    number: c.contract_number,
    version: v.version,
    hash: v.content_hash,
    content: v.content,
    signature: sig ? { name: sig.signer_name, idNumber: sig.signer_id_number, png: sig.signature_png, signedAt: sig.signed_at, version: sig.version } : null,
  };
}
