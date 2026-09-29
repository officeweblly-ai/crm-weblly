import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ClipboardList, ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ProposalEditor, type ProposalInitial } from "@/components/proposals/proposal-editor";
import { clientOptions, projectOptions } from "@/lib/data/crm";
import { draftFromQuestionnaire, STANDARD_EXCLUDED, STANDARD_INCLUDED } from "@/lib/domain/proposals";
import { projectType } from "@/lib/domain/labels";
import { isoDateOffset } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { first } from "@/lib/utils";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "הצעת מחיר חדשה" };

const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

/** From a questionnaire (?submission=), from a client (?client=), or pick a client first. */
export default async function NewProposalPage({ searchParams }: PageProps<"/proposals/new">) {
  await requireArea("proposals");
  const sp = await searchParams;
  const submissionId = isId(first(sp.submission));
  let clientId = isId(first(sp.client));
  let projectId = isId(first(sp.project)) ?? null;
  const supabase = await createClient();

  let initial: Omit<ProposalInitial, "client_id"> | null = null;
  if (submissionId) {
    const [{ data: sub }, { data: answers }] = await Promise.all([
      supabase.from("form_submissions").select("id, status, client_id, project_id, template_id, clients(name, business_name), projects(project_type), form_templates(project_type)").eq("id", submissionId).maybeSingle(),
      supabase.from("form_answers").select("section_title, question_label, question_type, value").eq("submission_id", submissionId).order("section_position").order("position"),
    ]);
    if (!sub || !sub.client_id) notFound();
    clientId = sub.client_id;
    projectId = sub.project_id;
    const type = sub.projects?.project_type ?? sub.form_templates?.project_type ?? null;
    const d = draftFromQuestionnaire({ answers: answers ?? [], clientLabel: sub.clients?.business_name || sub.clients?.name || "הלקוח", typeLabel: type ? projectType.label(type) : "אתר" });
    initial = { ...d, project_id: projectId, submission_id: sub.id, project_type: type, price: 0, deposit: 0, milestones: [], valid_until: isoDateOffset(14), internal_notes: "" };
  }

  if (!clientId) {
    const clients = await clientOptions();
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="הצעת מחיר חדשה" description="בחרו לקוח. טיפ: מתוך שאלון אפיון שהתקבל, ההצעה נבנית מהתשובות." />
        {clients.length ? (
          <Card>
            <ul className="divide-y divide-line">
              {clients.map((c) => (
                <li key={c.value}>
                  <Link href={`/proposals/new?client=${c.value}`} className="flex min-h-12 items-center justify-between px-5 py-3 text-sm hover:bg-sunken/50">
                    <span className="font-medium text-ink">{c.label}</span>
                    <ChevronRight className="size-4 rotate-180 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card>
            <EmptyState icon={ReceiptText} title="אין עדיין לקוחות" description="הצעת מחיר נבנית עבור לקוח. צרו לקוח קודם." />
          </Card>
        )}
      </div>
    );
  }

  const [{ data: client }, projects] = await Promise.all([supabase.from("clients").select("name, business_name").eq("id", clientId).maybeSingle(), projectOptions(clientId)]);
  if (!client) notFound();
  const label = client.business_name || client.name;
  const init: ProposalInitial = {
    client_id: clientId,
    ...(initial ?? {
      project_id: projectId ?? (projects.length === 1 ? projects[0].value : null),
      submission_id: null,
      title: `הצעת מחיר — ${label}`,
      project_type: null,
      intro: "",
      scope: "",
      included: STANDARD_INCLUDED,
      excluded: STANDARD_EXCLUDED,
      price: 0,
      deposit: 0,
      milestones: [],
      delivery_estimate: "",
      valid_until: isoDateOffset(14),
      notes: "",
      internal_notes: "",
    }),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1 hover:text-ink">
            <ChevronRight className="size-4" aria-hidden /> {label}
          </Link>
        }
        title="הצעת מחיר חדשה"
        description={
          submissionId ? (
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList className="size-4 text-accent" aria-hidden />
              מולא מתוך שאלון האפיון. המחיר תמיד שלכם — המערכת לא מנחשת סכומים.
            </span>
          ) : (
            "כלול / לא כלול מולאו מרשימת ברירת המחדל של הסטודיו — משנים חופשי."
          )
        }
      />
      <ProposalEditor initial={init} projects={projects} />
    </div>
  );
}
