"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { TaskFormModal } from "./task-form";
import { deleteTask, setTaskStatus } from "@/lib/actions/crm";
import { taskPriority, type TaskStatus } from "@/lib/domain/labels";
import { daysUntil, formatDay, relativeDue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/lib/data/crm";

function TaskItem({ task, showContext }: { task: TaskRow; showContext: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useOptimistic<TaskStatus>(task.status);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const done = status === "done";
  const due = daysUntil(task.due_date);
  const overdue = !done && due !== null && due < 0;

  const toggle = () =>
    start(async () => {
      const next: TaskStatus = done ? "todo" : "done";
      setStatus(next);
      const r = await setTaskStatus(task.id, next);
      if (r.ok) {
        toast.success(r.message ?? "עודכן");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <li className={cn("group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-sunken/40", pending && "opacity-70")}>
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
          <span className={cn("text-sm", done ? "text-ink-3 line-through" : "text-ink")}>{task.title}</span>
          {!done && (task.priority === "high" || task.priority === "urgent") && (
            <Badge tone={taskPriority.tone(task.priority)} className="h-5">
              {taskPriority.label(task.priority)}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-3">
          {done && task.completed_at ? (
            <span>הושלם {formatDay(task.completed_at)}</span>
          ) : (
            task.due_date && <span className={cn(overdue && "font-medium text-danger", due === 0 && "font-medium text-warn")}>{overdue ? `באיחור · ${relativeDue(task.due_date)}` : relativeDue(task.due_date)}</span>
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
        {task.description && !done && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{task.description}</p>}
      </div>
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
        <MenuItem destructive onSelect={() => setDeleting(true)}>
          <Trash2 /> מחיקה
        </MenuItem>
      </Menu>
      <TaskFormModal task={task} open={editing} onOpenChange={setEditing} />
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="מחיקת משימה"
        description={<>המשימה &quot;{task.title}&quot; תימחק לצמיתות.</>}
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
