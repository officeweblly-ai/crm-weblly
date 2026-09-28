"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, Check, Copy, ExternalLink, Eye, FileText, MessageCircle, Plus, RefreshCw, ShieldCheck, Stamp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Checkbox, Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cancelApproval, createApproval, setPresentationLink, updatePresentation } from "@/lib/actions/project-hub";
import { approvalKind, approvalStatus, type ApprovalKind, type ApprovalStatus } from "@/lib/domain/labels";
import { displayUrl, formatDay, whatsappLink } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/database.types";

type ProjectFileOpt = { id: string; original_name: string; mime_type: string; thumbUrl: string | null };

// ===========================================================================
// Client presentation link
// ===========================================================================
export function PresentationCard({
  project,
  siteUrl,
  clientPhone,
  sharedFiles,
  visibleLinks,
}: {
  project: Pick<Tables<"projects">, "id" | "name" | "portal_token" | "client_update" | "client_action">;
  siteUrl: string;
  clientPhone: string | null;
  sharedFiles: number;
  visibleLinks: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"regenerate" | "revoke" | null>(null);
  const url = project.portal_token ? `${siteUrl}/p/${project.portal_token}` : null;
  const { pending: saving, errors, onSubmit } = useFormAction(updatePresentation.bind(null, project.id), { onSuccess: () => router.refresh() });

  const create = () =>
    start(async () => {
      const r = await setPresentationLink(project.id, "create");
      if (r.ok) {
        toast.success(r.message ?? "נוצר");
        router.refresh();
      } else toast.error(r.error);
    });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("הקישור הועתק");
    } catch {
      toast.error("ההעתקה נכשלה — סמנו את הקישור והעתיקו ידנית");
    }
  };
  const wa = url ? whatsappLink(clientPhone, `היי! כאן אפשר לראות איפה עומד הפרויקט "${project.name}", לצפות בתוצרים ולאשר: ${url}`) : null;

  return (
    <Card id="presentation" className="scroll-mt-24">
      <CardHeader title="הצגה ללקוח" description="עמוד צפייה מאובטח — בלי הערות פנימיות, משימות או כספים." />
      <CardBody className="flex flex-col gap-4">
        {url ? (
          <>
            <div className="flex items-center gap-2 rounded-md border border-line bg-sunken/60 px-3 py-2">
              <ShieldCheck className="size-4 shrink-0 text-ok" aria-hidden />
              <bdi dir="ltr" className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2">{displayUrl(url)}</bdi>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={copy}><Copy aria-hidden />העתקה</Button>
              {wa && (
                <Button asChild size="sm" variant="secondary">
                  <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />וואטסאפ</a>
                </Button>
              )}
              <Button asChild size="sm" variant="secondary">
                <a href={url} target="_blank" rel="noopener noreferrer"><Eye aria-hidden />תצוגה</a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm("regenerate")}><RefreshCw aria-hidden />קישור חדש</Button>
              <Button size="sm" variant="danger-ghost" onClick={() => setConfirm("revoke")}><Ban aria-hidden />ביטול</Button>
            </div>
            <p className="text-xs text-ink-3">
              מוצגים ללקוח: {sharedFiles} קבצים ששיתפתם, {visibleLinks} קישורי צפייה ובקשות האישור. קובץ משתפים מהתפריט שלו (⋯ ← &quot;הצגה ללקוח&quot;).
            </p>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink-2">הלקוח יראה את שם הפרויקט, השלב, עדכון קצר, מה נדרש ממנו, תוצרים ששיתפתם ובקשות אישור — ויוכל לאשר או לבקש שינוי.</p>
            <Button size="sm" onClick={create} loading={pending}><Plus aria-hidden />יצירת קישור צפייה</Button>
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-line pt-4" noValidate>
          <Field label="עדכון קצר ללקוח" error={errors.client_update}>
            {(p) => <Textarea {...p} name="client_update" rows={2} defaultValue={project.client_update ?? ""} placeholder="לדוגמה: סיימנו את עיצוב הדסקטופ ועוברים למובייל." />}
          </Field>
          <Field label="מה נדרש מהלקוח כרגע" error={errors.client_action}>
            {(p) => <Textarea {...p} name="client_action" rows={2} defaultValue={project.client_action ?? ""} placeholder="לדוגמה: לשלוח תמונות של הצוות וטקסט לעמוד אודות." />}
          </Field>
          <div>
            <Button type="submit" size="sm" variant="secondary" loading={saving}>שמירה</Button>
          </div>
        </form>
      </CardBody>
      <Confirm
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "revoke" ? "ביטול קישור הצפייה" : "יצירת קישור חדש"}
        description={confirm === "revoke" ? "הקישור יפסיק לעבוד מיד. אפשר ליצור קישור חדש בכל רגע." : "הקישור הנוכחי יפסיק לעבוד, ותצטרכו לשלוח ללקוח את הקישור החדש."}
        confirmLabel={confirm === "revoke" ? "ביטול הקישור" : "יצירת קישור חדש"}
        action={() => setPresentationLink(project.id, confirm ?? "revoke")}
        onDone={() => router.refresh()}
      />
    </Card>
  );
}

