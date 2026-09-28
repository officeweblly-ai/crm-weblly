import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MessageCircle, MessageSquarePlus, Pencil, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/link-tabs";
import { EmailLink, PhoneLink, UrlLink } from "@/components/ui/misc";
import { ClientFormModal } from "@/components/clients/client-form";
import { ClientMenu, ClientStatusControl } from "@/components/clients/client-menu";
import { SendQuestionnaireModal } from "@/components/questionnaires/send-questionnaire";
import { InteractionModal } from "@/components/relationship/relationship-forms";
import { getClient, projectOptions, templateOptions } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";
import { whatsappLink } from "@/lib/format";
import { first } from "@/lib/utils";
import * as Tabs from "./tabs";

const TABS = [
  { key: "overview", label: "סקירה" },
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
  const [projects, subs, files, tasks, contracts, notes, templates] = await Promise.all([
    projectOptions(id),
    supabase.from("form_submissions").select("id", head).eq("client_id", id),
    supabase.from("files").select("id", head).eq("client_id", id),
    supabase.from("tasks").select("id", head).eq("client_id", id).neq("status", "done"),
    supabase.from("contracts").select("id", head).eq("client_id", id),
    supabase.from("notes").select("id", head).eq("client_id", id),
    templateOptions(),
  ]);
  const { count: openFollowUps } = await supabase.from("follow_ups").select("id", head).eq("client_id", id).eq("status", "open");
  const counts: Partial<Record<TabKey, number>> = {
    projects: projects.length,
    questionnaires: subs.count ?? 0,
    files: files.count ?? 0,
    tasks: tasks.count ?? 0,
    contracts: contracts.count ?? 0,
    notes: notes.count ?? 0,
    relationship: openFollowUps ?? 0,
  };
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
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold leading-tight text-ink">{client.name}</h1>
            <ClientStatusControl id={client.id} status={client.status} />
            {client.is_demo && <Badge tone="neutral" dot={false}>נתוני דמו</Badge>}
          </div>
          {client.business_name && <p className="mt-1 text-lg text-ink-2">{client.business_name}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {client.phone && (
              <span className="inline-flex items-center gap-2">
                <PhoneLink phone={client.phone} />
                {wa && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ok hover:underline" aria-label="וואטסאפ ללקוח">
                    <MessageCircle className="size-4" aria-hidden />
                  </a>
                )}
              </span>
            )}
            {client.email && <EmailLink email={client.email} />}
            {client.website && <UrlLink url={client.website} />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InteractionModal
            clientId={client.id}
            projects={projects}
            trigger={
              <Button>
                <MessageSquarePlus aria-hidden />
                אינטראקציה
              </Button>
            }
          />
          <SendQuestionnaireModal
            templates={templates}
            projects={projects}
            clientId={client.id}
            clientPhone={client.phone}
            trigger={
              <Button variant="secondary">
                <Send aria-hidden />
                שאלון
              </Button>
            }
          />
          <ClientFormModal
            client={client}
            trigger={
              <Button variant="secondary">
                <Pencil aria-hidden />
                עריכה
              </Button>
            }
          />
          <ClientMenu id={client.id} name={client.name} archived={client.status === "archived"} />
        </div>
      </header>

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
