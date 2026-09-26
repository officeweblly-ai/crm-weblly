"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, ExternalLink, FileText, MessageSquarePlus, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { saveAnswerNote } from "@/lib/actions/questionnaires";
import { getFileUrl } from "@/lib/actions/files";
import { displayUrl, formatBytes, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/database.types";
import type { AnswerFile } from "@/lib/data/crm";

type Answer = Tables<"form_answers">;
type Props = { sections: { title: string; answers: Answer[] }[]; files: Record<string, AnswerFile> };

function FileChip({ id, name, file }: { id: string; name: string; file?: AnswerFile }) {
  const [pending, start] = useTransition();
  const open = () =>
    start(async () => {
      const r = await getFileUrl(id, !file?.mime_type.startsWith("image/") && file?.mime_type !== "application/pdf");
      if (r.ok) window.open(r.data.url, "_blank", "noopener");
      else toast.error(r.error);
    });
  if (!file) return <span className="text-sm text-ink-3 line-through">{name} (נמחק)</span>;
  return (
    <button type="button" onClick={open} disabled={pending} className="group flex w-full max-w-60 items-center gap-2 overflow-hidden rounded-md border border-line bg-surface text-start hover:border-line-strong">
      {file.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed private URL
        <img src={file.thumbUrl} alt="" className="size-14 shrink-0 object-cover" />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center bg-sunken text-ink-3"><FileText className="size-5" aria-hidden /></span>
      )}
      <span className="min-w-0 flex-1 py-1 pe-2">
        <span className="block truncate text-sm text-ink">{name}</span>
        <span className="flex items-center gap-1 text-xs text-ink-3">
          {formatBytes(file.size_bytes)} <Download className="size-3 opacity-0 group-hover:opacity-100" aria-hidden />
        </span>
      </span>
    </button>
  );
}

function Value({ a, files }: { a: Answer; files: Props["files"] }) {
  const v = a.value;
  const empty = <span className="text-sm text-ink-3">לא נענה</span>;
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return empty;

  switch (a.question_type) {
    case "yes_no":
      return <span className="text-sm font-medium text-ink">{v === "yes" ? "כן" : "לא"}</span>;
    case "color":
      return (
        <span className="inline-flex items-center gap-2">
          <span className="size-6 rounded-md border border-line shadow-1" style={{ background: String(v) }} aria-hidden />
          <code dir="ltr" className="font-mono text-sm text-ink">{String(v)}</code>
        </span>
      );
    case "url":
      return (
        <a href={String(v)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-sm text-accent hover:underline">
          <bdi dir="ltr">{displayUrl(String(v))}</bdi>
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      );
    case "email":
      return <a href={`mailto:${v}`} className="font-mono text-sm text-ink hover:text-accent"><bdi dir="ltr">{String(v)}</bdi></a>;
    case "phone":
      return <a href={`tel:${String(v).replace(/[^\d+]/g, "")}`} className="font-mono text-sm text-ink hover:text-accent"><bdi dir="ltr">{String(v)}</bdi></a>;
    case "date":
      return <span className="text-sm text-ink">{formatDate(String(v))}</span>;
    case "number":
      return <span className="text-sm text-ink num">{formatNumber(Number(v))}</span>;
    case "multi_select":
    case "single_select": {
      const items = Array.isArray(v) ? v : [v];
      return (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((x) => (
            <li key={String(x)} className="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-sm text-ink">{String(x)}</li>
          ))}
        </ul>
      );
    }
    case "reference_links":
      return (
        <ul className="flex flex-col gap-1.5">
          {(v as { url: string; note?: string }[]).map((l) => (
            <li key={l.url} className="text-sm">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-accent hover:underline">
                <bdi dir="ltr">{displayUrl(l.url)}</bdi>
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
              {l.note && <span className="text-ink-2"> — {l.note}</span>}
            </li>
          ))}
        </ul>
      );
    case "image_upload":
    case "file_upload":
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(v as { file_id: string; name: string }[]).map((f) => (
            <FileChip key={f.file_id} id={f.file_id} name={f.name} file={files[f.file_id]} />
          ))}
        </div>
      );
    default:
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{String(v)}</p>;
  }
}

function AnswerNote({ a }: { a: Answer }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a.internal_note ?? "");
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await saveAnswerNote(a.id, draft);
      if (r.ok) {
        toast.success(r.message ?? "נשמר");
        setEditing(false);
        router.refresh();
      } else toast.error(r.error);
    });

  if (editing)
    return (
      <div className="mt-2 flex flex-col gap-2">
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus aria-label={`הערה פנימית: ${a.question_label}`} placeholder="הערה פנימית (הלקוח לא רואה)" />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} loading={pending}>שמירת הערה</Button>
          <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setDraft(a.internal_note ?? ""); }}>ביטול</Button>
        </div>
      </div>
    );
  if (a.internal_note)
    return (
      <button type="button" onClick={() => setEditing(true)} className="mt-2 flex w-full items-start gap-2 rounded-md border border-warn/25 bg-warn-soft/60 px-2.5 py-1.5 text-start text-xs text-ink-2 hover:border-warn/40">
        <StickyNote className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
        <span className="whitespace-pre-wrap">{a.internal_note}</span>
      </button>
    );
  return (
    <button type="button" onClick={() => setEditing(true)} className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3 opacity-100 hover:text-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
      <MessageSquarePlus className="size-3.5" aria-hidden /> הערה פנימית
    </button>
  );
}

/** The client's original answers, organized by section. Read-only; notes are separate. */
export function AnswersView({ sections, files }: Props) {
  if (!sections.length) return <p className="text-sm text-ink-3">אין תשובות בשאלון הזה.</p>;
  return (
    <div className="flex flex-col gap-6">
      {sections.map((sec, si) => (
        <section key={`${sec.title}-${si}`} aria-labelledby={`sec-${si}`}>
          <h3 id={`sec-${si}`} className="mb-3 flex items-baseline gap-2 border-b border-line pb-2 font-display text-lg font-bold text-ink">
            <span className="text-sm font-normal text-ink-3 num">{si + 1}.</span>
            {sec.title || "ללא כותרת"}
          </h3>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
            {sec.answers.map((a) => {
              const wide = ["long_text", "image_upload", "file_upload", "reference_links"].includes(a.question_type);
              return (
                <div key={a.id} className={cn("group min-w-0", wide && "lg:col-span-2")}>
                  <dt className="text-xs font-medium text-ink-3">{a.question_label}</dt>
                  <dd className="mt-1.5">
                    <Value a={a} files={files} />
                    <AnswerNote a={a} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
