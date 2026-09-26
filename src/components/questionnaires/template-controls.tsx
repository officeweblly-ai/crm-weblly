"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Copy, Eye, Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { createTemplate, deleteTemplate, duplicateTemplate, setTemplateArchived, setTemplatePublicLink, updateTemplate } from "@/lib/actions/questionnaires";
import { projectType } from "@/lib/domain/labels";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import type { Tables } from "@/lib/supabase/database.types";

export function TemplateFormModal({ template, trigger, open: openProp, onOpenChange }: OpenProps & { template?: Tables<"form_templates">; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const action = template ? updateTemplate.bind(null, template.id) : createTemplate;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: ({ id }) => {
      setOpen(false);
      if (!template) router.push(`/questionnaires/templates/${id}`);
      else router.refresh();
    },
  });
  const formId = template ? `tpl-${template.id}` : "tpl-new";
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      size="sm"
      title={template ? "פרטי התבנית" : "תבנית שאלון חדשה"}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending}>{template ? "שמירה" : "יצירה ומעבר לבנייה"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="שם התבנית" required error={errors.name}>
          {(p) => <Input {...p} name="name" defaultValue={template?.name} placeholder="לדוגמה: אתר תדמית" autoFocus />}
        </Field>
        <Field label="מתאים לסוג פרויקט" error={errors.project_type}>
          {(p) => (
            <Select {...p} name="project_type" defaultValue={template?.project_type ?? ""}>
              <option value="">כללי</option>
              {projectType.list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
        <Field label="תיאור פנימי" error={errors.description}>
          {(p) => <Textarea {...p} name="description" defaultValue={template?.description ?? ""} rows={2} />}
        </Field>
      </form>
    </Modal>
  );
}

export function TemplateMenu({ template, withEdit = true }: { template: Tables<"form_templates">; withEdit?: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const dup = async () => {
    const r = await duplicateTemplate(template.id);
    if (r.ok) {
      toast.success(r.message ?? "שוכפל");
      router.push(`/questionnaires/templates/${r.data.id}`);
    } else toast.error(r.error);
  };
  const archive = async () => {
    const r = await setTemplateArchived(template.id, !template.is_archived);
    if (r.ok) {
      toast.success(r.message ?? "עודכן");
      router.refresh();
    } else toast.error(r.error);
  };
  return (
    <>
      <Menu trigger={<Button variant="ghost" size="icon-sm" aria-label={`פעולות: ${template.name}`}><MoreHorizontal /></Button>}>
        {withEdit && <MenuItem onSelect={() => router.push(`/questionnaires/templates/${template.id}`)}><Pencil /> עריכת שאלות</MenuItem>}
        <MenuItem onSelect={() => setDialog("edit")}><Pencil /> שם ותיאור</MenuItem>
        <MenuItem onSelect={() => router.push(`/questionnaires/templates/${template.id}/preview`)}><Eye /> תצוגה מקדימה</MenuItem>
        <MenuItem onSelect={dup}><Copy /> שכפול</MenuItem>
        <MenuItem onSelect={archive}>{template.is_archived ? <><ArchiveRestore /> החזרה לשימוש</> : <><Archive /> העברה לארכיון</>}</MenuItem>
        <MenuSeparator />
        <MenuItem destructive onSelect={() => setDialog("delete")}><Trash2 /> מחיקה</MenuItem>
      </Menu>
      <TemplateFormModal template={template} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} />
      <Confirm
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="מחיקת תבנית"
        description={<>התבנית &quot;{template.name}&quot; וכל השאלות שבה יימחקו. שאלונים שכבר נשלחו ממנה — כולל התשובות — נשמרים כמו שהם.</>}
        confirmLabel="מחיקת התבנית"
        action={() => deleteTemplate(template.id)}
        onDone={() => router.push("/questionnaires?tab=templates")}
      />
    </>
  );
}

/** One shareable link per template — every person who opens it gets their own private copy. */
export function PublicLinkButton({ templateId, token, size = "md" }: { templateId: string; token: string | null; size?: "sm" | "md" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/q/${token}` : null;

  const toggle = async (enabled: boolean) => {
    setPending(true);
    const r = await setTemplatePublicLink(templateId, enabled);
    setPending(false);
    if (r.ok) {
      toast.success(r.message ?? "עודכן");
      router.refresh();
    } else toast.error(r.error);
  };

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="sm"
      trigger={
        <Button variant="secondary" size={size}>
          <Link2 aria-hidden /> קישור כללי {token ? <span className="size-1.5 rounded-full bg-ok" aria-label="פעיל" /> : null}
        </Button>
      }
      title="קישור כללי לשאלון"
      description="קישור אחד שאפשר לפרסם — באתר, בביו, בוואטסאפ. כל מי שממלא אותו מקבל עותק אישי, ובסיום נפתחים לו אוטומטית תיק לקוח ופרויקט עם האפיון."
    >
      {token && url ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-md border border-line bg-sunken/60 p-2">
            <code dir="ltr" className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-ink-2">{url}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("הקישור הועתק");
                } catch {
                  toast.error("הדפדפן חסם את ההעתקה — סמן והעתק ידנית.");
                }
              }}
            >
              <Copy aria-hidden /> העתקה
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <a href={`https://wa.me/?text=${encodeURIComponent(`שאלון אפיון לאתר שלכם — ממלאים בקצב שלכם, התשובות נשמרות:\n${url}`)}`} target="_blank" rel="noopener noreferrer">
                שיתוף בוואטסאפ
              </a>
            </Button>
            <Button asChild variant="ghost">
              <a href={url} target="_blank" rel="noopener noreferrer">פתיחה</a>
            </Button>
          </div>
          <div className="border-t border-line pt-3">
            <Button variant="danger-ghost" size="sm" loading={pending} onClick={() => toggle(false)}>
              ביטול הקישור
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">אין קישור כללי פעיל לתבנית הזו.</p>
          <Button className="self-start" loading={pending} onClick={() => toggle(true)}>
            <Link2 aria-hidden /> יצירת קישור כללי
          </Button>
        </div>
      )}
    </Modal>
  );
}
