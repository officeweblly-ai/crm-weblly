import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { ProposalEditor } from "@/components/proposals/proposal-editor";
import { projectOptions } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "עריכת הצעת מחיר" };

export default async function EditProposalPage({ params }: PageProps<"/proposals/[id]/edit">) {
  await requireArea("proposals");
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("*, proposal_items(kind, title, position)").eq("id", id).maybeSingle();
  if (!p) notFound();
  if (p.status === "accepted") redirect(`/proposals/${id}`);
  const projects = await projectOptions(p.client_id);
  const items = [...p.proposal_items].sort((a, b) => a.position - b.position);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href={`/proposals/${id}`} className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronRight className="size-4" aria-hidden /> חזרה להצעה
          </Link>
        }
        title="עריכת הצעת מחיר"
        description={p.status !== "draft" ? "ההצעה כבר נשלחה — הלקוח יראה את הגרסה המעודכנת באותו קישור." : undefined}
      />
      <ProposalEditor
        id={id}
        projects={projects}
        initial={{
          client_id: p.client_id,
          project_id: p.project_id,
          submission_id: p.submission_id,
          title: p.title,
          project_type: p.project_type,
          intro: p.intro ?? "",
          scope: p.scope ?? "",
          included: items.filter((i) => i.kind === "included").map((i) => i.title),
          excluded: items.filter((i) => i.kind === "excluded").map((i) => i.title),
          price: Number(p.price),
          deposit: Number(p.deposit),
          milestones: Array.isArray(p.milestones) ? (p.milestones as { label: string; amount: number | null; when: string }[]) : [],
          delivery_estimate: p.delivery_estimate ?? "",
          valid_until: p.valid_until ?? "",
          notes: p.notes ?? "",
          internal_notes: p.internal_notes ?? "",
        }}
      />
    </div>
  );
}
