import Link from "next/link";
import { ClipboardList, FileSignature, FolderKanban, FolderPlus, MessagesSquare, Plus, Receipt, Send, StickyNote } from "lucide-react";
import { Timeline } from "@/components/activity/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DataItem, DataList } from "@/components/ui/card";
import { EmptyState, Money } from "@/components/ui/misc";
import { ContractFormModal, ContractList } from "@/components/contracts/contracts";
import { FileGrid, GroupedFiles } from "@/components/files/file-list";
import { FilesPanel } from "@/components/files/files-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { PaymentFormModal } from "@/components/payments/payment-form";
import { PaymentsTable } from "@/components/payments/payments-table";
import { ProjectFormModal } from "@/components/projects/project-form";
import { ProjectSummary } from "@/components/projects/project-summary";
import { LedgerBar } from "@/components/projects/lifecycle";
import { AnswersView } from "@/components/questionnaires/answers-view";
import { SendQuestionnaireModal } from "@/components/questionnaires/send-questionnaire";
import { SubmissionsList } from "@/components/questionnaires/submissions-list";
import { TaskFormModal } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";
import { FollowUpModal, InteractionModal } from "@/components/relationship/relationship-forms";
import { FollowUpItem, InteractionItem, type FollowUpRow } from "@/components/relationship/relationship-rows";
import {
  getSubmission,
  listActivity,
  listContracts,
  listFiles,
  listNotes,
  listPayments,
  listProjects,
  listSubmissions,
  listTasks,
  staffOptions,
  withThumbs,
} from "@/lib/data/crm";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { submissionStatus, type ProjectType } from "@/lib/domain/labels";
import { formatDate, relativeDue, timeAgo } from "@/lib/format";
import type { Tables, Views } from "@/lib/supabase/database.types";

type Opt = { value: string; label: string; clientId: string };

