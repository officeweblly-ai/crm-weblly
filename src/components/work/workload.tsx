import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Workload } from "@/lib/work-engine";

function Avatar({ name, color }: { name: string; color?: string | null }) {
  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-sm font-semibold text-ink-2"
      style={color ? { background: `${color}1f`, color } : undefined}
      aria-hidden
    >
      {name.trim().slice(0, 1)}
    </span>
  );
}

/**
 * Who has what — for responsibility clarity, not measurement. Each number
 * opens that person's filtered task list.
 */
export function WorkloadList({ rows, colors, meId }: { rows: Workload[]; colors?: Record<string, string | null>; meId?: string }) {
  if (!rows.length) return <p className="px-5 py-4 text-sm text-ink-3">אין שותפים פעילים.</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((w) => {
        const cells = [
          { label: "פתוחות", value: w.open, href: `/tasks?assignee=${w.userId}` },
          { label: "להיום", value: w.dueToday, href: `/tasks?assignee=${w.userId}&due=today` },
          { label: "באיחור", value: w.overdue, href: `/tasks?assignee=${w.userId}&due=overdue`, danger: w.overdue > 0 },
          { label: "ממתינות", value: w.waiting, href: `/tasks?assignee=${w.userId}&status=waiting_client` },
        ];
        return (
          <li key={w.userId} className="px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              <Avatar name={w.name} color={colors?.[w.userId]} />
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {w.name}
                {w.userId === meId && <span className="font-normal text-ink-3"> (אני)</span>}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-4 gap-1.5">
              {cells.map((c) => (
                <Link key={c.label} href={c.href} className="rounded-md bg-sunken/60 px-2 py-1.5 text-center hover:bg-sunken">
                  <dt className="text-[11px] text-ink-3">{c.label}</dt>
                  <dd className={cn("text-base font-semibold num", c.danger ? "text-danger" : "text-ink")}>{c.value}</dd>
                </Link>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
