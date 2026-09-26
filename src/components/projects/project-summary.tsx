import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { LedgerBar, LifecycleRail } from "./lifecycle";
import { NextAction } from "./next-action";
import { projectType } from "@/lib/domain/labels";
import { daysUntil, formatDate, relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectWithMoney } from "@/lib/data/crm";

export function Deadline({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return <span className="text-ink-3">ללא יעד</span>;
  const d = daysUntil(date) ?? 0;
  return (
    <span className={cn(!done && d < 0 && "font-medium text-danger", !done && d >= 0 && d <= 7 && "font-medium text-warn")}>
      {formatDate(date)}
      {!done && <span className="text-ink-3"> · {d < 0 ? `באיחור של ${-d} ימים` : relativeDue(date)}</span>}
    </span>
  );
}

/** A project at a glance: stage, next action, dates, money. */
export function ProjectSummary({ project, headingLevel = "h3" }: { project: ProjectWithMoney; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  const fin = project.financials;
  return (
    <article className="rounded-lg border border-line bg-surface p-4 shadow-1 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <H className="text-base font-semibold text-ink">
            <Link href={`/projects/${project.id}`} className="hover:text-accent">
              {project.name}
            </Link>
          </H>
          <p className="text-sm text-ink-3">{projectType.label(project.project_type)}</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-ink-2">
          <CalendarClock className="size-4 text-ink-3" aria-hidden />
          <Deadline date={project.deadline} done={project.status === "completed"} />
        </div>
      </div>
      <div className="mt-4">
        <LifecycleRail status={project.status} />
      </div>
      <div className="mt-4">
        <NextAction projectId={project.id} value={project.next_action} />
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <LedgerBar total={fin?.total_price ?? project.total_price} paid={fin?.amount_paid ?? 0} deposit={project.deposit_amount} />
      </div>
      {project.start_date && <p className="mt-3 text-xs text-ink-3">התחלה: {formatDate(project.start_date)}</p>}
    </article>
  );
}
