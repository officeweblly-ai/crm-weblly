import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileSignature } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ContractEditor } from "@/components/contracts/contract-editor";
import { clientOptions, initialContract, projectOptions } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";
import { first } from "@/lib/utils";

export const metadata = { title: "הסכם חדש" };

/** Step 1: pick client (and project). Step 2: edit + preview. */
export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const sp = await searchParams;
  let clientId = first(sp.client);
  let projectId = first(sp.project) ?? null;
  // From an accepted proposal: client, project, price, deposit, scope and milestones carry over.
  const proposalParam = first(sp.proposal);
  const proposalId = proposalParam && /^[0-9a-f-]{36}$/i.test(proposalParam) ? proposalParam : null;
  let proposal: Parameters<typeof initialContract>[2] = null;
  if (proposalId) {
    const supabase = await createClient();
    const { data: p } = await supabase.from("proposals").select("client_id, project_id, converted_project_id, price, deposit, scope, delivery_estimate, milestones, proposal_items(kind, title, position)").eq("id", proposalId).maybeSingle();
    if (!p) notFound();
    clientId = p.client_id;
    projectId = p.converted_project_id ?? p.project_id;
    const items = [...p.proposal_items].sort((a, b) => a.position - b.position);
    proposal = {
      price: Number(p.price),
      deposit: Number(p.deposit),
      scope: p.scope,
      delivery_estimate: p.delivery_estimate,
      milestones: Array.isArray(p.milestones) ? (p.milestones as { label: string; amount: number | null; when: string }[]) : [],
      included: items.filter((i) => i.kind === "included").map((i) => i.title),
      excluded: items.filter((i) => i.kind === "excluded").map((i) => i.title),
    };
  }

  if (!clientId) {
    const clients = await clientOptions();
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="הסכם חדש" description="בחר לקוח — הפרטים שלו, של הפרויקט ושל הסטודיו ימולאו בהסכם אוטומטית." />
        {clients.length ? (
          <Card>
            <ul className="divide-y divide-line">
              {clients.map((c) => (
                <li key={c.value}>
                  <Link href={`/contracts/new?client=${c.value}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-sunken/50">
                    <span className="font-medium text-ink">{c.label}</span>
                    <ChevronRight className="size-4 rotate-180 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card>
            <EmptyState icon={FileSignature} title="אין עדיין לקוחות" description="הסכם נבנה מתוך תיק לקוח. צור לקוח קודם." />
          </Card>
        )}
      </div>
    );
  }

  const projects = await projectOptions(clientId);
  const init = await initialContract(clientId, projectId ?? (projects.length === 1 ? projects[0].value : null), proposal);
  if (!init) notFound();
  const chosenProject = projectId ?? (projects.length === 1 ? projects[0].value : null);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/clients/${clientId}?tab=contracts`} className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronRight className="size-4" aria-hidden /> {init.content.client.name}
          </Link>
        }
        title="הסכם חדש"
        description="הפרטים מולאו מתיק הלקוח ומהפרויקט. כל טקסט אפשר לשנות — ההסכם נשמר כפי שהוא, גם אם הפרויקט ישתנה אחר כך."
        actions={
          projects.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-ink-3">פרויקט:</span>
              {projects.map((p) => (
                <Link
                  key={p.value}
                  href={`/contracts/new?client=${clientId}&project=${p.value}`}
                  className={`rounded-full border px-3 py-1 ${chosenProject === p.value ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-ink-2 hover:bg-sunken"}`}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      <ContractEditor key={chosenProject ?? "none"} clientId={clientId} projectId={chosenProject} proposalId={proposalId} initialTitle={init.title} initial={init.content} />
    </>
  );
}
