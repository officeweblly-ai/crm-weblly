import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Mail, MessageCircle, MessageSquarePlus, Pencil, Phone, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { ClientFormModal } from "@/components/clients/client-form";
import { ClientMenu, ClientStatusControl } from "@/components/clients/client-menu";
import { ClientProfile } from "@/components/clients/client-profile";
import { ClientSuggestions, type Suggestion } from "@/components/clients/client-suggestions";
import { clientFieldLabel, type ClientFieldMapping } from "@/lib/domain/forms";
import { SendQuestionnaireModal } from "@/components/questionnaires/send-questionnaire";
import { InteractionModal } from "@/components/relationship/relationship-forms";
import { getClient, projectOptions, templateOptions } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";
import { whatsappLink } from "@/lib/format";
import { first } from "@/lib/utils";
import * as Tabs from "./tabs";

const TABS = [
  { key: "overview", label: "עבודה שוטפת" },
  { key: "relationship", label: "קשר" },
  { key: "questionnaires", label: "אפיון" },
  { key: "projects", label: "פרויקטים" },
  { key: "finances", label: "כספים" },
  { key: "contracts", label: "חוזים" },
  { key: "files", label: "קבצים" },
  { key: "tasks", label: "משימות" },
  { key: "notes", label: "הערות" },
  { key: "activity", label: "היסטוריה" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export async function generateMetadata({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const c = await getClient(id);
  return { title: c?.client.name ?? "לקוח" };
}

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await getClient(id);
  if (!data) notFound();
  const { client } = data;
  const tabParam = first(sp.tab);
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overview";

  const supabase = await createClient();
  const head = { count: "exact" as const, head: true };
  const [projects, subs, files, tasks, contracts, notes, templates, openFollowUps, suggestionRows, accepted] = await Promise.all([
    projectOptions(id),
    supabase.from("form_submissions").select("id", head).eq("client_id", id),
    supabase.from("files").select("id", head).eq("client_id", id),
    supabase.from("tasks").select("id", head).eq("client_id", id).neq("status", "done"),
    supabase.from("contracts").select("status").eq("client_id", id),
    supabase.from("notes").select("id", head).eq("client_id", id),
    templateOptions(),
    supabase.from("follow_ups").select("id", head).eq("client_id", id).eq("status", "open"),
    supabase.from("form_submissions").select("id, title, client_suggestions, completed_at").eq("client_id", id).eq("status", "completed").order("completed_at", { ascending: false }).limit(10),
    supabase.from("proposals").select("id, title, price").eq("client_id", id).eq("status", "accepted").order("responded_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const contractRows = contracts.data ?? [];
  const counts: Partial<Record<TabKey, number>> = {
    projects: projects.length,
    questionnaires: subs.count ?? 0,
    files: files.count ?? 0,
    tasks: tasks.count ?? 0,
    contracts: contractRows.length,
    notes: notes.count ?? 0,
    relationship: openFollowUps.count ?? 0,
  };
  const pending = (suggestionRows.data ?? []).find((r) => r.client_suggestions && Object.keys(r.client_suggestions as object).length > 0);
  const suggestion: Suggestion | null = pending
    ? {
        submissionId: pending.id,
        title: pending.title,
        items: Object.entries(pending.client_suggestions as Record<string, string>).map(([field, next]) => ({
          field,
          next,
          label: clientFieldLabel[`client.${field}` as ClientFieldMapping] ?? field,
          current: (client as Record<string, unknown>)[field] as string | null,
        })),
      }
    : null;
  const wa = whatsappLink(client.phone);

  return (
    <>
      <div className="mb-2">
        <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden />
          לקוחות
        </Link>
      </div>

      {/* Case-file header */}
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">{client.name}</h1>
            <ClientStatusControl id={client.id} status={client.status} />
            {client.is_demo && <Badge tone="neutral" dot={false}>נתוני דמו</Badge>}
          </div>
          {client.business_name && <p className="mt-0.5 text-base text-ink-2 sm:text-lg">{client.business_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {client.phone && (
            <Button asChild variant="secondary" size="icon" aria-label="חיוג ללקוח" title="חיוג">
              <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}><Phone aria-hidden /></a>
            </Button>
          )}
          {wa && (
            <Button asChild variant="secondary" size="icon" aria-label="וואטסאפ ללקוח" title="וואטסאפ">
              <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="text-ok" aria-hidden /></a>
            </Button>
          )}
          {client.email && (
            <Button asChild variant="secondary" size="icon" aria-label="אימייל ללקוח" title="אימייל" className="max-sm:hidden">
              <a href={`mailto:${client.email}`}><Mail aria-hidden /></a>
            </Button>
          )}
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <InteractionModal
            clientId={client.id}
            projects={projects}
            trigger={
              <Button className="max-sm:flex-1">
                <MessageSquarePlus aria-hidden />
                <span className="max-[380px]:sr-only">אינטראקציה</span>
              </Button>
            }
          />
          <SendQuestionnaireModal
            templates={templates}
            projects={projects}
            clientId={client.id}
            clientPhone={client.phone}
            trigger={
              <Button variant="secondary" aria-label="שליחת שאלון">
                <Send aria-hidden />
                <span className="max-sm:sr-only">שאלון</span>
              </Button>
            }
          />
          <ClientFormModal
            client={client}
            trigger={
              <Button variant="secondary" aria-label="עריכת פרטי לקוח">
                <Pencil aria-hidden />
                <span className="max-sm:sr-only">עריכה</span>
              </Button>
            }
          />
          <ClientMenu id={client.id} name={client.name} archived={client.status === "archived"} />
        </div>
      </header>

      {suggestion && <ClientSuggestions suggestion={suggestion} />}

      <ClientProfile
        client={client}
        commitment={{
          financials: data.financials,
          signedContracts: contractRows.filter((c) => c.status === "signed").length,
          openContracts: contractRows.filter((c) => c.status === "draft" || c.status === "sent").length,
          acceptedProposal: accepted.data ? { ...accepted.data, price: Number(accepted.data.price) } : null,
          activeProjects: projects.length,
        }}
      />

      <LinkTabs
        tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))}
        active={tab}
        hrefFor={(k) => (k === "overview" ? `/clients/${id}` : `/clients/${id}?tab=${k}`)}
      />

      {tab === "overview" && <Tabs.Overview clientId={id} client={client} financials={data.financials} />}
      {tab === "relationship" && <Tabs.RelationshipTab clientId={id} client={client} projects={projects} />}
      {tab === "questionnaires" && <Tabs.Questionnaires clientId={id} phone={client.phone} templates={templates} projects={projects} />}
      {tab === "projects" && <Tabs.Projects clientId={id} />}
      {tab === "finances" && <Tabs.Finances clientId={id} financials={data.financials} />}
      {tab === "contracts" && <Tabs.Contracts clientId={id} projects={projects} />}
      {tab === "files" && <Tabs.Files clientId={id} projects={projects} />}
      {tab === "tasks" && <Tabs.TasksTab clientId={id} projects={projects} />}
      {tab === "notes" && <Tabs.NotesTab clientId={id} />}
      {tab === "activity" && <Tabs.ActivityTab clientId={id} />}
    </>
  );
}
