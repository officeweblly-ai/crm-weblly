import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AgreementEditor } from "@/components/agreement/agreement-editor";
import { PageHeader } from "@/components/ui/misc";
import { requireArea } from "@/lib/auth";
import { getAgreementForStaff } from "@/lib/data/agreement";

export const metadata = { title: "עריכת הסכם השותפות" };

export default async function EditPartnershipPage({ params }: PageProps<"/contracts/partnership/[id]/edit">) {
  await requireArea("partners");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const view = await getAgreementForStaff(id);
  if (!view) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href={`/contracts/partnership/${id}`} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowRight className="size-4" aria-hidden />
            הסכם שותפות WEBLLY
          </Link>
        }
        title="עריכת נוסח ההסכם"
        description={`גרסה ${view.version}`}
      />
      <AgreementEditor id={view.id} title={view.title} content={view.content} version={view.version} signedCount={view.signatures.length} />
    </div>
  );
}
