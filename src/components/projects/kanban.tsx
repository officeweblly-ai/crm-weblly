"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, ListChecks } from "lucide-react";
import { setProjectStatus } from "@/lib/actions/crm";
import { projectStatus, type ProjectStatus } from "@/lib/domain/labels";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectWithMoney } from "@/lib/data/crm";

type Card = ProjectWithMoney & { open_tasks?: number };
type Columns = Record<ProjectStatus, Card[]>;

function group(projects: Card[]): Columns {
  const cols = Object.fromEntries(projectStatus.values.map((s) => [s, [] as Card[]])) as unknown as Columns;
  for (const p of projects) cols[p.status].push(p);
  for (const s of projectStatus.values) cols[s].sort((a, b) => a.board_position - b.board_position);
  return cols;
}

function findColumn(cols: Columns, id: string): ProjectStatus | null {
  if ((projectStatus.values as string[]).includes(id)) return id as ProjectStatus;
  for (const s of projectStatus.values) if (cols[s].some((p) => p.id === id)) return s;
  return null;
}

function ProjectCardBody({ p, dragging }: { p: Card; dragging?: boolean }) {
  const due = daysUntil(p.deadline);
  const late = p.status !== "completed" && due !== null && due < 0;
  const balance = p.financials?.balance_due ?? 0;
  return (
    <div className={cn("rounded-md border border-line bg-surface p-3 text-start shadow-1", dragging && "rotate-[-1.5deg] shadow-3 ring-2 ring-accent/30")}>
      <div className="text-sm font-medium leading-snug text-ink">{p.name}</div>
      <div className="mt-0.5 truncate text-xs text-ink-3">{p.client?.business_name ?? p.client?.name}</div>
      {p.next_action && <div className="mt-2 line-clamp-2 border-s-2 border-accent/40 ps-2 text-xs text-ink-2">{p.next_action}</div>}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        {p.deadline && (
          <span className={cn("inline-flex items-center gap-1", late && "font-medium text-danger")}>
            <CalendarClock className="size-3.5" aria-hidden />
            {formatDate(p.deadline, { short: true })}
          </span>
        )}
        {(p.open_tasks ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-3.5" aria-hidden />
            <span className="num">{p.open_tasks}</span>
          </span>
        )}
        {balance > 0 && (
          <span className="ms-auto font-medium text-ink-2">
            <bdi dir="ltr" className="num">{formatMoney(balance)}</bdi>
          </span>
        )}
      </div>
    </div>
  );
}

function SortableCard({ p, onMove }: { p: Card; onMove: (id: string, to: ProjectStatus) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id, data: { type: "card" } });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group relative touch-manipulation", isDragging && "opacity-40")}
    >
      <div {...attributes} {...listeners} aria-roledescription="כרטיס פרויקט שניתן לגרור" aria-label={`${p.name} — ${projectStatus.label(p.status)}`} className="cursor-grab rounded-md focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing">
        <ProjectCardBody p={p} />
      </div>
      <div className="absolute end-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <label className="sr-only" htmlFor={`move-${p.id}`}>העברה לשלב</label>
        <select
          id={`move-${p.id}`}
          value={p.status}
          onChange={(e) => onMove(p.id, e.target.value as ProjectStatus)}
          className="h-7 max-w-7 cursor-pointer appearance-none rounded border border-line bg-surface/95 text-transparent md:max-w-7"
          title="העברה לשלב"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236b7383' stroke-width='2'%3E%3Cpath d='m7 15 5 5 5-5M7 9l5-5 5 5'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "center" }}
        >
          {projectStatus.list.map((s) => (
            <option key={s.value} value={s.value} className="text-ink">{s.label}</option>
          ))}
        </select>
        <Link href={`/projects/${p.id}`} className="grid h-7 place-items-center rounded border border-line bg-surface/95 px-2 text-xs text-ink-2 hover:text-accent">
          פתיחה
        </Link>
      </div>
    </li>
  );
}

function Column({ status, items, onMove }: { status: ProjectStatus; items: Card[]; onMove: (id: string, to: ProjectStatus) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, data: { type: "column" } });
  const total = items.reduce((s, p) => s + Math.max(0, p.financials?.balance_due ?? 0), 0);
  const tone = projectStatus.tone(status);
  return (
    <section
      aria-label={projectStatus.label(status)}
      className="flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-lg bg-sunken/70 sm:w-[272px]"
    >
      <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span
            className={cn(
              "size-2 rounded-full",
              tone === "ok" && "bg-ok",
              tone === "warn" && "bg-warn",
              tone === "accent" && "bg-accent",
              tone === "info" && "bg-info",
              tone === "neutral" && "bg-ink-3",
            )}
            aria-hidden
          />
          {projectStatus.label(status)}
          <span className="rounded-full bg-surface px-1.5 text-xs font-medium text-ink-3 num">{items.length}</span>
        </h2>
        {total > 0 && <bdi dir="ltr" className="text-xs text-ink-3 num">{formatMoney(total)}</bdi>}
      </header>
      <SortableContext id={status} items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 rounded-b-lg px-2 pb-3 transition-colors", isOver && "bg-accent-soft/60")}>
          {items.map((p) => (
            <SortableCard key={p.id} p={p} onMove={onMove} />
          ))}
          {items.length === 0 && <li className="grid flex-1 place-items-center rounded-md border border-dashed border-line-strong py-6 text-xs text-ink-3">גרור לכאן</li>}
        </ul>
      </SortableContext>
    </section>
  );
}

