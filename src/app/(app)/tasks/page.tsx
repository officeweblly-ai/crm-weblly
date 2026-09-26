import { ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { TaskFormModal } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";
import { listTasks, projectOptions, type TaskRow } from "@/lib/data/crm";
import { daysUntil } from "@/lib/format";
import { first } from "@/lib/utils";

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
  const sp = await searchParams;
  const status = (first(sp.status) as "open" | "done" | "all" | undefined) ?? "open";
  const due = first(sp.due) as "overdue" | "week" | undefined;
  const q = first(sp.q);
  const [tasks, projects] = await Promise.all([listTasks({ status, due, q }), projectOptions()]);

  const add = (autoOpen = false) => (
    <TaskFormModal projects={projects} defaultOpen={autoOpen && first(sp.new) === "1"} closeHref="/tasks" trigger={<Button><Plus aria-hidden />משימה חדשה</Button>} />
  );
  const groups =
    status === "open"
      ? ORDER.map((label) => ({ label, items: tasks.filter((t) => bucket(t) === label) })).filter((g) => g.items.length)
      : [{ label: status === "done" ? "הושלמו" : "כל המשימות", items: tasks }];

  return (
    <>
      <PageHeader title="משימות" description="מה צריך לקרות, בכל הפרויקטים." actions={add(true)} />
      <ListToolbar
        searchPlaceholder="חיפוש משימה"
        filters={[
          { name: "status", label: "מצב", allLabel: "פתוחות", options: [{ value: "done", label: "הושלמו" }, { value: "all", label: "הכול" }] },
          { name: "due", label: "יעד", allLabel: "כל התאריכים", options: [{ value: "overdue", label: "באיחור" }, { value: "week", label: "7 הימים הקרובים" }] },
        ]}
      />
      {tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title={q || due || status !== "open" ? "אין משימות שמתאימות לסינון" : "אין משימות פתוחות"}
            description={q || due || status !== "open" ? "נסה לשנות את הסינון." : "הכול בוצע. משימות חדשות אפשר להוסיף מכאן או מתוך פרויקט — כולל צ׳קליסט מוכן."}
            action={q || due || status !== "open" ? undefined : add()}
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
