"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, FileText, Link2, ListTodo, Lock, MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { FileUploader } from "@/components/files/file-uploader";
import { TaskFormModal } from "./task-form";
import { addChecklistItem, deleteChecklistItem, deleteTask, setTaskStatus, toggleChecklistItem } from "@/lib/actions/crm";
import { getFileUrl } from "@/lib/actions/files";
import { taskPriority, taskStatus, type TaskStatus } from "@/lib/domain/labels";
import { daysUntil, displayUrl, ensureUrl, formatDay, relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/lib/data/crm";

type TaskLink = { label?: string; url: string };

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}

function Checklist({ task }: { task: TaskRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        after?.();
        router.refresh();
      } else toast.error(r.error ?? "הפעולה נכשלה");
    });

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    run(() => addChecklistItem(task.id, draft), () => setDraft(""));
  };

  return (
    <div>
      <h4 className="mb-1.5 text-xs font-medium text-ink-3">תתי-משימות</h4>
      {task.checklist.length > 0 && (
        <ul className="mb-2 flex flex-col">
          {task.checklist.map((c) => (
            <li key={c.id} className="group/item flex min-h-9 items-center gap-2.5 rounded-md px-1 hover:bg-sunken/60">
              <input
                type="checkbox"
                className="size-4 shrink-0 cursor-pointer accent-(--accent)"
                checked={c.is_done}
                disabled={pending}
                onChange={(e) => run(() => toggleChecklistItem(c.id, e.target.checked))}
                aria-label={c.title}
              />
              <span className={cn("min-w-0 flex-1 text-sm", c.is_done ? "text-ink-3 line-through" : "text-ink")}>{c.title}</span>
              <button
                type="button"
                onClick={() => run(() => deleteChecklistItem(c.id))}
                className="grid size-7 place-items-center rounded text-ink-3 hover:text-danger sm:opacity-0 sm:group-hover/item:opacity-100 sm:focus-visible:opacity-100"
                aria-label={`מחיקת תת-משימה: ${c.title}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="הוספת תת-משימה"
          aria-label="הוספת תת-משימה"
          maxLength={300}
          className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
        />
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!draft.trim()}>
          הוספה
        </Button>
      </form>
    </div>
  );
}

function TaskDetails({ task }: { task: TaskRow }) {
  const [pending, start] = useTransition();
  const links = (Array.isArray(task.links) ? task.links : []) as TaskLink[];
  const openFile = (id: string) =>
    start(async () => {
      const r = await getFileUrl(id);
      if (r.ok) window.open(r.data.url, "_blank", "noopener,noreferrer");
      else toast.error(r.error);
    });

  return (
    <div className="mt-3 flex flex-col gap-4 rounded-lg border border-line bg-paper/60 p-3">
      {task.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{task.description}</p>}
      <Checklist task={task} />
      {links.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-ink-3">קישורים</h4>
          <ul className="flex flex-col gap-1">
            {links.map((l, i) => (
              <li key={i}>
                <a href={ensureUrl(l.url) ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-sm text-accent hover:underline">
                  <Link2 className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{l.label || <bdi dir="ltr">{displayUrl(l.url)}</bdi>}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="mb-1.5 text-xs font-medium text-ink-3">קבצים</h4>
        {task.task_files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {task.task_files.map((f) => (
              <li key={f.id}>
                <button type="button" disabled={pending} onClick={() => openFile(f.id)} className="inline-flex h-8 max-w-60 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs text-ink-2 hover:border-line-strong hover:text-ink">
                  <FileText className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span className="truncate">{f.original_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {task.project_id || task.client_id ? (
          <FileUploader clientId={task.client_id} projectId={task.project_id} taskId={task.id} category="deliverables" compact />
        ) : (
          <p className="text-xs text-ink-3">כדי לצרף קבצים — שייכו את המשימה לפרויקט.</p>
        )}
      </div>
      {task.internal_notes && (
        <div className="rounded-md border border-warn/20 bg-warn-soft/40 px-3 py-2">
          <h4 className="text-xs font-medium text-warn">הערות פנימיות</h4>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-2">{task.internal_notes}</p>
        </div>
      )}
    </div>
  );
}

function TaskItem({ task, showContext }: { task: TaskRow; showContext: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useOptimistic<TaskStatus>(task.status);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const done = status === "done";
  const due = daysUntil(task.due_date);
  const overdue = !done && due !== null && due < 0;
  const checklistDone = task.checklist.filter((c) => c.is_done).length;
  const links = Array.isArray(task.links) ? task.links.length : 0;
  const blockedOpen = task.blocker && task.blocker.status !== "done";

  const change = (next: TaskStatus) =>
    start(async () => {
      setStatus(next);
      const r = await setTaskStatus(task.id, next);
      if (r.ok) {
        toast.success(r.message ?? "עודכן");
        router.refresh();
      } else toast.error(r.error);
    });
  const toggle = () => change(done ? "todo" : "done");

  return (
    <li className={cn("group px-4 py-3 transition-colors hover:bg-sunken/40", pending && "opacity-70")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `פתיחה מחדש: ${task.title}` : `סימון כהושלם: ${task.title}`}
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
            done ? "border-ok bg-ok text-white" : "border-line-strong bg-surface hover:border-accent",
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={cn("text-start text-sm hover:text-accent", done ? "text-ink-3 line-through" : "text-ink")}
            >
              {task.title}
            </button>
            {!done && status !== "todo" && (
              <Badge tone={taskStatus.tone(status)} className="h-5">
                {taskStatus.label(status)}
              </Badge>
            )}
            {!done && (task.priority === "high" || task.priority === "urgent") && (
              <Badge tone={taskPriority.tone(task.priority)} className="h-5">
                {taskPriority.label(task.priority)}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
            {done && task.completed_at ? (
              <span>הושלם {formatDay(task.completed_at)}</span>
            ) : (
              task.due_date && <span className={cn(overdue && "font-medium text-danger", due === 0 && "font-medium text-warn")}>{overdue ? `באיחור · ${relativeDue(task.due_date)}` : relativeDue(task.due_date)}</span>
            )}
            {task.assignee && (
              <span className="inline-flex items-center gap-1" title={`אחראי: ${task.assignee.full_name || task.assignee.email}`}>
                <span className="grid size-4 place-items-center rounded-full bg-sunken text-[9px] font-semibold text-ink-2" aria-hidden>
                  {initialsOf(task.assignee.full_name || task.assignee.email)}
                </span>
                {(task.assignee.full_name || task.assignee.email).split(" ")[0]}
                {task.secondary && <span className="text-ink-3">+ {(task.secondary.full_name || task.secondary.email).split(" ")[0]}</span>}
              </span>
            )}
            {!task.assignee && task.secondary && <span>{(task.secondary.full_name || task.secondary.email).split(" ")[0]} (משני)</span>}
            {!task.assignee && !task.secondary && !done && <span className="text-warn">ללא אחראי</span>}
            {task.checklist.length > 0 && (
              <span className={cn("inline-flex items-center gap-1 num", checklistDone === task.checklist.length && "text-ok")}>
                <ListTodo className="size-3.5" aria-hidden />
                {checklistDone}/{task.checklist.length}
              </span>
            )}
            {links + task.task_files.length > 0 && (
              <span className="inline-flex items-center gap-1 num">
                <Link2 className="size-3.5" aria-hidden />
                {links + task.task_files.length}
              </span>
            )}
            {blockedOpen && !done && (
              <span className="inline-flex items-center gap-1 text-warn">
                <Lock className="size-3.5" aria-hidden />
                מחכה ל: {task.blocker!.title}
              </span>
            )}
            {showContext && task.projects && (
              <Link href={`/projects/${task.projects.id}`} className="hover:text-accent">
                {task.projects.name}
              </Link>
            )}
            {showContext && !task.projects && task.clients && (
              <Link href={`/clients/${task.clients.id}`} className="hover:text-accent">
                {task.clients.name}
              </Link>
            )}
          </div>
          {task.description && !done && !expanded && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{task.description}</p>}
          {expanded && <TaskDetails task={task} />}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? `סגירת פרטים: ${task.title}` : `פרטים: ${task.title}`}
          aria-expanded={expanded}
          className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
        </button>
        <Menu
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`פעולות: ${task.title}`} className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:data-[state=open]:opacity-100">
              <MoreHorizontal />
            </Button>
          }
        >
          <MenuItem onSelect={() => setEditing(true)}>
            <Pencil /> עריכה
          </MenuItem>
          <MenuItem onSelect={toggle}>
            {done ? <><RotateCcw /> פתיחה מחדש</> : <><Check /> סימון כהושלם</>}
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>סטטוס</MenuLabel>
          {taskStatus.list
            .filter((o) => o.value !== "done")
            .map((o) => (
              <MenuItem key={o.value} disabled={o.value === status} onSelect={() => change(o.value)}>
                <span className="w-4" aria-hidden>{o.value === status ? "✓" : ""}</span>
                {o.label}
              </MenuItem>
            ))}
          <MenuSeparator />
          <MenuItem destructive onSelect={() => setDeleting(true)}>
            <Trash2 /> מחיקה
          </MenuItem>
        </Menu>
      </div>
      <TaskFormModal task={task} open={editing} onOpenChange={setEditing} />
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="מחיקת משימה"
        description={<>המשימה &quot;{task.title}&quot; תימחק לצמיתות, כולל תתי-המשימות שלה.</>}
        confirmLabel="מחיקה"
        action={() => deleteTask(task.id)}
        onDone={() => router.refresh()}
      />
    </li>
  );
}

export function TaskList({ tasks, showContext = false, className }: { tasks: TaskRow[]; showContext?: boolean; className?: string }) {
  return (
    <ul className={cn("divide-y divide-line", className)}>
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} showContext={showContext} />
      ))}
    </ul>
  );
}
