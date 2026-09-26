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
import { LedgerBar, LifecycleRail } from "@/components/projects/lifecycle";
import { NextAction } from "@/components/projects/next-action";
import { ProjectMenu, ProjectStatusControl } from "@/components/projects/project-controls";
import { Deadline } from "@/components/projects/project-summary";
import { SendQuestionnaireModal } from "@/components/questionnaires/send-questionnaire";
import { SubmissionsList } from "@/components/questionnaires/submissions-list";
import { ChecklistButton } from "@/components/tasks/checklist-button";
import { TaskFormModal } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";
import {
  getProject,
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
import { projectType } from "@/lib/domain/labels";
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
  const [payments, openTasks, doneTasks, { rows: subs }, { rows: fileRows }, contracts, notes, activity, templates, projects, { data: client }] = await Promise.all([
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
    supabase.from("clients").select("phone").eq("id", project.client_id).maybeSingle(),
  ]);
  const files = await withThumbs(fileRows);
  const fin = project.financials;
  const balance = fin?.balance_due ?? project.total_price;
  const { client: _c, financials: _f, ...projectRow } = project;
  void _c;
  void _f;

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
          <Card>
            <CardBody className="flex flex-col gap-5">
              <LifecycleRail status={project.status} />
              <NextAction projectId={project.id} value={project.next_action} />
              <div className="border-t border-line pt-5">
                <LedgerBar total={project.total_price} paid={fin?.amount_paid ?? 0} deposit={project.deposit_amount} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="תשלומים" description="מעקב בלבד — לא מתבצע חיוב." action={addPayment} />
            {payments.length ? (
              <div className="p-3 md:p-0"><PaymentsTable payments={payments} showProject={false} /></div>
            ) : (
              <EmptyState compact icon={Receipt} title="עוד לא נרשמו תשלומים" description={project.deposit_amount > 0 ? "כשהמקדמה מתקבלת — רושמים אותה כאן והיתרה מתעדכנת." : "הגדר מחיר ומקדמה בעריכת הפרויקט, ורשום תשלומים כשהם מתקבלים."} action={addPayment} />
            )}
          </Card>

          <Card>
            <CardHeader
              title="משימות"
              action={
                <>
                  <ChecklistButton projectId={id} existingTitles={[...openTasks, ...doneTasks].map((t) => t.title)} />
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

          <Card>
            <CardHeader title="שאלוני אפיון" />
            {subs.length ? (
              <SubmissionsList rows={subs} />
            ) : (
              <EmptyState compact icon={ClipboardList} title="לא נשלח שאלון לפרויקט" description="&quot;שליחת שאלון&quot; למעלה יוצר קישור שמקושר לפרויקט הזה." />
            )}
          </Card>

          <section aria-labelledby="files-h" className="flex flex-col gap-3">
            <h2 id="files-h" className="text-base font-semibold text-ink">קבצים ומסמכים</h2>
            <p className="-mt-2 text-sm text-ink-3">רפרנסים, טקסטים לאתר, הסכמים וחומרים — הכול במקום אחד, מסודר לפי קטגוריה.</p>
            <FilesPanel clientId={project.client_id} projectId={id} />
            {files.length > 0 && <GroupedFiles files={files} />}
          </section>
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
                {project.notes && <DataItem label="הערות"><span className="whitespace-pre-wrap">{project.notes}</span></DataItem>}
              </DataList>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="חוזים" action={<ContractFormModal clientId={project.client_id} projects={projects} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />חוזה</Button>} />} />
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
