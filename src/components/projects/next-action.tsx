"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { updateNextAction } from "@/lib/actions/crm";

/** The single most important line on a project: what happens next. Editable in place. */
export function NextAction({ projectId, value }: { projectId: string; value: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await updateNextAction(projectId, draft);
      if (r.ok) {
        toast.success(r.message ?? "נשמר");
        setEditing(false);
        router.refresh();
      } else toast.error(r.error);
    });

  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus aria-label="הפעולה הבאה" placeholder="לדוגמה: לשלוח סקיצה ראשונה" maxLength={300} />
        <div className="flex gap-2">
          <Button type="submit" loading={pending}>שמירה</Button>
          <Button variant="secondary" onClick={() => { setEditing(false); setDraft(value ?? ""); }}>ביטול</Button>
        </div>
      </form>
    );

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex w-full items-center gap-3 rounded-lg border border-accent/20 bg-accent-soft/60 px-3.5 py-3 text-start transition-colors hover:border-accent/40"
    >
      <ArrowLeft className="size-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-accent-ink">הפעולה הבאה</span>
        <span className={value ? "block text-sm font-medium text-ink" : "block text-sm text-ink-3"}>{value || "לא הוגדרה — לחץ כדי להוסיף"}</span>
      </span>
      <Pencil className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </button>
  );
}
