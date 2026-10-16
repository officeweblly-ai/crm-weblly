"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreate } from "@/components/shell/nav";
import { moveEvent } from "@/lib/actions/operations";
import {
  AGENDA_FILTERS,
  CALENDAR_VIEWS,
  KIND_FAMILY,
  addDays,
  dayNum,
  eachDay,
  matchesFilter,
  monthGrid,
  monthName,
  onDay,
  shiftDate,
  startOfWeek,
  type AgendaFilter,
  type AgendaItem,
  type CalendarView,
} from "@/lib/domain/calendar";
import { WEEKDAYS, WEEKDAY_NAMES } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { AgendaChip, AgendaRow, FAMILY_VAR, ItemLink, Legend, kindColor } from "./agenda-ui";

type Person = { id: string; name: string };
type Params = { view: CalendarView; date: string; f: AgendaFilter; who: string };

export function calendarHref(p: Partial<Params> & { view: CalendarView; date: string }) {
  const q = new URLSearchParams({ view: p.view, date: p.date });
  if (p.f && p.f !== "all") q.set("f", p.f);
  if (p.who && p.who !== "all") q.set("who", p.who);
  return `/calendar?${q}`;
}

function useIsraelNow() {
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
          .formatToParts(new Date())
          .map((x) => [x.type, x.value]),
      );
      setNow({ date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) });
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useEventDrop() {
  const router = useRouter();
  const [, start] = useTransition();
  return (e: DragEvent, day: string) => {
    const id = e.dataTransfer.getData("text/event-id");
    if (!id) return;
    e.preventDefault();
    start(async () => {
      const r = await moveEvent(id, day);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  };
}

const allowDrop = (e: DragEvent) => {
  if (e.dataTransfer.types.includes("text/event-id")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
};

export function CalendarScreen({ params, items, people, today, eventId }: { params: Params; items: AgendaItem[]; people: Person[]; today: string; eventId?: string }) {
  const { newEvent, editEvent } = useCreate();
  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const visible = useMemo(
    () => items.filter((i) => matchesFilter(i, params.f) && (params.who === "all" || i.assigneeId === params.who || (!i.assigneeId && i.source === "event"))),
    [items, params.f, params.who],
  );
  const onEdit = (i: AgendaItem) => i.event && editEvent(i.event);

  // Deep link: /calendar?event=<id> opens the editor once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !eventId) return;
    const hit = items.find((i) => i.event?.id === eventId);
    if (hit?.event) {
      opened.current = true;
      editEvent(hit.event);
    }
  }, [eventId, items, editEvent]);

  const title =
    params.view === "day"
      ? `${WEEKDAY_NAMES[new Date(`${params.date}T00:00:00Z`).getUTCDay()]}, ${dayNum(params.date)} ב${monthName(params.date)}`
      : params.view === "week"
        ? weekTitle(params.date)
        : params.view === "month"
          ? `${monthName(params.date)} ${params.date.slice(0, 4)}`
          : params.date.slice(0, 4);

  const href = (p: Partial<Params>) => calendarHref({ ...params, ...p });
  const count = visible.filter((i) => !i.done).length;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex items-center">
            <Link href={href({ date: shiftDate(params.view, params.date, -1) })} className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken" aria-label="הקודם">
              <ChevronRight className="size-5" aria-hidden />
            </Link>
            <Link href={href({ date: shiftDate(params.view, params.date, 1) })} className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken" aria-label="הבא">
              <ChevronLeft className="size-5" aria-hidden />
            </Link>
          </div>
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {params.date !== today && (
            <Link href={href({ date: today })} className="ms-1 inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink-2 hover:bg-sunken">
              היום
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist" aria-label="תצוגה">
            {CALENDAR_VIEWS.map((v) => (
              <Link
                key={v.value}
                href={href({ view: v.value })}
                role="tab"
                aria-selected={params.view === v.value}
                className={cn("inline-flex h-8 min-w-12 items-center justify-center rounded px-3 text-sm", params.view === v.value ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}
              >
                {v.label}
              </Link>
            ))}
          </div>
          <Button size="sm" className="h-9" onClick={() => newEvent({ starts_on: params.view === "day" ? params.date : today })}>
            <Plus aria-hidden />
            אירוע
          </Button>
        </div>
      </header>

      <nav aria-label="סינון" className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 scrollbar-thin sm:mx-0 sm:flex-wrap sm:px-0">
        <FilterChip href={href({ f: "all", who: "all" })} active={params.f === "all" && params.who === "all"}>הכל</FilterChip>
        {people.map((p) => (
          <FilterChip key={p.id} href={href({ who: params.who === p.id ? "all" : p.id })} active={params.who === p.id}>
            {p.name}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-line-strong" aria-hidden />
        {AGENDA_FILTERS.filter((x) => x.value !== "all").map((x) => (
          <FilterChip key={x.value} href={href({ f: params.f === x.value ? "all" : x.value })} active={params.f === x.value}>
            {x.label}
          </FilterChip>
        ))}
        <span className="ms-auto hidden shrink-0 text-xs text-ink-3 num lg:inline">{count} פריטים פתוחים</span>
      </nav>

      {params.view === "month" && <MonthGrid date={params.date} items={visible} today={today} onEdit={onEdit} onAdd={(d) => newEvent({ starts_on: d })} dayHref={(d) => href({ view: "day", date: d })} />}
      {params.view === "week" && <WeekView date={params.date} items={visible} today={today} onEdit={onEdit} names={names} dayHref={(d) => href({ view: "day", date: d })} />}
      {params.view === "day" && <DayView date={params.date} items={visible} today={today} onEdit={onEdit} names={names} />}
      {params.view === "year" && <YearView date={params.date} items={visible} today={today} dayHref={(d) => href({ view: "day", date: d })} monthHref={(d) => href({ view: "month", date: d })} />}

      <Legend className="pt-1" />
    </div>
  );
}

function weekTitle(date: string) {
  const from = startOfWeek(date);
  const to = addDays(from, 6);
  return from.slice(5, 7) === to.slice(5, 7)
    ? `${dayNum(from)}–${dayNum(to)} ב${monthName(from)} ${from.slice(0, 4)}`
    : `${dayNum(from)} ב${monthName(from)} – ${dayNum(to)} ב${monthName(to)}`;
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] transition-colors",
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Month — classic grid, also used compactly on the dashboard.
// ---------------------------------------------------------------------------
export function MonthGrid({
  date,
  items,
  today,
  onEdit,
  onAdd,
  dayHref,
  compact,
  maxPerDay,
}: {
  date: string;
  items: AgendaItem[];
  today: string;
  onEdit?: (i: AgendaItem) => void;
  onAdd?: (day: string) => void;
  dayHref: (day: string) => string;
  compact?: boolean;
  maxPerDay?: number;
}) {
  const weeks = monthGrid(date);
  const month = date.slice(0, 7);
  const drop = useEventDrop();
  const max = maxPerDay ?? (compact ? 3 : 4);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line bg-sunken/50">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={cn("px-2 py-1.5 text-[11px] font-medium text-ink-3", i === 6 && "text-ink-3/70")}>
            <span className="sm:hidden">{d}</span>
            <span className="hidden sm:inline">{WEEKDAY_NAMES[i]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-hair">
        {weeks.flat().map((day) => {
          const inMonth = day.slice(0, 7) === month;
          const list = items.filter((i) => onDay(i, day));
          const shown = list.slice(0, max);
          const isToday = day === today;
          const weekend = new Date(`${day}T00:00:00Z`).getUTCDay() === 6;
          return (
            <div
              key={day}
              onDragOver={allowDrop}
              onDrop={(e) => drop(e, day)}
              className={cn(
                "group/cell relative flex min-w-0 flex-col bg-surface",
                compact ? "min-h-[92px] sm:min-h-[104px]" : "min-h-[76px] sm:min-h-[122px]",
                !inMonth && "bg-paper/60",
                weekend && inMonth && "bg-[#fbfbfa]",
              )}
            >
              <div className="flex items-center justify-between px-1.5 pt-1">
                <Link
                  href={dayHref(day)}
                  className={cn(
                    "grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs num",
                    isToday ? "bg-accent font-semibold text-white" : inMonth ? "text-ink-2 hover:bg-sunken" : "text-ink-3/60 hover:bg-sunken",
                  )}
                  aria-label={`${dayNum(day)} ב${monthName(day)}${list.length ? ` — ${list.length} פריטים` : ""}`}
                >
                  {dayNum(day)}
                </Link>
                {onAdd && (
                  <button
                    type="button"
                    onClick={() => onAdd(day)}
                    className="hidden size-6 place-items-center rounded text-ink-3 opacity-0 transition-opacity hover:bg-sunken hover:text-ink group-hover/cell:opacity-100 focus-visible:opacity-100 sm:grid"
                    aria-label={`אירוע חדש ב-${dayNum(day)} ב${monthName(day)}`}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
              {/* Phones: dots only; the day view has the details. */}
              <Link href={dayHref(day)} className="flex flex-wrap gap-0.5 px-2 pb-1.5 pt-1 sm:hidden" aria-hidden tabIndex={-1}>
                {list.slice(0, 6).map((i) => (
                  <span key={i.key} className={cn("size-1.5 rounded-full", i.done && "opacity-40")} style={{ background: kindColor(i) }} />
                ))}
              </Link>
              <div className="hidden min-w-0 flex-col gap-px px-1 pb-1 sm:flex">
                {shown.map((i) => (
                  <AgendaChip key={i.key} item={i} onEdit={onEdit} draggable={!compact} />
                ))}
                {list.length > shown.length && (
                  <Link href={dayHref(day)} className="px-1.5 text-[11px] font-medium text-ink-3 hover:text-ink">
                    עוד {list.length - shown.length}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time grid (week + day)
// ---------------------------------------------------------------------------
const HOUR_PX = 48;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function layoutTimed(list: AgendaItem[]) {
  const timed = list
    .filter((i) => i.time)
    .map((i) => {
      const s = toMin(i.time!);
      const e = i.endTime && toMin(i.endTime) > s ? toMin(i.endTime) : s + 45;
      return { item: i, s, e, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  // Greedy lanes per overlapping cluster.
  let cluster: typeof timed = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    cluster = [];
  };
  for (const t of timed) {
    if (t.s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.e > t.s).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    t.lane = lane;
    cluster.push(t);
    clusterEnd = Math.max(clusterEnd, t.e);
  }
  flush();
  return timed;
}

function TimeGrid({ days, items, today, onEdit, dayHref }: { days: string[]; items: AgendaItem[]; today: string; onEdit: (i: AgendaItem) => void; dayHref?: (d: string) => string }) {
  const { newEvent } = useCreate();
  const now = useIsraelNow();
  const drop = useEventDrop();
  const scroller = useRef<HTMLDivElement>(null);
  const timedAll = items.filter((i) => i.time && days.some((d) => i.date === d));
  const minH = Math.min(7, ...timedAll.map((i) => Math.floor(toMin(i.time!) / 60)));
  const maxH = Math.max(22, ...timedAll.map((i) => Math.ceil(((i.endTime ? toMin(i.endTime) : toMin(i.time!) + 45)) / 60)));
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = Math.min(...timedAll.map((i) => toMin(i.time!)), 8 * 60);
    el.scrollTop = Math.max(0, ((first - minH * 60) / 60) * HOUR_PX - 12);
    // Only on mount / range change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  const cols = `3.25rem repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div className="border-e border-line" />
        {days.map((d) => {
          const isToday = d === today;
          return (
            <div key={d} className="min-w-0 border-e border-line px-2 py-1.5 last:border-e-0">
              {dayHref ? (
                <Link href={dayHref(d)} className="flex items-baseline gap-1.5 text-xs text-ink-3 hover:text-ink">
                  <span>{WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                  <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm num", isToday ? "bg-accent font-semibold text-white" : "font-medium text-ink")}>{dayNum(d)}</span>
                </Link>
              ) : null}
              <div className="mt-1 flex min-w-0 flex-col gap-px" onDragOver={allowDrop} onDrop={(e) => drop(e, d)}>
                {items
                  .filter((i) => !i.time && onDay(i, d))
                  .map((i) => (
                    <AgendaChip key={i.key} item={i} onEdit={onEdit} draggable />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="scrollbar-thin relative max-h-[calc(100dvh-300px)] min-h-[360px] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: hours.length * HOUR_PX }}>
          <div className="relative border-e border-line">
            {hours.map((h, i) => (
              <div key={h} className="absolute inset-x-0 -translate-y-1/2 pe-1.5 text-end text-[11px] text-ink-3 num" style={{ top: i * HOUR_PX }} dir="ltr">
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutTimed(items.filter((i) => i.date === d));
            const isToday = now && d === now.date;
            return (
              <div
                key={d}
                className={cn("relative border-e border-line last:border-e-0", d === today && "bg-accent-soft/25")}
                onDragOver={allowDrop}
                onDrop={(e) => drop(e, d)}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const y = e.nativeEvent.offsetY;
                  const m = minH * 60 + Math.floor((y / HOUR_PX) * 2) * 30;
                  const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                  newEvent({ starts_on: d, start_time: t, all_day: false });
                }}
              >
                {hours.map((h, i) => (
                  <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} aria-hidden />
                ))}
                {isToday && now.minutes >= minH * 60 && now.minutes <= maxH * 60 && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: ((now.minutes - minH * 60) / 60) * HOUR_PX }} aria-hidden>
                    <span className="-ms-1 size-2 rounded-full bg-danger" />
                    <span className="h-px flex-1 bg-danger" />
                  </div>
                )}
                {placed.map(({ item, s, e, lane, lanes }) => {
                  const color = kindColor(item);
                  const top = ((s - minH * 60) / 60) * HOUR_PX;
                  const height = Math.max(22, ((e - s) / 60) * HOUR_PX - 2);
                  return (
                    <ItemLink
                      key={item.key}
                      item={item}
                      onEdit={onEdit}
                      draggable={Boolean(item.event)}
                      className={cn("absolute overflow-hidden rounded-[5px] border-s-[3px] px-1.5 py-0.5 text-[12px] leading-tight transition-shadow hover:shadow-2", item.done && "opacity-60")}
                      style={{
                        top,
                        height,
                        insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        borderInlineStartColor: color,
                        background: `color-mix(in oklab, ${color} 9%, white)`,
                      }}
                    >
                      <span className="block truncate font-medium text-ink">{item.title}</span>
                      {height > 30 && (
                        <span className="block truncate text-ink-3" dir="ltr" style={{ textAlign: "right" }}>
                          {item.time}
                          {item.endTime ? `–${item.endTime}` : ""}
                        </span>
                      )}
                      {height > 48 && item.context && <span className="block truncate text-ink-3">{item.context}</span>}
                    </ItemLink>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekView({ date, items, today, onEdit, names, dayHref }: { date: string; items: AgendaItem[]; today: string; onEdit: (i: AgendaItem) => void; names: Record<string, string>; dayHref: (d: string) => string }) {
  const from = startOfWeek(date);
  const days = eachDay(from, addDays(from, 6));
  return (
    <>
      <div className="hidden md:block">
        <TimeGrid days={days} items={items} today={today} onEdit={onEdit} dayHref={dayHref} />
      </div>
      {/* Phones: a Sun→Sat planner list. */}
      <ol className="flex flex-col gap-2 md:hidden">
        {days.map((d) => {
          const list = items.filter((i) => onDay(i, d));
          return (
            <li key={d} className={cn("overflow-hidden rounded-lg border bg-surface", d === today ? "border-accent/40" : "border-line")}>
              <Link href={dayHref(d)} className="flex items-center justify-between border-b border-line px-4 py-2">
                <span className="flex items-baseline gap-2">
                  <span className={cn("text-sm font-semibold", d === today ? "text-accent" : "text-ink")}>{WEEKDAY_NAMES[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                  <span className="text-xs text-ink-3 num">{dayNum(d)}.{Number(d.slice(5, 7))}</span>
                </span>
                <span className="text-xs text-ink-3 num">{list.length ? `${list.length} פריטים` : "פנוי"}</span>
              </Link>
              {list.length > 0 && (
                <div className="divide-y divide-line">
                  {list.map((i) => (
                    <AgendaRow key={i.key} item={i} onEdit={onEdit} people={names} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function DayView({ date, items, today, onEdit, names }: { date: string; items: AgendaItem[]; today: string; onEdit: (i: AgendaItem) => void; names: Record<string, string> }) {
  const list = items.filter((i) => onDay(i, date));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <TimeGrid days={[date]} items={items} today={today} onEdit={onEdit} />
      <section className="overflow-hidden rounded-lg border border-line bg-surface" aria-label="סדר היום">
        <h2 className="border-b border-line px-5 py-2.5 text-sm font-semibold text-ink">סדר היום <span className="font-normal text-ink-3 num">· {list.length}</span></h2>
        {list.length ? (
          <div className="divide-y divide-line">
            {list.map((i) => (
              <AgendaRow key={i.key} item={i} onEdit={onEdit} people={names} />
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-3">אין כלום ביום הזה. לחיצה על שעה ביומן יוצרת אירוע.</p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year — 12 months at a glance; density shown by dots.
// ---------------------------------------------------------------------------
function YearView({ date, items, today, dayHref, monthHref }: { date: string; items: AgendaItem[]; today: string; dayHref: (d: string) => string; monthHref: (d: string) => string }) {
  const year = date.slice(0, 4);
  const byDay = new Map<string, AgendaItem[]>();
  for (const i of items) for (const d of eachDay(i.date, i.endDate ?? i.date)) if (d.startsWith(year)) byDay.set(d, [...(byDay.get(d) ?? []), i]);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, m) => {
        const first = `${year}-${String(m + 1).padStart(2, "0")}-01`;
        const month = first.slice(0, 7);
        const monthItems = [...byDay.entries()].filter(([d]) => d.startsWith(month)).flatMap(([, l]) => l);
        const unique = new Set(monthItems.map((i) => i.key));
        const deadlines = new Set(monthItems.filter((i) => KIND_FAMILY[i.kind] === "date").map((i) => i.key)).size;
        return (
          <section key={month} className="rounded-lg border border-line bg-surface p-3">
            <header className="mb-2 flex items-baseline justify-between">
              <Link href={monthHref(first)} className={cn("text-sm font-semibold hover:text-accent", today.startsWith(month) ? "text-accent" : "text-ink")}>
                {monthName(first)}
              </Link>
              <span className="text-[11px] text-ink-3 num">
                {unique.size ? `${unique.size} פריטים${deadlines ? ` · ${deadlines} דדליינים` : ""}` : "—"}
              </span>
            </header>
            <div className="grid grid-cols-7 text-center text-[10px] text-ink-3">
              {WEEKDAYS.map((d) => (
                <span key={d} className="pb-1">{d}</span>
              ))}
              {monthGrid(first)
                .flat()
                .map((d) => {
                  if (!d.startsWith(month)) return <span key={d} />;
                  const list = byDay.get(d) ?? [];
                  const top = list.find((i) => KIND_FAMILY[i.kind] === "date") ?? list.find((i) => KIND_FAMILY[i.kind] === "money") ?? list[0];
                  return (
                    <Link
                      key={d}
                      href={dayHref(d)}
                      className={cn("relative grid h-8 place-items-center rounded text-[12px] num hover:bg-sunken", d === today ? "font-semibold text-accent" : list.length ? "font-medium text-ink" : "text-ink-3")}
                      aria-label={`${dayNum(d)} ב${monthName(d)}${list.length ? ` — ${list.length} פריטים` : ""}`}
                    >
                      {dayNum(d)}
                      {top && <span className="absolute bottom-1 h-[3px] rounded-full" style={{ width: Math.min(14, 4 + list.length * 3), background: FAMILY_VAR[KIND_FAMILY[top.kind]] }} aria-hidden />}
                    </Link>
                  );
                })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
