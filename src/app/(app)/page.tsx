import Link from "next/link";
import { ArrowLeft, CalendarClock, Inbox } from "lucide-react";
import { Timeline } from "@/components/activity/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Money, StatCard } from "@/components/ui/misc";
import { Deadline } from "@/components/projects/project-summary";
import { TaskList } from "@/components/tasks/task-list";
import { requireStaff } from "@/lib/auth";
import { listActivity, listProjects, listTasks } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";
import { leadStatus, projectStatus } from "@/lib/domain/labels";
import { formatMoney, isoDateOffset, relativeDue, todayISO } from "@/lib/format";

export const metadata = { title: "דשבורד" };

type Metrics = {
  revenue_this_month: number;
  revenue_last_month: number;
  outstanding_balance: number;
  active_projects: number;
  questionnaires_pending: number;
  clients_awaiting_payment: number;
  open_tasks: number;
  overdue_tasks: number;
  projects_attention: number;
};

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date()));
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  return "ערב טוב";
}

export default async function DashboardPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const today = todayISO();
  const week = isoDateOffset(7);

  const [{ data: m }, { rows: projects }, { data: clients }, activity, overdue, upcoming, { data: followUps }] = await Promise.all([
    supabase.rpc("dashboard_metrics"),
    listProjects({ page: 1, sort: "updated", status: "active" }),
    supabase.from("clients").select("id, name, business_name, created_at").neq("status", "archived").order("created_at", { ascending: false }).limit(5),
    listActivity({ limit: 10 }),
    listTasks({ status: "open", due: "overdue", limit: 10 }),
    listTasks({ status: "open", due: "week", limit: 10 }),
    supabase.from("leads").select("id, name, business_name, follow_up_date, status").not("status", "in", "(converted,lost)").not("follow_up_date", "is", null).lte("follow_up_date", week).order("follow_up_date").limit(6),
  ]);
  const metrics = (m ?? {}) as Partial<Metrics>;
  const n = (k: keyof Metrics) => Number(metrics[k] ?? 0);
  const revenueDelta = n("revenue_this_month") - n("revenue_last_month");
  const tasks = [...overdue, ...upcoming.filter((t) => !overdue.some((o) => o.id === t.id))].slice(0, 8);
  const empty = !projects.length && !(clients ?? []).length && !activity.length;
  const monthName = new Intl.DateTimeFormat("he-IL", { month: "long", timeZone: "Asia/Jerusalem" }).format(new Date());

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-ink-3">
          {new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" }).format(new Date())}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          {greeting()}
          {viewer.profile.full_name ? `, ${viewer.profile.full_name.split(" ")[0]}` : ""}
        </h1>
      </div>

      {/* Money first, then the work that's waiting. Every tile opens the list behind it. */}
      <section aria-label="מדדים" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={`הכנסות ב${monthName}`}
          value={<bdi dir="ltr">{formatMoney(n("revenue_this_month"))}</bdi>}
          hint={
            n("revenue_last_month") > 0 || n("revenue_this_month") > 0 ? (
              <>
                {revenueDelta >= 0 ? "+" : "−"}
                <bdi dir="ltr">{formatMoney(Math.abs(revenueDelta))}</bdi> מול החודש הקודם
              </>
            ) : (
              "לפי תאריכי התשלומים שנרשמו"
            )
          }
          href="/finances"
        />
        <StatCard label="יתרות פתוחות" value={<bdi dir="ltr">{formatMoney(n("outstanding_balance"))}</bdi>} hint="סכום שטרם התקבל מלקוחות" href="/finances?view=outstanding" />
        <StatCard label="פרויקטים פעילים" value={n("active_projects")} hint="לא כולל לידים ופרויקטים שהסתיימו" href="/projects?status=active" />
        <StatCard
          label="דורשים טיפול"
          value={n("projects_attention")}
          hint="עבר היעד, או תקועים 14+ ימים"
          href="/projects?status=attention"
          tone={n("projects_attention") > 0 ? "warn" : "neutral"}
        />
        <StatCard label="שאלונים ממתינים" value={n("questionnaires_pending")} hint="נשלחו ועוד לא הוחזרו" href="/questionnaires?status=pending" />
        <StatCard label="לקוחות ממתינים לתשלום" value={n("clients_awaiting_payment")} hint="מקדמה או יתרה סופית" href="/projects?status=awaiting_payment" />
        <StatCard label="משימות פתוחות" value={n("open_tasks")} href="/tasks" />
        <StatCard label="משימות באיחור" value={n("overdue_tasks")} href="/tasks?due=overdue" tone={n("overdue_tasks") > 0 ? "danger" : "neutral"} />
      </section>

      {empty ? (
        <Card className="mt-6">
          <EmptyState
            icon={Inbox}
            title="ברוך הבא למערכת"
            description="מתחילים מליד או מלקוח. משם פותחים פרויקט, שולחים שאלון אפיון ורושמים תשלומים — והכול מתרכז כאן."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild><Link href="/leads?new=1">הוספת ליד</Link></Button>
                <Button asChild variant="secondary"><Link href="/clients?new=1">לקוח חדש</Link></Button>
                <Button asChild variant="secondary"><Link href="/questionnaires?tab=templates">בניית שאלון</Link></Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader
                title="פרויקטים פעילים"
                action={<Button asChild variant="link" size="sm"><Link href="/projects?view=board">ללוח<ArrowLeft aria-hidden /></Link></Button>}
              />
              {projects.length ? (
                <ul className="divide-y divide-line">
                  {projects.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-sunken/50 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                          <div className="truncate text-xs text-ink-3">
                            {p.client?.name}
                            {p.next_action && <> · הבא: {p.next_action}</>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs">
                          <Badge tone={projectStatus.tone(p.status)}>{projectStatus.label(p.status)}</Badge>
                          <span className="w-28 text-ink-3 sm:text-end"><Deadline date={p.deadline} /></span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-ink-3">אין פרויקטים פעילים כרגע.</p>
              )}
            </Card>

            <Card>
              <CardHeader title="משימות קרובות" description="באיחור ובשבוע הקרוב" action={<Button asChild variant="link" size="sm"><Link href="/tasks">הכול<ArrowLeft aria-hidden /></Link></Button>} />
              {tasks.length ? <TaskList tasks={tasks} showContext /> : <p className="px-5 py-4 text-sm text-ink-3">אין משימות לשבוע הקרוב.</p>}
            </Card>

            {(followUps ?? []).length > 0 && (
              <Card>
                <CardHeader title="לידים למעקב" action={<Button asChild variant="link" size="sm"><Link href="/leads?status=open&sort=follow_up">הכול<ArrowLeft aria-hidden /></Link></Button>} />
                <ul className="divide-y divide-line">
                  {followUps!.map((l) => (
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
              </Card>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader title="לקוחות אחרונים" action={<Button asChild variant="link" size="sm"><Link href="/clients">הכול<ArrowLeft aria-hidden /></Link></Button>} />
              <ul className="divide-y divide-line">
                {(clients ?? []).map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-sunken/50">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken font-display text-sm font-bold text-ink-2" aria-hidden>
                        {c.name.trim()[0]}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                        {c.business_name && <span className="block truncate text-xs text-ink-3">{c.business_name}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
                {!(clients ?? []).length && <li className="px-5 py-4 text-sm text-ink-3">אין לקוחות עדיין.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="פעילות אחרונה" />
              <div className="px-5 py-4">{activity.length ? <Timeline items={activity} showContext compact /> : <p className="text-sm text-ink-3">אין פעילות עדיין.</p>}</div>
            </Card>
            {n("outstanding_balance") > 0 && (
              <p className="px-1 text-xs text-ink-3">
                יתרות מחושבות מהתשלומים שנרשמו בפועל: <Money value={n("outstanding_balance")} /> טרם התקבלו.
              </p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
