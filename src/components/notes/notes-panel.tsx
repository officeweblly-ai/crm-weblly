"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pin, PinOff, Trash2, Pencil, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { createNote, deleteNote, updateNote } from "@/lib/actions/crm";
import { formatDateTime } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type NoteRow = {
  id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  projects: { id: string; name: string } | null;
  profiles: { full_name: string; email: string } | null;
};

function NoteItem({ note }: { note: NoteRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [deleting, setDeleting] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => ReturnType<typeof updateNote>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "עודכן");
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <li className={cn("rounded-lg border bg-surface p-4", note.is_pinned ? "border-warn/30 bg-warn-soft/40" : "border-line")}>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} aria-label="עריכת הערה" autoFocus />
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={() => run(() => updateNote(note.id, { body: draft }), () => setEditing(false))}>
              שמירה
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setDraft(note.body); }}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{note.body}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-xs text-ink-3">
          {note.profiles?.full_name || note.profiles?.email || "—"} · {formatDateTime(note.created_at)}
          {note.projects && <> · {note.projects.name}</>}
        </div>
        <div className="flex">
          <Button variant="ghost" size="icon-sm" aria-label={note.is_pinned ? "ביטול הצמדה" : "הצמדה"} onClick={() => run(() => updateNote(note.id, { is_pinned: !note.is_pinned }))}>
            {note.is_pinned ? <PinOff /> : <Pin />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="עריכה" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="מחיקה" onClick={() => setDeleting(true)}>
            <Trash2 className="text-danger" />
          </Button>
        </div>
      </div>
      <Confirm open={deleting} onOpenChange={setDeleting} title="מחיקת הערה" description="ההערה תימחק לצמיתות." confirmLabel="מחיקה" action={() => deleteNote(note.id)} onDone={() => router.refresh()} />
    </li>
  );
}

export function NotesPanel({ clientId, projectId, notes }: { clientId: string; projectId?: string; notes: NoteRow[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, errors, onSubmit } = useFormAction(createNote, {
    onSuccess: () => {
      formRef.current?.reset();
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} onSubmit={onSubmit} className="rounded-lg border border-line bg-surface p-3 shadow-1">
        <input type="hidden" name="client_id" value={clientId} />
        {projectId && <input type="hidden" name="project_id" value={projectId} />}
        <label htmlFor={`note-${projectId ?? clientId}`} className="sr-only">הערה חדשה</label>
        <Textarea
          id={`note-${projectId ?? clientId}`}
          name="body"
          rows={3}
          placeholder="הערה פנימית — שיחה, החלטה, משהו לזכור…"
          className="border-0 shadow-none focus:ring-0"
          aria-invalid={errors.body ? true : undefined}
        />
        <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
          <span className="text-xs text-ink-3">{errors.body ?? "גלוי רק לצוות. לא מופיע בשום עמוד ציבורי."}</span>
          <Button type="submit" size="sm" loading={pending}>
            הוספת הערה
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <EmptyState compact icon={StickyNote} title="אין הערות עדיין" description="כל מה שסוכם בטלפון או בפגישה — כדאי לתעד כאן." />
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            <NoteItem key={n.id} note={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
