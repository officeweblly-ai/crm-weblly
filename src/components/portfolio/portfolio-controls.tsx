"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Field, FormGrid, Input, LtrInput, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { FileUploader } from "@/components/files/file-uploader";
import { addProjectToPortfolio, deletePortfolioItem, movePortfolioItem, setPortfolioMedia, updatePortfolioItem } from "@/lib/actions/portfolio";
import { portfolioMediaKind, portfolioStatus, type PortfolioMediaKind } from "@/lib/domain/labels";
import { useFormAction } from "@/lib/use-form-action";
import { ACCEPT_IMAGES } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/database.types";

/** Picks an existing project; its details pre-fill the new portfolio item. */
export function AddFromProject({ projects, defaultOpen }: { projects: { value: string; label: string }[]; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [projectId, setProjectId] = useState("");
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await addProjectToPortfolio(projectId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "נוסף");
      setOpen(false);
      router.push(`/portfolio/${r.data.id}`);
    });
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="sm"
      trigger={<Button><Plus aria-hidden />הוספה מפרויקט</Button>}
      title="הוספה לתיק העבודות"
      description="שם, סוג, תיאור, טכנולוגיות וקישור לאתר יילקחו מהפרויקט — משלימים רק תמונות."
      footer={
        <>
          <Button onClick={submit} loading={pending} disabled={!projectId}>הוספה</Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>ביטול</Button>
        </>
      }
    >
      {projects.length ? (
        <Field label="פרויקט">
          {(p) => (
            <Select {...p} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">בחירת פרויקט…</option>
              {projects.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <p className="text-sm text-ink-3">כל הפרויקטים כבר נמצאים בתיק העבודות.</p>
      )}
    </Modal>
  );
}

export function OrderButtons({ id, first, last, title }: { id: string; first: boolean; last: boolean; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const move = (d: "up" | "down") =>
    start(async () => {
      const r = await movePortfolioItem(id, d);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  return (
    <div className="flex">
      <Button variant="ghost" size="icon-sm" disabled={first || pending} onClick={() => move("up")} aria-label={`להקדים: ${title}`}>
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={last || pending} onClick={() => move("down")} aria-label={`לאחר: ${title}`}>
        <ArrowDown />
      </Button>
    </div>
  );
}

export function PortfolioForm({ item }: { item: Tables<"portfolio_items"> }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const { pending, errors, onSubmit } = useFormAction(updatePortfolioItem.bind(null, item.id), { onSuccess: () => router.refresh() });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormGrid>
        <Field label="שם הפרויקט" required error={errors.title}>
          {(p) => <Input {...p} name="title" defaultValue={item.title} />}
        </Field>
        <Field label="קטגוריה" error={errors.category}>
          {(p) => <Input {...p} name="category" defaultValue={item.category ?? ""} placeholder="אתר תדמית, חנות, מערכת…" />}
        </Field>
      </FormGrid>
      <Field label="תיאור קצר" error={errors.summary}>
        {(p) => <Textarea {...p} name="summary" defaultValue={item.summary ?? ""} rows={3} />}
      </Field>
      <Field label="מה בוצע" error={errors.work_done}>
        {(p) => <Textarea {...p} name="work_done" defaultValue={item.work_done ?? ""} rows={3} placeholder="אפיון, עיצוב UI/UX, פיתוח, SEO, אנימציות…" />}
      </Field>
      <FormGrid>
        <Field label="טכנולוגיות" error={errors.technologies} hint="מופרדות בפסיקים">
          {(p) => <Input {...p} name="technologies" dir="ltr" className="text-right" defaultValue={item.technologies.join(", ")} placeholder="Next.js, Tailwind" />}
        </Field>
        <Field label="קישור לאתר" error={errors.site_url}>
          {(p) => <LtrInput {...p} name="site_url" type="url" inputMode="url" defaultValue={item.site_url ?? ""} placeholder="https://" />}
        </Field>
        <Field label="סטטוס" error={errors.status}>
          {(p) => (
            <Select {...p} name="status" defaultValue={item.status}>
              {portfolioStatus.list.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
      </FormGrid>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button type="submit" loading={pending} className="sm:min-w-28">שמירה</Button>
        <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden />
          הסרה מתיק העבודות
        </Button>
      </div>
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="הסרה מתיק העבודות"
        description="הפריט יוסר. הפרויקט והקבצים שלו לא יימחקו."
        confirmLabel="הסרה"
        action={() => deletePortfolioItem(item.id)}
        onDone={() => router.push("/portfolio")}
      />
    </form>
  );
}

type Img = Tables<"files"> & { thumbUrl: string | null; portfolioKind: string | null };

/** Choose which project images appear, and as what (cover, desktop, mobile, before/after). */
export function MediaPicker({ itemId, projectId, clientId, images }: { itemId: string; projectId: string | null; clientId: string | null; images: Img[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (fileId: string, kind: PortfolioMediaKind | null) =>
    start(async () => {
      const r = await setPortfolioMedia({ item_id: itemId, file_id: fileId, kind });
      if (r.ok) {
        if (r.message) toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      {projectId && (
        <FileUploader projectId={projectId} clientId={clientId} category="deliverables" accept={ACCEPT_IMAGES} compact hint='צילומי מסך של האתר — נשמרים בקבצי הפרויקט תחת "תוצרים"' />
      )}
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((f) => (
            <li key={f.id} className={cn("overflow-hidden rounded-lg border bg-surface shadow-1", f.portfolioKind ? "border-accent/50 ring-2 ring-accent/15" : "border-line")}>
              <div className="aspect-[4/3] bg-sunken">
                {f.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                  <img src={f.thumbUrl} alt={f.original_name} loading="lazy" className="size-full object-cover" />
                )}
              </div>
              <div className="p-2">
                <label className="sr-only" htmlFor={`kind-${f.id}`}>שימוש בתיק העבודות: {f.original_name}</label>
                <select
                  id={`kind-${f.id}`}
                  disabled={pending}
                  value={f.portfolioKind ?? ""}
                  onChange={(e) => set(f.id, (e.target.value || null) as PortfolioMediaKind | null)}
                  className="h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink-2 focus:border-accent focus:outline-none"
                >
                  <option value="">לא בשימוש</option>
                  {portfolioMediaKind.list.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">{projectId ? "אין עדיין תמונות בפרויקט. העלו צילומי מסך למעלה." : "הפריט לא מקושר לפרויקט (הפרויקט נמחק), ולכן אין תמונות לבחירה."}</p>
      )}
    </div>
  );
}
