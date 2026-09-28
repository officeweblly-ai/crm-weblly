import Link from "next/link";
import { ArrowLeft, CalendarClock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/misc";
import { Deadline } from "@/components/projects/project-summary";
import { TaskList } from "@/components/tasks/task-list";
import { requireStaff } from "@/lib/auth";
import { listProjects, listTasks } from "@/lib/data/crm";
import { approvalKind, leadStatus, projectStatus, submissionStatus, type ApprovalKind } from "@/lib/domain/labels";
import { relativeDue, timeAgo, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn, first } from "@/lib/utils";

export const metadata = { title: "היום" };

/** Stages where the ball is in the client's court. */
const WAITING_ON_CLIENT = ["questionnaire_sent", "awaiting_deposit", "awaiting_approval", "awaiting_final_payment"];

function Section({ title, count, description, href, children }: { title: string; count: number; description?: string; href?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            <span className="rounded-full bg-sunken px-1.5 text-xs font-medium text-ink-3 num">{count}</span>
          </span>
        }
        description={description}
        action={href ? <Button asChild variant="link" size="sm"><Link href={href}>הכול<ArrowLeft aria-hidden /></Link></Button> : undefined}
      />
      {children}
    </Card>
  );
}

function Clear({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-3">
      <CheckCircle2 className="size-4 text-ok" aria-hidden />
      {children}
    </p>
  );
}

/**
 * The morning screen: only what needs action today. The dashboard stays the
 * place for numbers; this is the to-do view built from the same data.
 */
