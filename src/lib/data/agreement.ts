import "server-only";
import { contentHash } from "@/lib/contract-hash";
import { partnerAgreementSchema, type PartnerAgreement } from "@/lib/domain/partners";
import type { PartnerAgreementStatus } from "@/lib/domain/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type AgreementSignature = { party: string; name: string; typedName: string | null; png: string; signedAt: string };

/** One version of the partnership agreement, as shown on screen / in the PDF. */
export type AgreementView = {
  id: string;
  token: string | null;
  title: string;
  content: PartnerAgreement;
  /** The version shown (may be an older, frozen one). */
  version: number;
  currentVersion: number;
  isCurrent: boolean;
  status: PartnerAgreementStatus;
  /** SHA-256 of exactly the text shown — what a signature binds to. */
  hash: string;
  signatures: AgreementSignature[];
  completedAt: string | null;
  signedPdfPath: string | null;
  createdAt: string;
  updatedAt: string;
};

type Db = ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>;

async function load(db: Db, by: { token: string } | { id: string }, wanted?: number | null): Promise<AgreementView | null> {
  const q = db.from("partner_agreements").select("id, sign_token, title, content, version, status, created_at, updated_at");
  const { data: a } = await ("token" in by ? q.eq("sign_token", by.token) : q.eq("id", by.id)).maybeSingle();
  if (!a) return null;
  const version = wanted && wanted >= 1 && wanted <= a.version ? wanted : a.version;

  const [{ data: frozen }, { data: sigs }] = await Promise.all([
    db.from("partner_agreement_versions").select("title, content, content_hash, completed_at, signed_pdf_path").eq("agreement_id", a.id).eq("version", version).maybeSingle(),
    db
      .from("partner_agreement_signatures")
      .select("party_key, signer_name, typed_name, signature, signed_at")
      .eq("agreement_id", a.id)
      .eq("version", version)
      .is("replaced_at", null)
      .order("signed_at"),
  ]);
  const isCurrent = version === a.version;
  // An older version exists only as its frozen copy.
  if (!isCurrent && !frozen) return null;
  const title = isCurrent ? a.title : frozen!.title;
  const raw = isCurrent ? a.content : frozen!.content;
  const parsed = partnerAgreementSchema.safeParse(raw);
  if (!parsed.success) return null;

  return {
    id: a.id,
    token: a.sign_token,
    title,
    content: parsed.data,
    version,
    currentVersion: a.version,
    isCurrent,
    status: (isCurrent ? a.status : frozen?.completed_at ? "signed" : "partial") as PartnerAgreementStatus,
    hash: isCurrent ? contentHash({ title: a.title, content: a.content }) : frozen!.content_hash,
    signatures: (sigs ?? [])
      .filter((s) => s.party_key)
      .map((s) => ({ party: s.party_key!, name: s.signer_name, typedName: s.typed_name, png: s.signature, signedAt: s.signed_at })),
    completedAt: frozen?.completed_at ?? null,
    signedPdfPath: frozen?.signed_pdf_path ?? null,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

/** The secure link: the token is the only credential, so only allow-listed fields are returned. */
export async function getAgreementByToken(token: string, version?: number | null): Promise<AgreementView | null> {
  if (!TOKEN_RE.test(token)) return null;
  return load(createAdminClient(), { token }, version);
}

/** Staff (RLS: partners area). */
export async function getAgreementForStaff(id: string, version?: number | null): Promise<AgreementView | null> {
  return load(await createClient(), { id }, version);
}

export type AgreementVersionRow = {
  version: number;
  frozenAt: string;
  completedAt: string | null;
  signedPdfPath: string | null;
  signatures: { party: string; name: string; signedAt: string; replacedAt: string | null; ip: string | null }[];
};

/** Every frozen version with its full signature history (incl. replaced signatures). */
export async function getAgreementHistory(id: string): Promise<AgreementVersionRow[]> {
  const supabase = await createClient();
  const [{ data: versions }, { data: sigs }] = await Promise.all([
    supabase.from("partner_agreement_versions").select("version, frozen_at, completed_at, signed_pdf_path").eq("agreement_id", id).order("version", { ascending: false }),
    supabase.from("partner_agreement_signatures").select("version, party_key, signer_name, signed_at, replaced_at, ip").eq("agreement_id", id).order("signed_at"),
  ]);
  return (versions ?? []).map((v) => ({
    version: v.version,
    frozenAt: v.frozen_at,
    completedAt: v.completed_at,
    signedPdfPath: v.signed_pdf_path,
    signatures: (sigs ?? [])
      .filter((s) => s.version === v.version)
      .map((s) => ({ party: s.party_key ?? "", name: s.signer_name, signedAt: s.signed_at, replacedAt: s.replaced_at, ip: s.ip })),
  }));
}
