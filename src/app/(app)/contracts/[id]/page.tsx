import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContractDocument } from "@/components/contracts/contract-document";
import { ContractToolbar } from "@/components/contracts/contract-toolbar";
import { SigningPanel } from "@/components/contracts/signing-panel";
import { env } from "@/lib/env";
import { contractContentSchema } from "@/lib/domain/contracts";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "הסכם" };

export default async function ContractPage({ params }: PageProps<"/contracts/[id]">) {
  await requireArea("contracts");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: c }, { data: versions }, { data: signatures }] = await Promise.all([
    supabase.from("contracts").select("*, clients(id, name, phone), files(id, original_name)").eq("id", id).maybeSingle(),
    supabase.from("contract_versions").select("version, created_at").eq("contract_id", id).order("version", { ascending: false }),
    supabase.from("contract_signatures").select("version, signer_name, signed_at, ip").eq("contract_id", id).order("signed_at"),
  ]);
  if (!c) notFound();
  const parsed = contractContentSchema.safeParse(c.content);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link href={c.clients ? `/clients/${c.clients.id}?tab=contracts` : "/clients"} className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden /> {c.clients?.name ?? "לקוחות"}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {parsed.success && (
            <Button asChild variant="secondary">
              <Link href={`/contracts/${id}/edit`}>
                <Pencil aria-hidden /> עריכה
              </Link>
            </Button>
          )}
          <ContractToolbar id={id} clientId={c.client_id} status={c.status} file={c.files} canPrint={parsed.success} pdfName={[c.contract_number, c.title].filter(Boolean).join(" ")} />
        </div>
      </div>
      <div className="mb-5">
        <SigningPanel
          id={id}
          status={c.status}
          version={c.version}
          link={c.sign_token ? `${env.siteUrl()}/s/${c.sign_token}` : null}
          clientPhone={c.clients?.phone ?? null}
          clientName={c.clients?.name.split(" ")[0] ?? ""}
          title={c.title}
          canSign={parsed.success}
          versions={(versions ?? []).map((v) => ({ ...v, signatures: (signatures ?? []).filter((sg) => sg.version === v.version) }))}
        />
      </div>
      {parsed.success ? (
        <div className="rounded-lg bg-sunken p-2 sm:p-6 print:bg-transparent print:p-0">
          <ContractDocument content={parsed.data} number={c.contract_number} title={c.title} version={c.version} />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-6 text-sm text-ink-2">
          זה הסכם שהועלה כקובץ ({c.title}). אפשר לפתוח אותו מרשימת החוזים בתיק הלקוח.
        </div>
      )}
    </>
  );
}
