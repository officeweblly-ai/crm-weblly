import Link from "next/link";
import { FolderKanban, LayoutList, Plus, SquareKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, MobileCard, MobileList, Money, PageHeader, Pagination, TableShell, Td, Th, Tr } from "@/components/ui/misc";
import { KanbanBoard } from "@/components/projects/kanban";
import { ProjectFormModal } from "@/components/projects/project-form";
import { Deadline } from "@/components/projects/project-summary";
import { boardProjects, clientOptions, listProjects } from "@/lib/data/crm";
import { projectStatus, projectType } from "@/lib/domain/labels";
import { cn, first, parsePage } from "@/lib/utils";

export const metadata = { title: "פרויקטים" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const sp = await searchParams;
  const view = first(sp.view) === "board" ? "board" : "list";
  const f = { q: first(sp.q), status: first(sp.status), type: first(sp.type), sort: first(sp.sort), page: parsePage(sp.page) };
  const clients = await clientOptions();

  const toggle = (
    <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="תצוגה">
      {(
        [
          ["list", "רשימה", LayoutList],
          ["board", "לוח", SquareKanban],
        ] as const
      ).map(([v, label, Icon]) => (
        <Link
          key={v}
          href={v === "list" ? "/projects" : "/projects?view=board"}
          aria-current={view === v ? "page" : undefined}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm", view === v ? "bg-sunken font-medium text-ink" : "text-ink-3 hover:text-ink")}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </div>
  );
  const newProject = (
    <ProjectFormModal
      clients={clients}
      defaultOpen={first(sp.new) === "1"}
      closeHref="/projects"
      trigger={
        <Button>
          <Plus aria-hidden />
          פרויקט חדש
        </Button>
      }
    />
  );

  if (view === "board") {
    const projects = await boardProjects();
    return (
      <>
        <PageHeader title="לוח פרויקטים" description="גרור כרטיס לעמודה אחרת כדי לעדכן את שלב הפרויקט." actions={<>{toggle}{newProject}</>} />
        {projects.length ? (
          <KanbanBoard projects={projects} />
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface">
            <EmptyState icon={FolderKanban} title="אין פרויקטים על הלוח" description="פרויקט חדש מופיע כאן בעמודת 'ליד' וזז ימינה עד 'הסתיים'." action={newProject} />
          </div>
        )}
      </>
    );
  }

  const { rows, total, pageSize } = await listProjects(f);
  const filtered = Boolean(f.q || f.status || f.type);
  const hrefFor = (page: number) => `/projects?${new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="פרויקטים" description="כל העבודות — משלב הליד ועד המסירה." actions={<>{toggle}{newProject}</>} />
      <ListToolbar
        searchPlaceholder="חיפוש פרויקט"
        filters={[
          {
            name: "status",
            label: "שלב",
            options: [
              { value: "active", label: "פעילים" },
              { value: "attention", label: "דורשים טיפול" },
              { value: "awaiting_payment", label: "ממתינים לתשלום" },
              ...projectStatus.list,
            ],
          },
          { name: "type", label: "סוג", options: projectType.list },
        ]}
        sorts={[
          { value: "newest", label: "החדשים ביותר" },
          { value: "deadline", label: "לפי יעד לסיום" },
          { value: "price", label: "לפי מחיר" },
          { value: "updated", label: "עודכנו לאחרונה" },
        ]}
      />
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface">
          {filtered ? (
            <EmptyState icon={FolderKanban} title="אין פרויקטים שמתאימים לסינון" description="נסה לשנות את הסינון." />
          ) : (
            <EmptyState icon={FolderKanban} title="עוד אין פרויקטים" description={clients.length ? "פתח פרויקט ללקוח קיים — עם מחיר, מקדמה ויעד." : "קודם יוצרים לקוח (או ממירים ליד), ואז פותחים לו פרויקט."} action={clients.length ? newProject : <Button asChild><Link href="/clients?new=1">יצירת לקוח</Link></Button>} />
          )}
        </div>
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>פרויקט</Th>
                <Th>לקוח</Th>
                <Th>שלב</Th>
                <Th>יעד</Th>
                <Th>מחיר</Th>
                <Th>יתרה</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/projects/${p.id}`} className="font-medium text-ink hover:text-accent">{p.name}</Link>
                    <div className="max-w-72 truncate text-xs text-ink-3">{p.next_action ? `הבא: ${p.next_action}` : projectType.label(p.project_type)}</div>
                  </Td>
                  <Td>{p.client ? <Link href={`/clients/${p.client.id}`} className="hover:text-accent">{p.client.name}</Link> : "—"}</Td>
                  <Td><Badge tone={projectStatus.tone(p.status)}>{projectStatus.label(p.status)}</Badge></Td>
                  <Td className="whitespace-nowrap"><Deadline date={p.deadline} done={p.status === "completed"} /></Td>
                  <Td><Money value={p.total_price} /></Td>
                  <Td className={(p.financials?.balance_due ?? 0) > 0 ? "font-medium text-ink" : "text-ink-3"}><Money value={p.financials?.balance_due ?? 0} /></Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
          <MobileList>
            {rows.map((p) => (
              <MobileCard key={p.id} href={`/projects/${p.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{p.name}</div>
                    <div className="truncate text-sm text-ink-3">{p.client?.name}</div>
                  </div>
                  <Badge tone={projectStatus.tone(p.status)}>{projectStatus.label(p.status)}</Badge>
                </div>
                {p.next_action && <p className="mt-2 line-clamp-1 text-sm text-ink-2">הבא: {p.next_action}</p>}
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-ink-3"><Deadline date={p.deadline} done={p.status === "completed"} /></span>
                  <span className="text-ink-2">יתרה <Money value={p.financials?.balance_due ?? 0} className="font-medium" /></span>
                </div>
              </MobileCard>
            ))}
          </MobileList>
          <Pagination page={f.page} total={total} pageSize={pageSize} hrefFor={hrefFor} />
        </>
      )}
    </>
  );
}
