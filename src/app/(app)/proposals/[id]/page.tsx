import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ClipboardList } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { ProposalActions } from "@/components/proposals/proposal-actions";
import { ProposalDocument } from "@/components/proposals/proposal-document";
import { env } from "@/lib/env";
import type { ProposalStatus } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "הצעת מחיר" };

export default async function ProposalPage({ params }: PageProps<"/proposals/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: p }, { data: ws }, { data: contract }] = await Promise.all([
    supabase.from("proposals").select("*, clients(id, name, business_name, phone), proposal_items(kind, title, position)").eq("id", id).maybeSingle(),
    supabase.from("workspace_settings").select("business_name, contact_phone, contact_email").maybeSingle(),
    supabase.from("contracts").select("id").eq("proposal_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!p) notFound();
  const items = [...p.proposal_items].sort((a, b) => a.position - b.position);
  const client = p.clients;
  const who = client?.business_name || client?.name || "";
  const events: [string, string | null][] = [
    ["נשלחה", p.sent_at],
    ["נצפתה", p.viewed_at],
    [p.status === "rejected" ? "נדחתה" : "אושרה", p.responded_at],
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm text-ink-3 print:hidden">
        <Link href="/proposals" className="inline-flex items-center gap-1 hover:text-ink"><ChevronRight className="size-4" aria-hidden />הצעות מחיר</Link>
        {client && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/clients/${client.id}`} className="hover:text-ink">{who}</Link>
          </>
        )}
        {p.submission_id && (
          <>
            <span aria-hidden>·</span>
            <Link href={`/questionnaires/${p.submission_id}`} className="inline-flex items-center gap-1 hover:text-ink"><ClipboardList className="size-3.5" aria-hidden />מהשאלון</Link>
          </>
        )}
      </div>

      <div className="mb-5">
        <ProposalActions
          id={id}
          status={p.status as ProposalStatus}
          link={p.public_token ? `${env.siteUrl()}/o/${p.public_token}` : null}
          clientPhone={client?.phone ?? null}
          clientName={client?.name.split(" ")[0] ?? ""}
          convertedProjectId={p.converted_project_id}
          contractId={contract?.id ?? null}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 rounded-lg bg-sunken p-1.5 sm:p-5 print:bg-transparent print:p-0">
          <ProposalDocument
            studio={{ name: ws?.business_name ?? "weblly", phone: ws?.contact_phone ?? null, email: ws?.contact_email ?? null }}
            p={{
              number: p.number,
              title: p.title,
              client: who,
              intro: p.intro,
              scope: p.scope,
              included: items.filter((i) => i.kind === "included").map((i) => i.title),
              excluded: items.filter((i) => i.kind === "excluded").map((i) => i.title),
              price: Number(p.price),
              deposit: Number(p.deposit),
              milestones: Array.isArray(p.milestones) ? (p.milestones as { label: string; amount: number | null; when: string }[]) : [],
              delivery_estimate: p.delivery_estimate,
              valid_until: p.valid_until,
              notes: p.notes,
              date: (p.sent_at ?? p.created_at).slice(0, 10),
            }}
          />
        </div>
        <aside className="flex flex-col gap-4 print:hidden">
          <Card>
            <CardBody className="flex flex-col gap-3 text-sm">
              <h2 className="font-semibold text-ink">מעקב</h2>
              <ol className="flex flex-col gap-2">
                {events.map(([label, at]) => (
                  <li key={label} className="flex items-center justify-between gap-2">
                    <span className={at ? "text-ink-2" : "text-ink-3"}>{label}</span>
                    <span className={at ? "text-ink" : "text-ink-3"}>{at ? formatDateTime(at) : "—"}</span>
                  </li>
                ))}
              </ol>
              {p.response_name && <p className="border-t border-line pt-3 text-ink-2">אושר ע״י <span className="font-medium text-ink">{p.response_name}</span></p>}
              {p.response_note && <p className="whitespace-pre-wrap rounded-md bg-sunken/70 px-3 py-2 text-ink-2">{p.response_note}</p>}
            </CardBody>
          </Card>
          {p.internal_notes && (
            <Card>
              <CardBody className="text-sm">
                <h2 className="font-semibold text-warn">הערות פנימיות</h2>
                <p className="mt-1 whitespace-pre-wrap text-ink-2">{p.internal_notes}</p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