export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const mine = first(sp.mine) === "1";
  const supabase = await createClient();
  const today = todayISO();

  const [tasks, waitingTasks, { rows: active }, approvals, subs, leads, fin, moneyProjects] = await Promise.all([
    listTasks({ status: "open", due: "today", assignee: mine ? viewer.userId : undefined, limit: 60 }),
    listTasks({ status: "waiting_client", limit: 30 }),
    listProjects({ page: 1, status: "active", sort: "deadline", all: true }),
    supabase.from("project_approvals").select("id, title, kind, created_at, projects(id, name)").eq("status", "pending").order("created_at").limit(30),
    supabase.from("form_submissions").select("id, title, status, sent_at, created_at, clients(id, name)").in("status", ["sent", "in_progress"]).order("created_at").limit(30),
    supabase.from("leads").select("id, name, business_name, follow_up_date, status").not("status", "in", "(converted,lost)").not("follow_up_date", "is", null).lte("follow_up_date", today).order("follow_up_date").limit(30),
    supabase.from("project_financials").select("project_id, balance_due, amount_paid, deposit_amount").gt("balance_due", 0).limit(500),
    supabase.from("projects").select("id, name, status, clients(name)").in("status", ["awaiting_deposit", "awaiting_final_payment", "completed"]).limit(500),
  ]);

  // Projects whose next move is ours: active and not parked on the client.
  const myMove = active.filter((p) => !WAITING_ON_CLIENT.includes(p.status));
  const awaitingClientProjects = active.filter((p) => p.status === "awaiting_approval");

  // Money that needs a nudge: deposit/final-payment stages, or finished with a balance.
  const balanceOf = new Map((fin.data ?? []).map((f) => [f.project_id, f]));
  const payments = (moneyProjects.data ?? []).flatMap((p) => {
    const f = balanceOf.get(p.id);
    return f ? [{ ...p, fin: f }] : [];
  });

  const waitingCount = (approvals.data ?? []).length + waitingTasks.length + (subs.data ?? []).length + awaitingClientProjects.length;
  const dateLabel = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-ink-3">{dateLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">היום</h1>
          <p className="mt-1 text-sm text-ink-3">רק מה שדורש פעולה. {tasks.length + myMove.length + (leads.data ?? []).length > 0 ? "מתחילים מלמעלה." : "הכול מטופל."}</p>
        </div>
        <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5 text-sm" role="group" aria-label="סינון משימות">
          <Link href="/today" aria-current={!mine ? "page" : undefined} className={cn("rounded px-3 py-1.5", !mine ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}>כל הצוות</Link>
          <Link href="/today?mine=1" aria-current={mine ? "page" : undefined} className={cn("rounded px-3 py-1.5", mine ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-2 hover:text-ink")}>רק שלי</Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="משימות להיום ובאיחור" count={tasks.length} href="/tasks?due=overdue">
            {tasks.length ? <TaskList tasks={tasks} showContext /> : <Clear>אין משימות להיום.</Clear>}
          </Section>

          <Section title="פרויקטים שמחכים לפעולה שלנו" count={myMove.length} description="לפי תאריך יעד" href="/projects?status=active">
            {myMove.length ? (
              <ul className="divide-y divide-line">
                {myMove.slice(0, 12).map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-sunken/50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                        <div className="truncate text-xs text-ink-3">
                          {p.client?.name}
                          {p.next_action ? <> · הבא: <span className="text-ink-2">{p.next_action}</span></> : " · לא הוגדרה פעולה הבאה"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs">
                        <Badge tone={projectStatus.tone(p.status)}>{projectStatus.label(p.status)}</Badge>
                        <span className="whitespace-nowrap text-ink-3 sm:w-24 sm:text-end"><Deadline date={p.deadline} compact /></span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Clear>אין פרויקטים שמחכים לנו.</Clear>
            )}
          </Section>

          <Section title="ממתין ללקוח" count={waitingCount} description="אישורים, שאלונים ומשימות שהכדור אצל הלקוח">
            {waitingCount ? (
              <ul className="divide-y divide-line">
                {(approvals.data ?? []).map((a) => (
                  <li key={`a-${a.id}`}>
                    <Link href={a.projects ? `/projects/${a.projects.id}#approvals` : "/projects"} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-sunken/50">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-ink">אישור: {a.title}</span>
                        <span className="text-ink-3"> · {approvalKind.label(a.kind as ApprovalKind)}{a.projects && ` · ${a.projects.name}`}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-3">נשלח {timeAgo(a.created_at)}</span>
                    </Link>
                  </li>
                ))}
                {(subs.data ?? []).map((q) => (
                  <li key={`q-${q.id}`}>
                    <Link href={`/questionnaires/${q.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-sunken/50">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-ink">שאלון: {q.title}</span>
                        {q.clients && <span className="text-ink-3"> · {q.clients.name}</span>}
                      </span>
                      <Badge tone={submissionStatus.tone(q.status)}>{submissionStatus.label(q.status)}</Badge>
                    </Link>
                  </li>
                ))}
                {awaitingClientProjects.map((p) => (
                  <li key={`p-${p.id}`}>
                    <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-sunken/50">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-ink">{p.name}</span>
                        <span className="text-ink-3"> · {p.client?.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-3">{projectStatus.label(p.status)} · {timeAgo(p.status_changed_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {waitingTasks.length > 0 && <TaskList tasks={waitingTasks} showContext className="border-t border-line" />}
            {!waitingCount && <Clear>לא מחכים לאף לקוח.</Clear>}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Section title="לידים לחזור אליהם" count={(leads.data ?? []).length} href="/leads?status=open&sort=follow_up">
            {(leads.data ?? []).length ? (
              <ul className="divide-y divide-line">
                {leads.data!.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-sunken/50">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-ink">{l.name}</span>
                        {l.business_name && <span className="text-ink-3"> · {l.business_name}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        <Badge tone={leadStatus.tone(l.status)}>{leadStatus.label(l.status)}</Badge>
                        <span className={l.follow_up_date! < today ? "font-medium text-danger" : "text-ink-3"}>
                          <CalendarClock className="me-1 inline size-3.5" aria-hidden />
                          {relativeDue(l.follow_up_date)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Clear>אין לידים למעקב היום.</Clear>
            )}
          </Section>

          <Section title="תשלומים ויתרות למעקב" count={payments.length} href="/finances?view=outstanding">
            {payments.length ? (
              <ul className="divide-y divide-line">
                {payments.map((p) => {
                  const depositDue = p.status === "awaiting_deposit" ? Math.max(0, Number(p.fin.deposit_amount) - Number(p.fin.amount_paid)) : 0;
                  return (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}#payments`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-sunken/50">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{p.name}</span>
                          <span className="block truncate text-xs text-ink-3">
                            {p.clients?.name} · {p.status === "awaiting_deposit" ? "מקדמה" : p.status === "completed" ? "הסתיים ונשארה יתרה" : "יתרת תשלום"}
                          </span>
                        </span>
                        <Money value={depositDue > 0 ? depositDue : p.fin.balance_due} className="shrink-0 font-semibold text-ink" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Clear>אין תשלומים שמחכים למעקב.</Clear>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
