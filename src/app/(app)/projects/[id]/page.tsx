import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronRight, ClipboardList, Plus, Receipt, Send } from "lucide-react";
import { Timeline } from "@/components/activity/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DataItem, DataList } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { ContractFormModal, ContractList } from "@/components/contracts/contracts";
import { GroupedFiles } from "@/components/files/file-list";
import { FilesPanel } from "@/components/files/files-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import { PaymentFormModal } from "@/components/payments/payment-form";
import { PaymentsTable } from "@/components/payments/payments-table";
import { AiHandoffCard } from "@/components/projects/ai-handoff";
import { ControlCenter, type WaitingItem } from "@/components/projects/control-center";
import { ApprovalsCard, PresentationCard } from "@/components/projects/project-client";
import { ProjectFollowUps } from "@/components/projects/project-followups";
import { ProjectLinksCard } from "@/components/projects/project-links";
import { ProjectReferencesCard } from "@/components/projects/project-references";
import { ProjectMenu, ProjectStatusControl } from "@/components/projects/project-controls";
import { Deadline } from "@/components/projects/project-summary";
import { SendQuestionnaireModal } from "@/components/questionnaires/send-questionnaire";
import { SubmissionsList } from "@/components/questionnaires/submissions-list";
import { ChecklistButton } from "@/components/tasks/checklist-button";
import { TaskFormModal } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";
import {
  getProject,
  getProjectHub,
  listActivity,
  listContracts,
  listFiles,
  listNotes,
  listPayments,
  listSubmissions,
  listTasks,
  projectOptions,
  templateOptions,
  withThumbs,
} from "@/lib/data/crm";
import { DESIGN_APPROVAL_KINDS, DEV_CHECKLIST, projectType, type ApprovalKind } from "@/lib/domain/labels";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const p = await getProject(id);
  return { title: p?.name ?? "פרויקט" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const supabase = await createClient();
  const [payments, openTasks, doneTasks, { rows: subs }, { rows: fileRows }, contracts, notes, activity, templates, projects, { data: client }, hub] = await Promise.all([
    listPayments({ projectId: id }),
    listTasks({ projectId: id, status: "open" }),
    listTasks({ projectId: id, status: "done", limit: 50 }),
    listSubmissions({ projectId: id }),
    listFiles({ projectId: id, limit: 60 }),
    listContracts({ projectId: id }),
    listNotes({ projectId: id }),
    listActivity({ projectId: id, limit: 30 }),
    templateOptions(),
    projectOptions(project.client_id),
    supabase.from("clients").select("phone, status").eq("id", project.client_id).maybeSingle(),
    getProjectHub(id),
  ]);
  const files = await withThumbs(fileRows);
  const fin = project.financials;
  const balance = fin?.balance_due ?? project.total_price;
  const { client: _c, financials: _f, ...projectRow } = project;
  void _c;
  void _f;

  // What the project is waiting on from the client — shown at the top.
  const waiting: WaitingItem[] = [
    ...hub.approvals.filter((a) => a.status === "pending").map((a) => ({ key: `a-${a.id}`, label: `אישור: ${a.title}`, href: "#approvals" })),
    ...openTasks.filter((t) => t.status === "waiting_client").map((t) => ({ key: `t-${t.id}`, label: t.title, href: "#tasks" })),
    ...subs.filter((q) => q.status === "sent" || q.status === "in_progress" || q.status === "created").map((q) => ({ key: `q-${q.id}`, label: `שאלון: ${q.title}`, href: "#questionnaires" })),
    ...(project.status === "awaiting_deposit" ? [{ key: "deposit", label: "מקדמה", href: "#payments" }] : []),
    ...(project.status === "awaiting_final_payment" ? [{ key: "final", label: "יתרת תשלום", href: "#payments" }] : []),
  ];
  const taskTitles = [...openTasks, ...doneTasks].map((t) => t.title);
  const designApproved = hub.approvals.some((a) => a.status === "approved" && DESIGN_APPROVAL_KINDS.includes(a.kind as ApprovalKind));
  const offerDevChecklist = designApproved && project.status !== "completed" && !DEV_CHECKLIST.some((c) => taskTitles.includes(c.title));
  const sharedFiles = files.filter((f) => f.is_shared).length;
  const referenceFiles = files.filter((f) => f.category === "references").length;

  const addPayment = <PaymentFormModal projectId={id} balance={balance} trigger={<Button size="sm"><Plus aria-hidden />רישום תשלום</Button>} />;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-sm text-ink-3">
        <Link href="/projects" className="inline-flex items-center gap-1 hover:text-ink">
          <ChevronRight className="size-4" aria-hidden />
          פרויקטים
        </Link>
        {project.client && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/clients/${project.client.id}`} className="hover:text-ink">{project.client.name}</Link>
          </>
        )}
      </div>

      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold leading-tight text-ink">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <ProjectStatusControl id={project.id} status={project.status} />
            <span>{projectType.label(project.project_type)}</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4 text-ink-3" aria-hidden />
              <Deadline date={project.deadline} done={project.status === "completed"} />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SendQuestionnaireModal templates={templates} projects={projects} clientId={project.client_id} projectId={project.id} clientPhone={client?.phone} trigger={<Button><Send aria-hidden />שליחת שאלון</Button>} />
          <ProjectMenu project={projectRow} />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <ControlCenter project={project} openTasks={openTasks} doneCount={doneTasks.length} waiting={waiting} />
          <ProjectFollowUps
            projectId={id}
            existingTaskTitles={taskTitles}
            offerDevChecklist={offerDevChecklist}
            completed={project.status === "completed"}
            portfolioId={hub.portfolioId}
            albumId={hub.albumId}
            clientInMaintenance={client?.status === "maintenance"}
          />

          <Card id="payments" className="scroll-mt-24">
            <CardHeader title="תשלומים" description="מעקב בלבד — לא מתבצע חיוב." action={addPayment} />
            {payments.length ? (
              <div className="p-3 md:p-0"><PaymentsTable payments={payments} showProject={false} /></div>
            ) : (
              <EmptyState compact icon={Receipt} title="עוד לא נרשמו תשלומים" description={project.deposit_amount > 0 ? "כשהמקדמה מתקבלת — רושמים אותה כאן והיתרה מתעדכנת." : "הגדר מחיר ומקדמה בעריכת הפרויקט, ורשום תשלומים כשהם מתקבלים."} action={addPayment} />
            )}
          </Card>

          <Card id="tasks" className="scroll-mt-24">
            <CardHeader
              title="משימות"
              action={
                <>
                  <ChecklistButton projectId={id} existingTitles={taskTitles} />
                  <TaskFormModal projectId={id} trigger={<Button size="sm"><Plus aria-hidden />משימה</Button>} />
                </>
              }
            />
            {openTasks.length ? <TaskList tasks={openTasks} /> : <p className="px-5 py-4 text-sm text-ink-3">אין משימות פתוחות.{!doneTasks.length && " אפשר להתחיל מצ׳קליסט מוכן."}</p>}
            {doneTasks.length > 0 && (
              <details className="border-t border-line">
                <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-ink-3 hover:text-ink">הושלמו ({doneTasks.length})</summary>
                <TaskList tasks={doneTasks} />
              </details>
            )}
          </Card>

          <Card id="questionnaires" className="scroll-mt-24">
            <CardHeader title="שאלוני אפיון" />
            {subs.length ? (
              <SubmissionsList rows={subs} />
            ) : (
              <EmptyState compact icon={ClipboardList} title="לא נשלח שאלון לפרויקט" description="&quot;שליחת שאלון&quot; למעלה יוצר קישור שמקושר לפרויקט הזה." />
            )}
          </Card>

          <ProjectReferencesCard projectId={id} references={hub.references} referenceFiles={referenceFiles} />

          <ApprovalsCard
            projectId={id}
            approvals={hub.approvals}
            files={files.map((f) => ({ id: f.id, original_name: f.original_name, mime_type: f.mime_type, thumbUrl: f.thumbUrl }))}
            hasLink={Boolean(project.portal_token)}
          />

          <section id="files" aria-labelledby="files-h" className="flex scroll-mt-24 flex-col gap-3">
            <h2 id="files-h" className="text-base font-semibold text-ink">קבצים ומסמכים</h2>
            <p className="-mt-2 text-sm text-ink-3">רפרנסים, טקסטים לאתר, הסכמים וחומרים — הכול במקום אחד, מסודר לפי קטגוריה.</p>
            <FilesPanel clientId={project.client_id} projectId={id} />
            {files.length > 0 && <GroupedFiles files={files} />}
          </section>

          <AiHandoffCard projectId={id} projectName={project.name} latest={hub.latestHandoff} sharedNotes={hub.sharedNotes} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="פרטים" />
            <CardBody>
              <DataList className="sm:grid-cols-1">
                <DataItem label="לקוח">{project.client ? <Link href={`/clients/${project.client.id}`} className="text-accent hover:underline">{project.client.name}{project.client.business_name ? ` · ${project.client.business_name}` : ""}</Link> : null}</DataItem>
                <DataItem label="תאריך התחלה">{project.start_date ? formatDate(project.start_date) : null}</DataItem>
                <DataItem label="יעד לסיום">{project.deadline ? formatDate(project.deadline) : null}</DataItem>
                {project.completed_at && <DataItem label="הסתיים">{formatDateTime(project.completed_at)}</DataItem>}
                <DataItem label="תיאור">{project.description ? <span className="whitespace-pre-wrap">{project.description}</span> : null}</DataItem>
                {project.tech_stack && <DataItem label="Tech stack"><bdi dir="ltr">{project.tech_stack}</bdi></DataItem>}
                {project.notes && <DataItem label="הערות"><span className="whitespace-pre-wrap">{project.notes}</span></DataItem>}
              </DataList>
            </CardBody>
          </Card>

          <ProjectLinksCard projectId={id} links={hub.links} />

          <PresentationCard
            project={project}
            siteUrl={env.siteUrl()}
            clientPhone={client?.phone ?? null}
            sharedFiles={sharedFiles}
            visibleLinks={hub.links.filter((l) => l.client_visible).length}
          />

          <Card>
            <CardHeader
              title="חוזים"
              action={
                <>
                  <Button asChild size="sm">
                    <Link href={`/contracts/new?client=${project.client_id}&project=${project.id}`}>יצירת הסכם</Link>
                  </Button>
                  <ContractFormModal clientId={project.client_id} projects={projects} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />קובץ</Button>} />
                </>
              }
            />
            {contracts.length ? <ContractList contracts={contracts} projects={projects} /> : <p className="px-5 py-4 text-sm text-ink-3">אין חוזים לפרויקט.</p>}
          </Card>

          <Card>
            <CardHeader title="הערות פנימיות" />
            <CardBody>
              <NotesPanel clientId={project.client_id} projectId={id} notes={notes} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="היסטוריה" />
            <CardBody>{activity.length ? <Timeline items={activity} compact /> : <p className="text-sm text-ink-3">אין פעילות עדיין.</p>}</CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
