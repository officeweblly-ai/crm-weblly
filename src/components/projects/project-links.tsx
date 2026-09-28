"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Eye, Link2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Confirm } from "@/components/ui/confirm";
import { Checkbox, Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { createProjectLink, deleteProjectLink, updateProjectLink } from "@/lib/actions/project-hub";
import { CLIENT_SAFE_LINK_KINDS, projectLinkKind, type ProjectLinkKind } from "@/lib/domain/labels";
import { displayUrl } from "@/lib/format";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import type { Tables } from "@/lib/supabase/database.types";

type LinkRow = Tables<"project_links">;

function LinkFormModal({ projectId, link, trigger, open: openProp, onOpenChange }: OpenProps & { projectId: string; link?: LinkRow; trigger?: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange });
  const [kind, setKind] = useState<ProjectLinkKind>((link?.kind as ProjectLinkKind) ?? "production");
  const action = link ? updateProjectLink.bind(null, link.id) : createProjectLink;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const formId = link ? `link-${link.id}` : `link-new-${projectId}`;
  const canShow = CLIENT_SAFE_LINK_KINDS.includes(kind);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={link ? "עריכת קישור" : "קישור חדש"}
      size="sm"
      footer={
        <>
          <Button type="submit" form={formId} loading={pending}>{link ? "שמירה" : "הוספה"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="project_id" value={projectId} />
        <FormGrid>
          <Field label="סוג" error={errors.kind}>
            {(p) => (
              <Select {...p} name="kind" value={kind} onChange={(e) => setKind(e.target.value as ProjectLinkKind)}>
                {projectLinkKind.list.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="שם" error={errors.label} hint="לא חובה">
            {(p) => <Input {...p} name="label" defaultValue={link?.label ?? ""} placeholder={projectLinkKind.label(kind)} maxLength={120} />}
          </Field>
        </FormGrid>
        <Field label="כתובת (URL)" required error={errors.url}>
          {(p) => <LtrInput {...p} name="url" type="url" inputMode="url" defaultValue={link?.url ?? ""} placeholder="https://" autoFocus={!link} />}
        </Field>
        <Field label="הערה" error={errors.note}>
          {(p) => <Textarea {...p} name="note" defaultValue={link?.note ?? ""} rows={2} />}
        </Field>
        {canShow ? (
          <Checkbox name="client_visible" defaultChecked={link?.client_visible ?? false} label="להציג ללקוח בקישור הצפייה (למשל Preview של האתר)" />
        ) : (
          <p className="text-xs text-ink-3">קישורי ניהול (Supabase, Vercel, GitHub…) אף פעם לא מוצגים ללקוח.</p>
        )}
      </form>
    </Modal>
  );
}

function LinkItem({ link }: { link: LinkRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <li className="group flex items-center gap-2 px-4 py-2.5 sm:px-5">
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:text-accent">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <span className="truncate">{link.label || projectLinkKind.label(link.kind as ProjectLinkKind)}</span>
          {link.client_visible && <Eye className="size-3.5 shrink-0 text-accent" aria-label="מוצג ללקוח" />}
        </span>
        <bdi dir="ltr" className="block truncate text-right font-mono text-xs text-ink-3">{displayUrl(link.url)}</bdi>
        {link.note && <span className="block truncate text-xs text-ink-3">{link.note}</span>}
      </a>
      <Menu
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`פעולות: ${link.label || link.url}`} className="shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:data-[state=open]:opacity-100">
            <MoreHorizontal />
          </Button>
        }
      >
        <MenuItem onSelect={() => setEditing(true)}><Pencil /> עריכה</MenuItem>
        <MenuItem destructive onSelect={() => setDeleting(true)}><Trash2 /> מחיקה</MenuItem>
      </Menu>
      <LinkFormModal projectId={link.project_id} link={link} open={editing} onOpenChange={setEditing} />
      <Confirm open={deleting} onOpenChange={setDeleting} title="מחיקת קישור" description="הקישור יוסר מהפרויקט." confirmLabel="מחיקה" action={() => deleteProjectLink(link.id)} onDone={() => router.refresh()} />
    </li>
  );
}

/** All the URLs of a project in one place (GitHub, Production, Staging, Figma…). */
export function ProjectLinksCard({ projectId, links }: { projectId: string; links: LinkRow[] }) {
  return (
    <Card id="links" className="scroll-mt-24">
      <CardHeader
        title="קישורים"
        action={<LinkFormModal projectId={projectId} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />קישור</Button>} />}
      />
      {links.length ? (
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <LinkItem key={l.id} link={l} />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-3 px-5 py-4 text-sm text-ink-3">
          <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>GitHub, האתר החי, Staging, Figma, Vercel… כל הכתובות של הפרויקט במקום אחד.</p>
        </div>
      )}
    </Card>
  );
}
