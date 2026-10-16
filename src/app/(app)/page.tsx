import Link from "next/link";
import { ArrowLeft, Inbox, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { MonthBoard } from "@/components/dashboard/month-board";
import { TodayList } from "@/components/dashboard/today-list";
import { TaskList } from "@/components/tasks/task-list";
import { requireStaff } from "@/lib/auth";
import { loadAgenda } from "@/lib/data/agenda";
import { listProjects, listTasks } from "@/lib/data/crm";
import { loadProgress } from "@/lib/data/progress";
import { daysBetween, dueLabel, monthGrid, sortAgenda } from "@/lib/domain/calendar";
import { projectStatus } from "@/lib/domain/labels";
import { can } from "@/lib/domain/permissions";
import { formatMoney, todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn, first } from "@/lib/utils";

export const metadata = { title: "ראשי" };

const WAITING_STATUSES = ["questionnaire_sent", "awaiting_deposit", "awaiting_approval", "awaiting_final_payment"] as const;

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date()));
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  return "ערב טוב";
}

function Metric({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: string; href: string; tone?: "warn" }) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col gap-1 bg-surface px-4 py-3 transition-colors hover:bg-sunken/50 sm:px-5">
      <span className="truncate text-xs text-ink-3">{label}</span>
      <span className={cn("text-[1.375rem] font-semibold leading-none tracking-tight num", tone === "warn" ? "text-warn" : "text-ink")}>{value}</span>
      {hint && <span className="truncate text-xs text-ink-3">{hint}</span>}
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const denied = first(sp.denied) === "1";
  const teamTasks = first(sp.tasks) === "team";
  const supabase = await createClient();
  const today = todayISO();
  const grid = monthGrid(today);
  const finance = can(viewer.access, "finances");

  const [{ data: m }, monthItems, todayItems, tasks, { rows: projects }, { data: staff }, { count: openProposals }, { count: waitingTasks }, { count: waitingMilestones }] = await Promise.all([
    supabase.rpc("dashboard_metrics"),
    loadAgenda(grid[0][0], grid.at(-1)![6], { payments: finance }),
    loadAgenda(today, today, { overdue: true, payments: finance }),
    listTasks({ status: "open", assignee: teamTasks ? undefined : viewer.userId, limit: 8 }),
    listProjects({ page: 1, sort: "deadline", status: "active" }),
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
    supabase.from("proposals").select("id", { count: "exact", head: true }).in("status", ["sent", "viewed"]),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "waiting_client"),
    supabase.from("project_milestones").select("id", { count: "exact", head: true }).eq("status", "waiting_client"),
  ]);
  const metrics = (m ?? {}) as Record<string, number>;
  const people = Object.fromEntries((staff ?? []).map((p) => [p.id, (p.full_name || p.email).split(" ")[0]]));
  const progress = await loadProgress(projects.slice(0, 8).map((p) => p.id));

  // Today: what's dated today, plus open things that slipped.
  const todayList = todayItems
    .filter((i) => i.date === today || (i.endDate && i.date <= today && i.endDate >= today) || (!i.done && i.date < today && i.source !== "event"))
    .filter((i) => i.source !== "payment")
    .sort((a, b) => {
      const ao = !a.done && a.date < today;
      const bo = !b.done && b.date < today;
      if (ao !== bo) return ao ? 1 : -1;
      return sortAgenda(a, b);
    });
  const mineToday = todayList.filter((i) => !i.done && i.date === today && i.source === "task" && i.assigneeId === viewer.userId).length;
  const overdueCount = todayList.filter((i) => !i.done && i.date < today).length;
  const waitingProjects = projects.filter((p) => (WAITING_STATUSES as readonly string[]).includes(p.status)).length;
  const waiting = waitingProjects + (waitingTasks ?? 0) + (waitingMilestones ?? 0);
  const firstName = (viewer.profile.full_name || "").trim().split(/\s+/)[0];
  const dateLabel = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" }).format(new Date());
  const empty = !projects.length && !todayList.length && !tasks.length && !monthItems.length;

  return (
    <>
      {denied && (
        <p role="status" className="mb-4 rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-sm text-warn">
          התפקיד שלך{viewer.role ? ` (${viewer.role.name})` : ""} לא כולל גישה לאזור שניסית לפתוח. בעל החשבון יכול לשנות זאת ב״צוות״.
        </p>
      )}

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {firstName ? `שלום ${firstName}` : greeting()}
          </h1>
          <p className="mt-1 text-sm text-ink-3">
            {dateLabel}
            {todayList.length > 0 && (
              <>
                {" · "}
                <span className="text-ink-2">{todayList.filter((i) => !i.done && i.date === today).length} להיום</span>
                {overdueCount > 0 && <span className="text-danger"> · {overdueCount} באיחור</span>}
              </>
            )}
          </p>
        </div>
      </header>

      <section aria-label="סיכום" className={cn("mb-6 grid grid-cols-2 overflow-hidden rounded-lg border border-line grid-hair sm:grid-cols-3", finance ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        <Metric label="פרויקטים פעילים" value={metrics.active_projects ?? 0} href="/projects?status=active" />
        <Metric label="המשימות שלי להיום" value={mineToday} hint={overdueCount ? `${overdueCount} באיחור` : undefined} href="/tasks?view=today&who=me" tone={overdueCount ? "warn" : undefined} />
        <Metric label="ממתין ללקוח" value={waiting} hint="אישורים, תשלומים, חומרים" href="/projects?status=active" />
        <Metric label="הצעות פתוחות" value={openProposals ?? 0} href="/proposals?status=open" />
        {finance && <Metric label="ממתין לגבייה" value={<bdi dir="ltr">{formatMoney(metrics.outstanding_balance ?? 0)}</bdi>} href="/finances?view=outstanding" />}
      </section>

      {empty ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="מתחילים מליד או מלקוח"
            description="משם — הצעת מחיר, חוזה, פרויקט עם לו״ז ומשימות, ותשלומים. כל תאריך שנקבע יופיע כאן ביומן."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild><Link href="/leads?new=1">ליד חדש</Link></Button>
                <Button asChild variant="secondary"><Link href="/clients?new=1">לקוח חדש</Link></Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:[grid-template-areas:'month_today'_'tasks_projects']">
          {/* DOM order = phone priority: today, tasks, month, projects. */}
          <section aria-labelledby="today-h" className="min-w-0 lg:[grid-area:today]">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 id="today-h" className="text-base font-semibold text-ink">היום</h2>
              <Link href={`/calendar?view=day&date=${today}`} className="text-xs font-medium text-accent hover:text-accent-hover">סדר היום ביומן</Link>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <TodayList items={todayList} today={today} people={people} emptyText="אין היום פגישות, משימות או דדליינים. יום טוב להתקדם בפרויקטים." />
            </div>
          </section>

          <section aria-labelledby="tasks-h" className="min-w-0 lg:[grid-area:tasks]">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 id="tasks-h" className="text-base font-semibold text-ink">משימות</h2>
              <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5 text-sm" role="group" aria-label="של מי">
                <Link href="/" scroll={false} aria-current={!teamTasks ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded px-2.5", !teamTasks ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}>המשימות שלי</Link>
                <Link href="/?tasks=team" scroll={false} aria-current={teamTasks ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded px-2.5", teamTasks ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}>כל הצוות</Link>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {tasks.length ? (
                <TaskList tasks={tasks} showContext />
              ) : (
                <EmptyState compact icon={ListChecks} title={teamTasks ? "אין משימות פתוחות לצוות" : "אין לך משימות פתוחות"} description="משימה חדשה: ״+ חדש״ למעלה." />
              )}
              <Link href={teamTasks ? "/tasks" : "/tasks?who=me"} className="flex items-center justify-center gap-1 border-t border-line py-2 text-xs font-medium text-ink-3 hover:bg-sunken/50 hover:text-ink">
                לכל המשימות <ArrowLeft className="size-3.5" aria-hidden />
              </Link>
            </div>
          </section>

          <div className="min-w-0 lg:[grid-area:month]">
            <MonthBoard date={today} items={monthItems} today={today} />
          </div>

          <section aria-labelledby="projects-h" className="min-w-0 lg:[grid-area:projects]">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 id="projects-h" className="text-base font-semibold text-ink">פרויקטים פעילים</h2>
              <Link href="/projects" className="text-xs font-medium text-accent hover:text-accent-hover">כל הפרויקטים</Link>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {projects.length ? (
                <ul className="divide-y divide-line">
                  {projects.slice(0, 8).map((p) => {
                    const pr = progress.get(p.id);
                    const days = p.deadline ? daysBetween(today, p.deadline) : null;
                    return (
                      <li key={p.id}>
                        <Link href={`/projects/${p.id}`} className="block px-4 py-3 transition-colors hover:bg-sunken/50 sm:px-5">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-sm font-medium text-ink">{p.name}</span>
                            {days !== null && <span className={cn("shrink-0 text-xs num", days < 0 ? "text-danger" : days <= 3 ? "text-warn" : "text-ink-3")}>{dueLabel(days)}</span>}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-ink-3">
                            <span className="min-w-0 truncate">{p.client?.business_name || p.client?.name} · {projectStatus.label(p.status)}</span>
                            <span className="ms-auto flex shrink-0 items-center gap-2">
                              <span className="h-1 w-16 overflow-hidden rounded-full bg-sunken" aria-hidden>
                                <span className="block h-full rounded-full bg-ink-2" style={{ width: `${pr?.pct ?? 0}%` }} />
                              </span>
                              <span className="w-8 text-end num">{pr?.pct ?? 0}%</span>
                            </span>
                          </div>
                          {pr?.next && <div className="mt-1 truncate text-xs text-ink-2">הבא: {pr.next.title}</div>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-ink-3">אין פרויקטים פעילים.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