function positionBetween(list: Card[], index: number): number {
  const before = list[index - 1]?.board_position;
  const after = list[index + 1]?.board_position;
  if (before === undefined && after === undefined) return Date.now() / 1000;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

/**
 * Drag a card between columns to change the project's status in the DB.
 * Optimistic; on failure the board snaps back and an error explains why.
 */
export function KanbanBoard({ projects }: { projects: Card[] }) {
  const router = useRouter();
  const [cols, setCols] = useState<Columns>(() => group(projects));
  const [activeId, setActiveId] = useState<string | null>(null);
  const snapshot = useRef<Columns | null>(null);
  const [, start] = useTransition();

  // Re-sync when the server sends fresh data.
  const [source, setSource] = useState(projects);
  if (source !== projects) {
    setSource(projects);
    setCols(group(projects));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const active = useMemo(() => (activeId ? Object.values(cols).flat().find((p) => p.id === activeId) ?? null : null), [activeId, cols]);

  const persist = (id: string, to: ProjectStatus, position: number, rollback: Columns) =>
    start(async () => {
      const r = await setProjectStatus({ id, status: to, board_position: position });
      if (!r.ok) {
        setCols(rollback);
        toast.error(`לא ניתן להעביר את הפרויקט: ${r.error}`);
      } else {
        router.refresh();
      }
    });

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    snapshot.current = cols;
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = findColumn(cols, String(active.id));
    const to = findColumn(cols, String(over.id));
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const card = prev[from].find((p) => p.id === active.id);
      if (!card) return prev;
      const target = [...prev[to]];
      const overIndex = target.findIndex((p) => p.id === over.id);
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, { ...card, status: to });
      return { ...prev, [from]: prev[from].filter((p) => p.id !== active.id), [to]: target };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const before = snapshot.current;
    snapshot.current = null;
    const { active, over } = e;
    if (!over || !before) {
      if (before) setCols(before);
      return;
    }
    const id = String(active.id);
    const to = findColumn(cols, id);
    const originalCol = findColumn(before, id);
    if (!to || !originalCol) return;

    const list = [...cols[to]];
    const oldIndex = list.findIndex((p) => p.id === id);
    let newIndex = list.findIndex((p) => p.id === over.id);
    if (newIndex < 0) newIndex = oldIndex;
    const [moved] = list.splice(oldIndex, 1);
    list.splice(newIndex, 0, moved);
    const position = positionBetween(list, newIndex);
    list[newIndex] = { ...moved, status: to, board_position: position };

    const unchanged = originalCol === to && before[to].findIndex((p) => p.id === id) === newIndex;
    setCols({ ...cols, [to]: list });
    if (unchanged) return;
    persist(id, to, position, before);
  };

  /** Keyboard / mobile fallback: move via the select on each card. */
  const moveTo = (id: string, to: ProjectStatus) => {
    const from = findColumn(cols, id);
    if (!from || from === to) return;
    const before = cols;
    const card = cols[from].find((p) => p.id === id)!;
    const last = cols[to][cols[to].length - 1];
    const position = last ? last.board_position + 1 : Date.now() / 1000;
    setCols({ ...cols, [from]: cols[from].filter((p) => p.id !== id), [to]: [...cols[to], { ...card, status: to, board_position: position }] });
    toast.message(`"${card.name}" הועבר ל${projectStatus.label(to)}`);
    persist(id, to, position, before);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        if (snapshot.current) setCols(snapshot.current);
        setActiveId(null);
      }}
      accessibility={{
        screenReaderInstructions: { draggable: "לחץ רווח כדי להרים, חצים כדי להזיז, רווח כדי לשחרר, Escape לביטול." },
      }}
    >
      <div className="scrollbar-thin -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" role="region" aria-label="לוח פרויקטים" tabIndex={0}>
        {projectStatus.values.map((s) => (
          <Column key={s} status={s} items={cols[s]} onMove={moveTo} />
        ))}
      </div>
      <DragOverlay>{active ? <ProjectCardBody p={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
