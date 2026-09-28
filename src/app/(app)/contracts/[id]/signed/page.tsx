import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { ContractDocument } from "@/components/contracts/contract-document";
import { PrintButton } from "@/components/contracts/print-button";
import { contractContentSchema } from "@/lib/domain/contracts";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { first } from "@/lib/utils";

export const metadata = { title: "הסכם חתום" };

/** The frozen, signed version exactly as the client signed it — with the audit trail. */
export default async function SignedContractPage({ params, searchParams }: PageProps<"/contracts/[id]/signed">) {
  const { id } = await params;
  const sp = await searchParams;
  const v = Number(first(sp.v));
  const supabase = await createClient();
  const { data: c } = await supabase.from("contracts").select("id, title, contract_number, signed_version").eq("id", id).maybeSingle();
  if (!c) notFound();
  const version = Number.isInteger(v) && v > 0 ? v : c.signed_version;
  if (!version) notFound();
  const [{ data: ver }, { data: sig }] = await Promise.all([
    supabase.from("contract_versions").select("title, content, content_hash, created_at").eq("contract_id", id).eq("version", version).maybeSingle(),
    supabase.from("contract_signatures").select("*").eq("contract_id", id).eq("version", version).order("signed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const parsed = contractContentSchema.safeParse(ver?.content);
  if (!ver || !sig || !parsed.success) notFound();

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/contracts/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden /> להסכם
        </Link>
        <PrintButton />
      </div>
      <div className="mb-4 rounded-lg border border-ok/25 bg-ok-soft/50 px-4 py-3 text-sm text-ink print:hidden">
        <p className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-ok" aria-hidden />
          נחתם דיגיטלית ע״י {sig.signer_name} · {formatDateTime(sig.signed_at)} · גרסה {version}
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {sig.signer_email && <>אימייל: <bdi dir="ltr">{sig.signer_email}</bdi> · </>}
          {sig.ip && <>IP: <bdi dir="ltr">{sig.ip}</bdi> · </>}
          טביעת תוכן (SHA-256): <bdi dir="ltr" className="font-mono break-all">{sig.content_hash}</bdi>
        </p>
      </div>
      <div className="rounded-lg bg-sunken p-2 sm:p-6 print:bg-transparent print:p-0">
        <ContractDocument
          content={parsed.data}
          number={c.contract_number}
          title={ver.title}
          version={version}
          signature={{ name: sig.signer_name, idNumber: sig.signer_id_number, png: sig.signature_png, signedAt: sig.signed_at, version }}
        />
      </div>
    </>
  );
}
