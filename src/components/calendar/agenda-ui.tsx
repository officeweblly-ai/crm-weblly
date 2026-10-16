"use client";

import Link from "next/link";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import { AGENDA_KIND_LABEL, KIND_FAMILY, type AgendaItem, type KindFamily } from "@/lib/domain/calendar";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const FAMILY_VAR: Record<KindFamily, string> = {
  meet: "var(--k-meet)",
  work: "var(--k-work)",
  date: "var(--k-date)",
  money: "var(--k-money)",
  client: "var(--k-client)",
};

export const FAMILY_LEGEND: { family: KindFamily; label: string }[] = [
  { family: "meet", label: "פגישות ושיחות" },
  { family: "work", label: "משימות" },
  { family: "date", label: "דדליינים ושלבים" },
  { family: "money", label: "תשלומים" },
  { family: "client", label: "מעקב וחוזים" },
];

export const kindColor = (item: AgendaItem) => FAMILY_VAR[KIND_FAMILY[item.kind]];

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-[2px]", className)} style={{ background: color }} aria-hidden />;
}

/** Legend for the five families — the palette never stands alone. */
export function Legend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3", className)} aria-label="מקרא">
      {FAMILY_LEGEND.map((l) => (
        <li key={l.family} className="flex items-center gap-1.5">
          <Swatch color={FAMILY_VAR[l.family]} />
          {l.label}
        </li>
      ))}
    </ul>
  );
}

/** Opens an event in the editor, everything else navigates to its object. */
export function ItemLink({
  item,
  onEdit,
  className,
  style,
  children,
  draggable,
  title,
}: {
  item: AgendaItem;
  onEdit?: (item: AgendaItem) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  draggable?: boolean;
  title?: string;
}) {
  const label = title ?? `${AGENDA_KIND_LABEL[item.kind]}: ${item.title}${item.context ? ` · ${item.context}` : ""}${item.time ? ` · ${item.time}` : ""}`;
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData("text/event-id", item.sourceId);
    e.dataTransfer.effectAllowed = "move";
  };
  if (item.event && onEdit) {
    return (
      <button type="button" onClick={() => onEdit(item)} className={cn("text-start", className)} style={style} title={label} draggable={draggable} onDragStart={draggable ? onDragStart : undefined}>
        {children}
      </button>
    );
  }
  return (
    <Link href={item.href} className={className} style={style} title={label}>
      {children}
    </Link>
  );
}

/** One line inside a day cell: color bar · time · title. */
export function AgendaChip({ item, onEdit, draggable }: { item: AgendaItem; onEdit?: (i: AgendaItem) => void; draggable?: boolean }) {
  const color = kindColor(item);
  return (
    <ItemLink
      item={item}
      onEdit={onEdit}
      draggable={draggable && Boolean(item.event)}
      className={cn(
        "group/chip flex h-[22px] w-full min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 text-[12px] leading-none transition-colors hover:bg-sunken",
        item.done && "opacity-55",
      )}
    >
      <span className="h-3 w-[3px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {item.time && <span className="shrink-0 font-medium text-ink-3 num" dir="ltr">{item.time}</span>}
      <span className={cn("min-w-0 truncate text-ink", item.done && "line-through decoration-ink-3/50")}>{item.title}</span>
    </ItemLink>
  );
}

/** A full row for lists (today, day agenda, mobile week). */
export function AgendaRow({
  item,
  onEdit,
  people,
  actions,
  showDate,
  overdue,
}: {
  item: AgendaItem;
  onEdit?: (i: AgendaItem) => void;
  people?: Record<string, string>;
  actions?: ReactNode;
  showDate?: string | null;
  overdue?: boolean;
}) {
  const color = kindColor(item);
  const person = item.assigneeId && people ? people[item.assigneeId] : null;
  return (
    <div className={cn("group/row flex items-stretch gap-3 px-4 py-2.5 sm:px-5", item.done && "opacity-60")}>
      <div className="flex w-12 shrink-0 flex-col items-start pt-px text-xs num">
        {item.time ? (
          <>
            <span className="font-semibold text-ink" dir="ltr">{item.time}</span>
            {item.endTime && <span className="text-ink-3" dir="ltr">{item.endTime}</span>}
          </>
        ) : showDate ? (
          <span className={cn("font-medium", overdue ? "text-danger" : "text-ink-3")}>{showDate}</span>
        ) : (
          <span className="text-ink-3">כל היום</span>
        )}
      </div>
      <span className="w-[3px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <ItemLink item={item} onEdit={onEdit} className="min-w-0 flex-1 rounded-sm">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cn("truncate text-sm font-medium text-ink", item.done && "line-through decoration-ink-3/50")}>{item.title}</span>
          {item.amount !== null && <bdi dir="ltr" className="shrink-0 text-sm text-ink-2 num">{formatMoney(item.amount)}</bdi>}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-ink-3">
          <span>{AGENDA_KIND_LABEL[item.kind]}</span>
          {item.context && <span className="truncate">· {item.context}</span>}
          {person && <span>· {person}</span>}
          {item.status && <span>· {item.status}</span>}
        </span>
      </ItemLink>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
