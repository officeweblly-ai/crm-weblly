import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { ContractEditor } from "@/components/contracts/contract-editor";
import { contractContentSchema } from "@/lib/domain/contracts";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "עריכת הסכם" };

export default async function EditContractPage({ params }: PageProps<"/contracts/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const parsed = contractContentSchema.safeParse(c.content);
  if (!parsed.success) notFound();
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/contracts/${id}`} className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronRight className="size-4" aria-hidden /> חזרה להסכם
          </Link>
        }
        title={`עריכת הסכם${c.contract_number ? ` ${c.contract_number}` : ""}`}
      />
      <ContractEditor id={id} number={c.contract_number} clientId={c.client_id} projectId={c.project_id} initialTitle={c.title} initial={parsed.data} />
    </>
  );
}
