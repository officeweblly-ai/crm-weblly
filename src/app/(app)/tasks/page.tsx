import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TaskFormModal } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";
import { listTasks, projectOptions, staffOptions, type TaskFilter, type TaskRow } from "@/lib/data/crm";
import { taskPriority, taskStatus } from "@/lib/domain/labels";
import { requireStaff } from "@/lib/auth";
import { daysUntil } from "@/lib/format";
import { cn, first } from "@/lib/utils";

export const metadata = { title: "משימות" };

function bucket(t: TaskRow): string {
  const d = daysUntil(t.due_date);
  if (d === null) return "ללא תאריך יעד";
  if (d < 0) return "באיחור";
  if (d === 0) return "היום";
  if (d <= 7) return "השבוע";
  return "בהמשך";
}
const ORDER = ["באיחור", "היום", "השבוע", "בהמשך", "ללא תאריך יעד"];

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const rawStatus = first(sp.status);
  const status = (rawStatus && ["done", "all", ...taskStatus.values].includes(rawStatus) ? rawStatus : "open") as NonNullable<TaskFilter["status"]>;
  const rawDue = first(sp.due);
  const due = rawDue === "overdue" || rawDue === "week" || rawDue === "today" ? rawDue : undefined;
  const q = first(sp.q);
  const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const project = isId(first(sp.project));
  const assignee = first(sp.assignee) === "none" ? "none" : isId(first(sp.assignee));
  const priority = first(sp.priority);
  const [tasks, projects, staff] = await Promise.all([
    listTasks({ status, due, q, projectId: project, assignee, priority }),
    projectOptions(),
    staffOptions(),
  ]);
  const filtered = Boolean(q || due || project || assignee || priority || status !== "open");

  const add = (autoOpen = false) => (
    <TaskFormModal projects={projects} defaultOpen={autoOpen && first(sp.new) === "1"} closeHref="/tasks" trigger={<Button><Plus aria-hidden />משימה חדשה</Button>} />
  );
  const groups =
    status !== "done" && status !== "all"
      ? ORDER.map((label) => ({ label, items: tasks.filter((t) => bucket(t) === label) })).filter((g) => g.items.length)
      : [{ label: status === "done" ? "הושלמו" : "כל המשימות", items: tasks }];

  return (
    <>
      <PageHeader title="משימות" description="מה צריך לקרות, בכל הפרויקטים — ולכל משימה יש אחראי." actions={add(true)} />
      <nav aria-label="סינון מהיר" className="scrollbar-thin -mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1.5">
          {[
            { label: "הכול", href: "/tasks", on: !filtered },
            { label: "המשימות שלי", href: `/tasks?assignee=${viewer.userId}`, on: assignee === viewer.userId && !due && status === "open" },
            ...staff
              .filter((p) => p.value !== viewer.userId)
              .map((p) => ({ label: `של ${p.label.split(" ")[0]}`, href: `/tasks?assignee=${p.value}`, on: assignee === p.value && !due && status === "open" })),
            { label: "ללא אחראי", href: "/tasks?assignee=none", on: assignee === "none" },
            { label: "להיום", href: "/tasks?due=today", on: due === "today" && !assignee },
            { label: "באיחור", href: "/tasks?due=overdue", on: due === "overdue" && !assignee },
            { label: "ממתין ללקוח", href: "/tasks?status=waiting_client", on: status === "waiting_client" && !assignee },
          ].map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                scroll={false}
                aria-current={c.on ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors",
                  c.on ? "border-accent/30 bg-accent-soft font-medium text-accent-ink" : "border-line-strong bg-surface text-ink-2 hover:bg-sunken hover:text-ink",
                )}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ListToolbar
        searchPlaceholder="חיפוש משימה"
        filters={[
          {
            name: "status",
            label: "סטטוס",
            allLabel: "כל הפתוחות",
            options: [...taskStatus.list.filter((o) => o.value !== "done").map((o) => ({ value: o.value, label: o.label })), { value: "done", label: "הושלמו" }, { value: "all", label: "הכול" }],
          },
          { name: "project", label: "פרויקט", allLabel: "כל הפרויקטים", options: projects.map((p) => ({ value: p.value, label: p.label })) },
          { name: "assignee", label: "אחראי", allLabel: "כל האחראים", options: [...staff, { value: "none", label: "ללא אחראי" }] },
          { name: "priority", label: "עדיפות", allLabel: "כל העדיפויות", options: taskPriority.list.map((o) => ({ value: o.value, label: o.label })) },
          { name: "due", label: "יעד", allLabel: "כל התאריכים", options: [{ value: "today", label: "להיום (כולל באיחור)" }, { value: "overdue", label: "באיחור" }, { value: "week", label: "7 הימים הקרובים" }] },
        ]}
      />
      {tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={filtered ? "אין משימות שמתאימות לסינון" : "אין משימות פתוחות"}
            description={filtered ? "נסה לשנות את הסינון." : "הכול בוצע. משימות חדשות אפשר להוסיף מכאן או מתוך פרויקט — כולל צ׳קליסט מוכן."}
            action={filtered ? undefined : add()}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <Card key={g.label}>
              <header className="flex items-center gap-2 border-b border-line px-5 py-2.5">
                <h2 className={g.label === "באיחור" ? "text-sm font-semibold text-danger" : "text-sm font-semibold text-ink"}>{g.label}</h2>
                <span className="rounded-full bg-sunken px-1.5 text-xs text-ink-3 num">{g.items.length}</span>
              </header>
              <TaskList tasks={g.items} showContext />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
