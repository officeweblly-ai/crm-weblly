"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { deleteEvent, saveEvent } from "@/lib/actions/operations";
import { EVENT_KINDS } from "@/lib/domain/calendar";
import { useFormAction } from "@/lib/use-form-action";

export type Opt = { value: string; label: string; clientId?: string };
export type EventOptions = { staff: Opt[]; clients: Opt[]; projects: Opt[]; me: string };

export type EventDraft = {
  id?: string;
  title?: string;
  kind?: string;
  starts_on?: string;
  ends_on?: string | null;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
  assigned_to?: string | null;
  client_id?: string | null;
  project_id?: string | null;
  description?: string | null;
  reminder_minutes?: number | null;
};

const REMINDERS = [
  { value: "", label: "ללא תזכורת" },
  { value: "0", label: "בזמן האירוע" },
  { value: "15", label: "15 דקות לפני" },
  { value: "60", label: "שעה לפני" },
  { value: "1440", label: "יום לפני" },
];

const plusHour = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * Create / edit a calendar event. Title, type and when are up front; the
 * people and context fields follow. Picking a project fills its client.
 */
export function EventFormModal({ open, onOpenChange, draft, options }: { open: boolean; onOpenChange: (o: boolean) => void; draft: EventDraft; options: EventOptions }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={draft.id ? "עריכת אירוע" : "אירוע חדש"} size="md" footer={null}>
      {open && <EventForm key={draft.id ?? `${draft.starts_on}-${draft.start_time}`} draft={draft} options={options} done={() => onOpenChange(false)} />}
    </Modal>
  );
}

function EventForm({ draft, options, done }: { draft: EventDraft; options: EventOptions; done: () => void }) {
  const router = useRouter();
  const [allDay, setAllDay] = useState(draft.all_day ?? !draft.start_time);
  const [start, setStart] = useState(draft.start_time?.slice(0, 5) ?? "10:00");
  const [end, setEnd] = useState(draft.end_time?.slice(0, 5) ?? plusHour(draft.start_time?.slice(0, 5) ?? "10:00"));
  const [project, setProject] = useState(draft.project_id ?? "");
  const [client, setClient] = useState(draft.client_id ?? "");
  const [deleting, startDelete] = useTransition();
  const { pending, errors, onSubmit } = useFormAction(saveEvent.bind(null, draft.id ?? null), {
    onSuccess: () => {
      done();
      router.refresh();
    },
  });
  const projectClient = options.projects.find((p) => p.value === project)?.clientId;
  const projects = client ? options.projects.filter((p) => p.clientId === client) : options.projects;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="כותרת" required error={errors.title}>
        {(p) => <Input {...p} name="title" defaultValue={draft.title} autoFocus placeholder="למשל: פגישת אפיון עם הלקוח" />}
      </Field>
      <FormGrid>
        <Field label="סוג" error={errors.kind}>
          {(p) => (
            <Select {...p} name="kind" defaultValue={draft.kind ?? "meeting"}>
              {EVENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="תאריך" required error={errors.starts_on}>
          {(p) => <Input {...p} name="starts_on" type="date" defaultValue={draft.starts_on} />}
        </Field>
      </FormGrid>
      <Checkbox label="כל היום" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
      {allDay ? (
        <Field label="עד תאריך" hint="לא חובה — לאירוע של כמה ימים" error={errors.ends_on}>
          {(p) => <Input {...p} name="ends_on" type="date" defaultValue={draft.ends_on ?? ""} />}
        </Field>
      ) : (
        <FormGrid className="grid-cols-2">
          <Field label="משעה" error={errors.start_time}>
            {(p) => (
              <Input
                {...p}
                name="start_time"
                type="time"
                value={start}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && end <= start) setEnd(plusHour(v));
                  else if (v && end <= v) setEnd(plusHour(v));
                  setStart(v);
                }}
              />
            )}
          </Field>
          <Field label="עד שעה" error={errors.end_time}>
            {(p) => <Input {...p} name="end_time" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        </FormGrid>
      )}
      <FormGrid>
        <Field label="אחראי" error={errors.assigned_to}>
          {(p) => (
            <Select {...p} name="assigned_to" defaultValue={draft.id ? (draft.assigned_to ?? "") : (draft.assigned_to ?? options.me)}>
              <option value="">כל הצוות</option>
              {options.staff.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="תזכורת" error={errors.reminder_minutes}>
          {(p) => (
            <Select {...p} name="reminder_minutes" defaultValue={draft.reminder_minutes == null ? "" : String(draft.reminder_minutes)}>
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="לקוח" error={errors.client_id}>
          {(p) => (
            <Select
              {...p}
              name="client_id"
              value={projectClient ?? client}
              disabled={Boolean(projectClient)}
              onChange={(e) => {
                setClient(e.target.value);
                if (project && options.projects.find((x) => x.value === project)?.clientId !== e.target.value) setProject("");
              }}
            >
              <option value="">ללא לקוח</option>
              {options.clients.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="פרויקט" error={errors.project_id}>
          {(p) => (
            <Select {...p} name="project_id" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">ללא פרויקט</option>
              {projects.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
      </FormGrid>
      {projectClient && <input type="hidden" name="client_id" value={projectClient} />}
      <Field label="תיאור" error={errors.description}>
        {(p) => <Textarea {...p} name="description" rows={3} defaultValue={draft.description ?? ""} placeholder="נושאים, קישור לזום, כתובת…" />}
      </Field>
      <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center">
        <Button type="submit" loading={pending} className="sm:min-w-28">{draft.id ? "שמירה" : "הוספה ליומן"}</Button>
        <Button variant="secondary" onClick={done} disabled={pending}>ביטול</Button>
        {draft.id && (
          <Button
            variant="danger-ghost"
            className="sm:ms-auto"
            loading={deleting}
            onClick={() =>
              startDelete(async () => {
                const r = await deleteEvent(draft.id!);
                if (r.ok) {
                  toast.success(r.message);
                  done();
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            <Trash2 aria-hidden />
            מחיקה
          </Button>
        )}
      </div>
    </form>
  );
}