// ===========================================================================
// Approvals
// ===========================================================================
function ApprovalFormModal({
  projectId,
  files,
  hasLink,
  trigger,
  open: openProp,
  onOpenChange,
}: OpenProps & { projectId: string; files: ProjectFileOpt[]; hasLink: boolean; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const { pending, errors, formError, onSubmit } = useFormAction(createApproval, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = `approval-new-${projectId}`;
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="בקשת אישור מהלקוח"
      description={hasLink ? "הבקשה תופיע ללקוח בקישור הצפייה, והוא יוכל לאשר או לבקש שינוי." : "שימו לב: עדיין אין קישור צפייה לפרויקט. צרו אותו באזור \"הצגה ללקוח\" כדי שהלקוח יראה את הבקשה."}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending}>יצירת הבקשה</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="project_id" value={projectId} />
        <FormGrid>
          <Field label="כותרת" required error={errors.title}>
            {(p) => <Input {...p} name="title" autoFocus placeholder="לדוגמה: עיצוב עמוד הבית — גרסה 1" />}
          </Field>
          <Field label="מה מאשרים" error={errors.kind}>
            {(p) => (
              <Select {...p} name="kind" defaultValue="design_desktop">
                {approvalKind.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="תיאור" error={errors.description}>
          {(p) => <Textarea {...p} name="description" rows={3} placeholder="מה חשוב לבדוק, מה השתנה מהגרסה הקודמת…" />}
        </Field>
        <Field label="קישור Preview" error={errors.preview_url} hint="Figma, Staging או כל קישור לצפייה">
          {(p) => <LtrInput {...p} name="preview_url" type="url" inputMode="url" placeholder="https://" />}
        </Field>
        {files.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink-2">קבצים לאישור</legend>
            <ul className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {files.map((f) => (
                <li key={f.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border border-line px-2 hover:bg-sunken has-[:checked]:border-accent/40 has-[:checked]:bg-accent-soft/50">
                    <input type="checkbox" name="file_ids[]" value={f.id} className="size-4 shrink-0 accent-(--accent)" />
                    {f.thumbUrl && f.mime_type.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                      <img src={f.thumbUrl} alt="" className="size-8 shrink-0 rounded object-cover" />
                    ) : (
                      <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                    )}
                    <span className="min-w-0 truncate text-sm text-ink">{f.original_name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <Checkbox name="create_task_on_changes" defaultChecked label="אם הלקוח מבקש שינוי — לפתוח משימה בפרויקט אוטומטית" />
        {formError && errors.preview_url && <p className="text-xs text-danger">{formError}</p>}
      </form>
    </Modal>
  );
}

type ApprovalRow = Tables<"project_approvals"> & { approval_feedback: Pick<Tables<"approval_feedback">, "decision" | "comment" | "author_name" | "created_at">[] };

function ApprovalItem({ approval }: { approval: ApprovalRow }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const st = approval.status as ApprovalStatus;
  const feedback = [...approval.approval_feedback].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = feedback[feedback.length - 1];
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{approval.title}</p>
          <p className="text-xs text-ink-3">
            {approvalKind.label(approval.kind as ApprovalKind)} · נשלח {formatDay(approval.created_at)}
            {approval.responded_at && ` · נענה ${formatDay(approval.responded_at)}`}
          </p>
        </div>
        <Badge tone={approvalStatus.tone(st)}>{approvalStatus.label(st)}</Badge>
      </div>
      {last?.comment && (
        <blockquote className={cn("mt-2 rounded-md border px-3 py-2 text-sm text-ink-2", st === "changes_requested" ? "border-danger/20 bg-danger-soft/50" : "border-line bg-sunken/50")}>
          <p className="whitespace-pre-wrap">{last.comment}</p>
          {last.author_name && <footer className="mt-1 text-xs text-ink-3">— {last.author_name}</footer>}
        </blockquote>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {approval.preview_url && (
          <a href={approval.preview_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            Preview <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        {approval.file_ids.length > 0 && <span className="text-ink-3">{approval.file_ids.length === 1 ? "קובץ אחד" : `${approval.file_ids.length} קבצים`}</span>}
        {approval.change_task_id && (
          <Link href="#tasks" className="inline-flex items-center gap-1 text-ink-2 hover:text-accent">
            <Check className="size-3" aria-hidden /> נפתחה משימה לשינויים
          </Link>
        )}
        {st === "pending" && (
          <button type="button" onClick={() => setCancelling(true)} className="text-ink-3 hover:text-danger">
            ביטול הבקשה
          </button>
        )}
      </div>
      <Confirm open={cancelling} onOpenChange={setCancelling} title="ביטול בקשת אישור" description="הבקשה תוסר מעמוד הלקוח." confirmLabel="ביטול הבקשה" action={() => cancelApproval(approval.id)} onDone={() => router.refresh()} />
    </li>
  );
}

export function ApprovalsCard({ projectId, approvals, files, hasLink }: { projectId: string; approvals: ApprovalRow[]; files: ProjectFileOpt[]; hasLink: boolean }) {
  const visible = approvals.filter((a) => a.status !== "cancelled");
  return (
    <Card id="approvals" className="scroll-mt-24">
      <CardHeader
        title="אישורים ושינויים"
        action={<ApprovalFormModal projectId={projectId} files={files} hasLink={hasLink} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />בקשת אישור</Button>} />}
      />
      {visible.length ? (
        <ul className="divide-y divide-line">
          {visible.map((a) => (
            <ApprovalItem key={a.id} approval={a} />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-3 px-5 py-4 text-sm text-ink-3">
          <Stamp className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>שולחים ללקוח Hero, עיצוב דסקטופ/מובייל או את האתר המלא — והוא מאשר או מבקש שינוי. הכול נרשם בהיסטוריה.</p>
        </div>
      )}
    </Card>
  );
}