function Panel({ title, action, children, flush }: { title: string; action?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
      {flush ? children : <CardBody>{children}</CardBody>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
export async function Overview({ clientId, client, financials }: { clientId: string; client: Tables<"clients">; financials: Views<"client_financials"> | null }) {
  const [{ rows: projects }, tasks, activity, { rows: subs }, { rows: files }] = await Promise.all([
    listProjects({ clientId, page: 1, all: true, sort: "updated" }),
    listTasks({ clientId, status: "open", limit: 5 }),
    listActivity({ clientId, limit: 6 }),
    listSubmissions({ clientId }),
    listFiles({ clientId, limit: 40 }),
  ]);
  const active = projects.filter((p) => p.status !== "completed");
  const primary = active[0] ?? projects[0];
  const others = projects.filter((p) => p.id !== primary?.id);
  const latestSub = subs[0];
  const important = await withThumbs(files.filter((f) => ["branding", "contracts", "questionnaire"].includes(f.category)).slice(0, 4));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {primary ? (
          <section aria-label="פרויקט נוכחי">
            <ProjectSummary project={primary} />
            {others.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {others.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2.5 text-sm hover:border-line-strong">
                      <span className="truncate font-medium text-ink">{p.name}</span>
                      <span className="shrink-0 text-ink-3">
                        יתרה <Money value={p.financials?.balance_due ?? 0} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <Card>
            <EmptyState
              icon={FolderKanban}
              title="ללקוח אין פרויקט עדיין"
              description="פרויקט מחזיק את המחיר, המקדמה, הסטטוס והמשימות."
              action={<ProjectFormModal clientId={clientId} trigger={<Button><FolderPlus aria-hidden />פרויקט חדש</Button>} />}
            />
          </Card>
        )}

        <Panel
          title="שאלון אפיון"
          action={
            <Button asChild variant="link" size="sm">
              <Link href={`/clients/${clientId}?tab=questionnaires`}>הכול</Link>
            </Button>
          }
        >
          {latestSub ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{latestSub.title}</span>
                  <Badge tone={submissionStatus.tone(latestSub.status)}>{submissionStatus.label(latestSub.status)}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-3">
                  {latestSub.status === "completed" ? `התקבל ${timeAgo(latestSub.completed_at)}` : `נוצר ${timeAgo(latestSub.created_at)}`}
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/questionnaires/${latestSub.id}`}>{latestSub.status === "completed" ? "צפייה בתשובות" : "מעקב"}</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-ink-3">עוד לא נשלח שאלון. &quot;שליחת שאלון&quot; למעלה יוצר קישור אישי ללקוח.</p>
          )}
        </Panel>

        <Panel
          title="משימות פתוחות"
          flush
          action={
            <Button asChild variant="link" size="sm">
              <Link href={`/clients/${clientId}?tab=tasks`}>הכול</Link>
            </Button>
          }
        >
          {tasks.length ? <TaskList tasks={tasks} showContext /> : <p className="px-5 py-4 text-sm text-ink-3">אין משימות פתוחות.</p>}
        </Panel>
      </div>

      <aside className="flex min-w-0 flex-col gap-5">
        <Panel title="קשר עם הלקוח" action={<Button asChild variant="link" size="sm"><Link href={`/clients/${clientId}?tab=relationship`}>הכול</Link></Button>}>
          <DataList className="grid-cols-2 sm:grid-cols-2">
            <DataItem label="קשר אחרון">{client.last_interaction_at ? timeAgo(client.last_interaction_at) : "לא נרשם"}</DataItem>
            <DataItem label="מעקב הבא">{client.next_follow_up_date ? relativeDue(client.next_follow_up_date) : null}</DataItem>
          </DataList>
        </Panel>

        {(financials?.project_count ?? 0) > 0 && (
          <Panel title="מצב תשלומים">
            <LedgerBar total={financials?.total_price ?? 0} paid={financials?.amount_paid ?? 0} deposit={0} />
            <Button asChild variant="link" size="sm" className="mt-3">
              <Link href={`/clients/${clientId}?tab=finances`}>היסטוריית תשלומים</Link>
            </Button>
          </Panel>
        )}

        {important.length > 0 && (
          <Panel title="קבצים חשובים" action={<Button asChild variant="link" size="sm"><Link href={`/clients/${clientId}?tab=files`}>הכול</Link></Button>}>
            <FileGrid files={important} />
          </Panel>
        )}

        <Panel title="פעילות אחרונה" action={<Button asChild variant="link" size="sm"><Link href={`/clients/${clientId}?tab=activity`}>הכול</Link></Button>}>
          {activity.length ? <Timeline items={activity} compact /> : <p className="text-sm text-ink-3">אין פעילות עדיין.</p>}
        </Panel>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
export async function Questionnaires({ clientId, phone, templates, projects }: { clientId: string; phone: string | null; templates: { id: string; name: string; project_type: ProjectType | null }[]; projects: Opt[] }) {
  const { rows } = await listSubmissions({ clientId });
  const latestDone = rows.find((r) => r.status === "completed");
  const detail = latestDone ? await getSubmission(latestDone.id) : null;
  const send = (
    <SendQuestionnaireModal templates={templates} projects={projects} clientId={clientId} clientPhone={phone} trigger={<Button size="sm"><Send aria-hidden />שאלון חדש</Button>} />
  );
  return (
    <div className="flex flex-col gap-5">
      <Panel title="שאלונים" action={send} flush>
        {rows.length ? (
          <SubmissionsList rows={rows} />
        ) : (
          <EmptyState compact icon={ClipboardList} title="עוד לא נשלח שאלון" description="השאלון אוסף מהלקוח את כל מה שצריך כדי להתחיל — טקסטים, צבעים, לוגו, השראות." action={send} />
        )}
      </Panel>
      {detail && (
        <Panel
          title={`תשובות: ${detail.submission.title}`}
          action={<Button asChild variant="link" size="sm"><Link href={`/questionnaires/${detail.submission.id}`}>לעמוד המלא</Link></Button>}
        >
          <AnswersView sections={detail.sections} files={Object.fromEntries(detail.files)} />
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export async function Projects({ clientId }: { clientId: string }) {
  const { rows } = await listProjects({ clientId, page: 1, all: true });
  const add = <ProjectFormModal clientId={clientId} trigger={<Button size="sm"><Plus aria-hidden />פרויקט חדש</Button>} />;
  if (!rows.length)
    return (
      <Card>
        <EmptyState icon={FolderKanban} title="אין פרויקטים" description="פתח פרויקט כדי לנהל מחיר, מקדמה, סטטוס ומשימות." action={add} />
      </Card>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{add}</div>
      <div className="grid gap-4 xl:grid-cols-2">
        {rows.map((p) => (
          <ProjectSummary key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export async function Finances({ clientId, financials }: { clientId: string; financials: Views<"client_financials"> | null }) {
  const [payments, { rows: projects }] = await Promise.all([listPayments({ clientId }), listProjects({ clientId, page: 1, all: true })]);
  const projectOpts = projects.map((p) => ({ value: p.id, label: p.name, balance: p.financials?.balance_due }));
  const add = projects.length ? (
    projects.length === 1 ? (
      <PaymentFormModal projectId={projects[0].id} balance={projects[0].financials?.balance_due} trigger={<Button size="sm"><Plus aria-hidden />רישום תשלום</Button>} />
    ) : (
      <PaymentFormModal projects={projectOpts} trigger={<Button size="sm"><Plus aria-hidden />רישום תשלום</Button>} />
    )
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="סיכום לקוח" />
          <CardBody>
            <LedgerBar total={financials?.total_price ?? 0} paid={financials?.amount_paid ?? 0} deposit={0} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="לפי פרויקט" />
          <ul className="divide-y divide-line">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <Link href={`/projects/${p.id}`} className="min-w-0 truncate font-medium text-ink hover:text-accent">{p.name}</Link>
                <span className="shrink-0 text-ink-3">
                  <Money value={p.financials?.amount_paid ?? 0} className="text-ok" /> / <Money value={p.total_price} />
                </span>
              </li>
            ))}
            {!projects.length && <li className="px-5 py-3 text-sm text-ink-3">אין פרויקטים עדיין.</li>}
          </ul>
        </Card>
      </div>
      <Panel title="היסטוריית תשלומים" action={add} flush>
        {payments.length ? (
          <div className="p-3 md:p-0">
            <PaymentsTable payments={payments} />
          </div>
        ) : (
          <EmptyState compact icon={Receipt} title="אין תשלומים עדיין" description={projects.length ? "כל תשלום שנרשם מעדכן אוטומטית את היתרה." : "קודם פותחים פרויקט עם מחיר, ואז רושמים תשלומים."} action={add} />
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
export async function Contracts({ clientId, projects }: { clientId: string; projects: Opt[] }) {
  const contracts = await listContracts({ clientId });
  const add = <ContractFormModal clientId={clientId} projects={projects} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />העלאת קובץ</Button>} />;
  const create = (
    <Button asChild size="sm">
      <Link href={`/contracts/new?client=${clientId}`}><FileSignature aria-hidden />יצירת הסכם</Link>
    </Button>
  );
  return (
    <Panel title="חוזים והסכמים" action={<>{add}{create}</>} flush>
      {contracts.length ? (
        <ContractList contracts={contracts} projects={projects} />
      ) : (
        <EmptyState compact icon={FileSignature} title="אין חוזים" description="צור הסכם עבודה ממותג עם כל הפרטים של הלקוח והפרויקט — או העלה הסכם קיים." action={<div className="flex gap-2">{create}{add}</div>} />
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
export async function Files({ clientId, projects }: { clientId: string; projects: Opt[] }) {
  const { rows } = await listFiles({ clientId });
  const files = await withThumbs(rows);
  return (
    <div className="flex flex-col gap-5">
      <FilesPanel clientId={clientId} projects={projects} />
      {files.length ? (
        <GroupedFiles files={files} />
      ) : (
        <p className="py-6 text-center text-sm text-ink-3">אין קבצים עדיין. לוגו, תמונות וחומרים שהלקוח מעלה בשאלון יופיעו כאן אוטומטית.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export async function TasksTab({ clientId, projects }: { clientId: string; projects: Opt[] }) {
  const [open, done] = await Promise.all([listTasks({ clientId, status: "open" }), listTasks({ clientId, status: "done", limit: 30 })]);
  const add = <TaskFormModal clientId={clientId} projects={projects} trigger={<Button size="sm"><Plus aria-hidden />משימה</Button>} />;
  return (
    <div className="flex flex-col gap-5">
      <Panel title="לביצוע" action={add} flush>
        {open.length ? <TaskList tasks={open} showContext /> : <p className="px-5 py-4 text-sm text-ink-3">אין משימות פתוחות.</p>}
      </Panel>
      {done.length > 0 && (
        <details className="group rounded-lg border border-line bg-surface shadow-1">
          <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-ink-2 hover:text-ink">הושלמו ({done.length})</summary>
          <div className="border-t border-line">
            <TaskList tasks={done} showContext />
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export async function NotesTab({ clientId }: { clientId: string }) {
  const notes = await listNotes({ clientId });
  return (
    <div className="max-w-3xl">
      <NotesPanel clientId={clientId} notes={notes} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export async function ActivityTab({ clientId }: { clientId: string }) {
  const items = await listActivity({ clientId, limit: 150 });
  return (
    <Card className="max-w-3xl">
      <CardBody>
        {items.length ? <Timeline items={items} /> : <EmptyState compact icon={StickyNote} title="אין פעילות" />}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// V3 — the relationship: history, money over time, contact and follow-ups.
// ---------------------------------------------------------------------------
export async function RelationshipTab({ clientId, client, projects }: { clientId: string; client: Tables<"clients">; projects: Opt[] }) {
  const supabase = await createServerClient();
  const [{ data: rel }, { data: interactions }, { data: followUps }, staff] = await Promise.all([
    supabase.from("client_relationship").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("client_interactions").select("*, profiles(full_name, email)").eq("client_id", clientId).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("follow_ups").select("*, profiles!follow_ups_assigned_to_fkey(full_name, email)").eq("client_id", clientId).neq("status", "cancelled").order("due_date").limit(60),
    staffOptions(),
  ]);
  const open = (followUps ?? []).filter((f) => f.status === "open");
  const done = (followUps ?? []).filter((f) => f.status === "done").slice(-5).reverse();
  const toRow = (f: NonNullable<typeof followUps>[number]): FollowUpRow => ({
    id: f.id, due_date: f.due_date, reason: f.reason, note: f.note, status: f.status,
    assignee: f.profiles ? (f.profiles.full_name || f.profiles.email).split(" ")[0] : null,
  });
  const facts: [string, React.ReactNode][] = [
    ["לקוח מאז", formatDate(client.created_at.slice(0, 10))],
    ["רכישה ראשונה", rel?.first_purchase_date ? formatDate(rel.first_purchase_date) : null],
    ["רכישה אחרונה", rel?.last_purchase_date ? formatDate(rel.last_purchase_date) : null],
    ["תשלום אחרון", rel?.last_payment_date ? formatDate(rel.last_payment_date) : null],
    ["סה״כ הכנסות מהלקוח", <Money key="m" value={rel?.total_revenue ?? 0} className="font-semibold" />],
    ["פרויקטים", rel ? `${rel.project_count}${rel.active_project_count ? ` (${rel.active_project_count} פעילים)` : ""}` : "0"],
    ["קשר אחרון", client.last_interaction_at ? timeAgo(client.last_interaction_at) : "לא נרשם"],
    ["מעקב הבא", client.next_follow_up_date ? relativeDue(client.next_follow_up_date) : null],
    ["שירותים נוכחיים", client.services],
  ];
  const addInteraction = <InteractionModal clientId={clientId} projects={projects} trigger={<Button size="sm"><Plus aria-hidden />אינטראקציה</Button>} />;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="מעקבים" flush action={<FollowUpModal clientId={clientId} staff={staff} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />מעקב</Button>} />}>
          {open.length ? (
            <ul className="divide-y divide-line">{open.map((f) => <FollowUpItem key={f.id} f={toRow(f)} />)}</ul>
          ) : (
            <p className="px-5 py-4 text-sm text-ink-3">אין מעקבים פתוחים. מעקב נפתח גם אוטומטית כשרושמים אינטראקציה עם תאריך.</p>
          )}
          {done.length > 0 && (
            <details className="border-t border-line">
              <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-ink-3 hover:text-ink">בוצעו לאחרונה ({done.length})</summary>
              <ul className="divide-y divide-line">{done.map((f) => <FollowUpItem key={f.id} f={toRow(f)} />)}</ul>
            </details>
          )}
        </Panel>
        <Panel title="היסטוריית קשר" action={addInteraction}>
          {interactions?.length ? (
            <ol className="flex flex-col">
              {interactions.map((i, idx) => (
                <InteractionItem
                  key={i.id}
                  last={idx === interactions.length - 1}
                  i={{ ...i, user: i.profiles ? (i.profiles.full_name || i.profiles.email).split(" ")[0] : null }}
                />
              ))}
            </ol>
          ) : (
            <EmptyState compact icon={MessagesSquare} title="עוד לא נרשמה אינטראקציה" description="שיחה, וואטסאפ או פגישה — רושמים כאן, והמערכת זוכרת מתי דיברתם לאחרונה ומתי לחזור." action={addInteraction} />
          )}
        </Panel>
      </div>
      <aside className="flex min-w-0 flex-col gap-5">
        <Panel title="הקשר העסקי">
          <DataList className="sm:grid-cols-1">
            {facts.map(([label, value]) => (
              <DataItem key={label} label={label}>{value}</DataItem>
            ))}
          </DataList>
        </Panel>
      </aside>
    </div>
  );
}
