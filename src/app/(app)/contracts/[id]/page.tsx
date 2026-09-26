import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContractDocument } from "@/components/contracts/contract-document";
import { ContractToolbar } from "@/components/contracts/contract-toolbar";
import { contractContentSchema } from "@/lib/domain/contracts";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "הסכם" };

export default async function ContractPage({ params }: PageProps<"/contracts/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("contracts").select("*, clients(id, name), files(id, original_name)").eq("id", id).maybeSingle();
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
          <ContractToolbar id={id} clientId={c.client_id} status={c.status} file={c.files} canPrint={parsed.success} />
        </div>
      </div>
      {parsed.success ? (
        <div className="rounded-lg bg-sunken p-2 sm:p-6 print:bg-transparent print:p-0">
          <ContractDocument content={parsed.data} number={c.contract_number} title={c.title} />
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-6 text-sm text-ink-2">
          זה הסכם שהועלה כקובץ ({c.title}). אפשר לפתוח אותו מרשימת החוזים בתיק הלקוח.
        </div>
      )}
    </>
  );
}
