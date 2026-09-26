"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { StatusSelect } from "@/components/ui/status-select";
import { createAlbum, deleteAlbum, setAlbumStatus, updateAlbum } from "@/lib/actions/social";
import { socialAlbumStatus, type SocialAlbumStatus } from "@/lib/domain/labels";
import { useFormAction } from "@/lib/use-form-action";
import { useOpenState, type OpenProps } from "@/lib/use-open";
import type { Tables } from "@/lib/supabase/database.types";

type Opt = { value: string; label: string; clientId?: string };

export function AlbumFormModal({
  album,
  clients,
  projects,
  trigger,
  defaultOpen,
  open: openProp,
  onOpenChange,
}: OpenProps & { album?: Tables<"social_albums">; clients: Opt[]; projects: Opt[]; trigger?: ReactNode; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useOpenState({ open: openProp, onOpenChange, defaultOpen });
  const [client, setClient] = useState(album?.client_id ?? "");
  const [title, setTitle] = useState(album?.title ?? "");
  const [titleTouched, setTitleTouched] = useState(Boolean(album));
  const action = album ? updateAlbum.bind(null, album.id) : createAlbum;
  const { pending, errors, onSubmit } = useFormAction(action, {
    onSuccess: ({ id }) => {
      setOpen(false);
      if (!album) router.push(`/social/${id}`);
      else router.refresh();
    },
  });
  const clientProjects = projects.filter((p) => !client || p.clientId === client);
  const formId = album ? `album-${album.id}` : "album-new";

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={album ? "עריכת תיקייה" : "תיקיית סושיאל חדשה"}
      description={album ? undefined : "תיקייה לכל עבודה — כאן אוספים צילומים וסרטונים מתהליך הבנייה, ומכאן יוצאים הסרטונים."}
      footer={
        <>
          <Button type="submit" form={formId} loading={pending}>{album ? "שמירה" : "יצירת תיקייה"}</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormGrid>
          <Field label="לקוח" hint="לא חובה — אפשר גם תיקייה כללית">
            {(p) => (
              <Select
                {...p}
                name="client_id"
                value={client}
                onChange={(e) => {
                  setClient(e.target.value);
                  const name = clients.find((c) => c.value === e.target.value)?.label.split(" · ")[0];
                  if (!titleTouched && name) setTitle(`בניית אתר ללקוח ${name}`);
                }}
              >
                <option value="">ללא לקוח</option>
                {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="פרויקט">
            {(p) => (
              <Select {...p} name="project_id" defaultValue={album?.project_id ?? ""}>
                <option value="">—</option>
                {clientProjects.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        </FormGrid>
        <Field label="שם התיקייה" required error={errors.title} hint="לדוגמה: בניית מערכת CRM ללקוח ינאי מזרחי">
          {(p) => <Input {...p} name="title" value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />}
        </Field>
        <Field label="רעיון לסרטון / תיאור" error={errors.description}>
          {(p) => <Textarea {...p} name="description" rows={2} defaultValue={album?.description ?? ""} placeholder="מה הסיפור? מה רוצים שהצופה יבין?" />}
        </Field>
        <Field label="הערות לעריכה" error={errors.notes} hint="מה חשוב להראות, טקסטים על המסך, מוזיקה…">
          {(p) => <Textarea {...p} name="notes" rows={2} defaultValue={album?.notes ?? ""} />}
        </Field>
      </form>
    </Modal>
  );
}

export function AlbumStatusControl({ id, status }: { id: string; status: SocialAlbumStatus }) {
  return <StatusSelect label="סטטוס התיקייה" value={status} options={socialAlbumStatus.list} toneOf={socialAlbumStatus.tone} onChange={(v) => setAlbumStatus(id, v)} />;
}

export function AlbumMenu({ album, clients, projects }: { album: Tables<"social_albums">; clients: Opt[]; projects: Opt[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  return (
    <>
      <Button variant="secondary" onClick={() => setDialog("edit")}><Pencil aria-hidden /> עריכה</Button>
      <Menu trigger={<Button variant="secondary" size="icon" aria-label="פעולות נוספות"><MoreHorizontal /></Button>}>
        <MenuItem destructive onSelect={() => setDialog("delete")}><Trash2 /> מחיקת התיקייה</MenuItem>
      </Menu>
      <AlbumFormModal album={album} clients={clients} projects={projects} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} />
      <Confirm
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="מחיקת תיקייה"
        description={<>התיקייה &quot;{album.title}&quot; וכל התמונות והסרטונים שבה יימחקו לצמיתות.</>}
        confirmLabel="מחיקה"
        action={() => deleteAlbum(album.id)}
        onDone={() => router.push("/social")}
      />
    </>
  );
}
