"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MonthGrid, calendarHref } from "@/components/calendar/calendar-view";
import { Legend } from "@/components/calendar/agenda-ui";
import { useCreate } from "@/components/shell/nav";
import { monthName, type AgendaItem } from "@/lib/domain/calendar";

/** "לוח החודש": the month's operational dates on one board. */
export function MonthBoard({ date, items, today }: { date: string; items: AgendaItem[]; today: string }) {
  const { editEvent, newEvent } = useCreate();
  const month = date.slice(0, 7);
  const inMonth = items.filter((i) => i.date.startsWith(month) || (i.endDate ?? "").startsWith(month));
  const open = inMonth.filter((i) => !i.done);
  const deadlines = open.filter((i) => ["deadline", "milestone", "delivery"].includes(i.kind)).length;
  const payments = open.filter((i) => i.kind === "payment_due").length;
  const meetings = inMonth.filter((i) => i.kind === "meeting" || i.kind === "call").length;
  return (
    <section aria-labelledby="month-board-h" className="flex min-w-0 flex-col gap-2.5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h2 id="month-board-h" className="text-base font-semibold text-ink">לוח החודש</h2>
          <span className="text-sm text-ink-3">{monthName(date)} {date.slice(0, 4)}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-3">
          <span className="num"><span className="font-semibold text-ink">{deadlines}</span> דדליינים</span>
          <span className="num"><span className="font-semibold text-ink">{meetings}</span> פגישות</span>
          <span className="num"><span className="font-semibold text-ink">{payments}</span> תשלומים צפויים</span>
          <Link href={calendarHref({ view: "month", date })} className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover">
            ליומן
            <ArrowLeft className="size-3.5" aria-hidden />
          </Link>
        </div>
      </header>
      <MonthGrid
        date={date}
        items={items}
        today={today}
        compact
        onEdit={(i) => i.event && editEvent(i.event)}
        onAdd={(d) => newEvent({ starts_on: d })}
        dayHref={(d) => calendarHref({ view: "day", date: d })}
      />
      <Legend />
    </section>
  );
}
