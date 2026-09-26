import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileSignature } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ContractEditor } from "@/components/contracts/contract-editor";
import { clientOptions, initialContract, projectOptions } from "@/lib/data/crm";
import { first } from "@/lib/utils";

export const metadata = { title: "הסכם חדש" };

/** Step 1: pick client (and project). Step 2: edit + preview. */
export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const sp = await searchParams;
  const clientId = first(sp.client);
  const projectId = first(sp.project) ?? null;

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
  const init = await initialContract(clientId, projectId ?? (projects.length === 1 ? projects[0].value : null));
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
      <ContractEditor key={chosenProject ?? "none"} clientId={clientId} projectId={chosenProject} initialTitle={init.title} initial={init.content} />
    </>
  );
}
