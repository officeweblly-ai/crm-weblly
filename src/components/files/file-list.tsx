"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Film, FileArchive, FileImage, FileSpreadsheet, FileText, File as FileIcon, MoreHorizontal, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { deleteFile, getFileUrl, setFileShared, updateFileMeta } from "@/lib/actions/files";
import { fileCategory, type FileCategory } from "@/lib/domain/labels";
import { formatBytes, formatDay } from "@/lib/format";
import { isPreviewable } from "@/lib/storage";
import type { FileRow } from "@/lib/data/crm";

export type FileWithThumb = FileRow & { thumbUrl: string | null };

function FileTypeIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <FileImage className={className} aria-hidden />;
  if (mime === "application/pdf" || mime.includes("word") || mime === "text/plain") return <FileText className={className} aria-hidden />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet className={className} aria-hidden />;
  if (mime.includes("zip")) return <FileArchive className={className} aria-hidden />;
  if (mime.startsWith("font/")) return <Type className={className} aria-hidden />;
  if (mime.startsWith("video/")) return <Film className={className} aria-hidden />;
  return <FileIcon className={className} aria-hidden />;
}

function FileCard({ file, showContext }: { file: FileWithThumb; showContext: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canPreview = isPreviewable(file.mime_type);

  const open = (download: boolean) =>
    start(async () => {
      const r = await getFileUrl(file.id, download);
      if (!r.ok) return void toast.error(r.error);
      if (download) window.location.href = r.data.url;
      else setPreview(r.data.url);
    });

  const toggleShared = () =>
    start(async () => {
      const r = await setFileShared(file.id, !file.is_shared);
      if (r.ok) {
        toast.success(r.message ?? "עודכן");
        router.refresh();
      } else toast.error(r.error);
    });

  const setCategory = (category: FileCategory) =>
    start(async () => {
      const r = await updateFileMeta({ id: file.id, category, project_id: file.project_id ?? undefined });
      if (r.ok) {
        toast.success(r.message ?? "עודכן");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1">
      <button
        type="button"
        onClick={() => (canPreview ? open(false) : open(true))}
        className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-sunken"
        aria-label={canPreview ? `תצוגה מקדימה: ${file.original_name}` : `הורדה: ${file.original_name}`}
        disabled={pending}
      >
        {file.thumbUrl && file.mime_type.startsWith("video/") ? (
          <video src={`${file.thumbUrl}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden />
        ) : file.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived private URL
          <img src={file.thumbUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <FileTypeIcon mime={file.mime_type} className="size-8 text-ink-3" />
        )}
        <span className="absolute start-2 top-2 rounded bg-surface/90 px-1.5 py-0.5 text-[11px] font-medium text-ink-2 shadow-1">{fileCategory.label(file.category)}</span>
        {file.is_shared && (
          <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white shadow-1">
            <Eye className="size-3" aria-hidden />
            מוצג ללקוח
          </span>
        )}
      </button>
      <div className="flex items-start gap-1 p-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink" title={file.original_name}>
            {file.original_name}
          </div>
          <div className="truncate text-xs text-ink-3">
            {formatBytes(file.size_bytes)} · {formatDay(file.created_at)}
            {file.source === "questionnaire" && " · מהשאלון"}
          </div>
          {showContext && (file.projects || file.clients) && (
            <div className="truncate text-xs">
              {file.clients && (
                <Link href={`/clients/${file.clients.id}?tab=files`} className="text-ink-3 hover:text-accent">
                  {file.clients.name}
                </Link>
              )}
              {file.projects && <span className="text-ink-3"> · {file.projects.name}</span>}
            </div>
          )}
        </div>
        <Menu
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`פעולות: ${file.original_name}`}>
              <MoreHorizontal />
            </Button>
          }
        >
          {canPreview && (
            <MenuItem onSelect={() => open(false)}>
              <Eye /> תצוגה מקדימה
            </MenuItem>
          )}
          <MenuItem onSelect={() => open(true)}>
            <Download /> הורדה
          </MenuItem>
          {file.project_id && !file.album_id && (
            <MenuItem onSelect={toggleShared}>
              {file.is_shared ? <><EyeOff /> הסתרה מהלקוח</> : <><Eye /> הצגה ללקוח</>}
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuLabel>קטגוריה</MenuLabel>
          {fileCategory.list.map((c) => (
            <MenuItem key={c.value} onSelect={() => setCategory(c.value)} disabled={c.value === file.category}>
              <span className="w-4" aria-hidden>{c.value === file.category ? "✓" : ""}</span>
              {c.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem destructive onSelect={() => setDeleting(true)}>
            <Trash2 /> מחיקה
          </MenuItem>
        </Menu>
      </div>

      <Modal open={preview !== null} onOpenChange={(o) => !o && setPreview(null)} title={file.original_name} size="lg"
        footer={
          <>
            <Button onClick={() => open(true)} loading={pending}>
              <Download aria-hidden /> הורדה
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>סגירה</Button>
          </>
        }
      >
        {preview &&
          (file.mime_type.startsWith("video/") ? (
            <video src={preview} controls playsInline className="mx-auto max-h-[70vh] w-full rounded-md bg-ink" />
          ) : file.mime_type === "application/pdf" ? (
            <iframe src={preview} title={file.original_name} className="h-[70vh] w-full rounded-md border border-line" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived private URL
            <img src={preview} alt={file.original_name} className="mx-auto max-h-[70vh] rounded-md object-contain" />
          ))}
      </Modal>
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="מחיקת קובץ"
        description={<>הקובץ &quot;{file.original_name}&quot; יימחק מהאחסון לצמיתות.{file.source === "questionnaire" && " הקובץ הועלה על ידי הלקוח בשאלון — התשובה בשאלון תישאר, אבל הקובץ לא יהיה זמין."}</>}
        confirmLabel="מחיקת הקובץ"
        action={() => deleteFile(file.id)}
        onDone={() => router.refresh()}
      />
    </li>
  );
}

export function FileGrid({ files, showContext = false }: { files: FileWithThumb[]; showContext?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {files.map((f) => (
        <FileCard key={f.id} file={f} showContext={showContext} />
      ))}
    </ul>
  );
}

/** Files split into their categories (references, site texts, contracts…), in category order. */
export function GroupedFiles({ files, showContext = false }: { files: FileWithThumb[]; showContext?: boolean }) {
  const groups = fileCategory.list.map((c) => ({ ...c, items: files.filter((f) => f.category === c.value) })).filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.value} aria-label={g.label}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            {g.label}
            <span className="rounded-full bg-sunken px-1.5 text-xs font-medium text-ink-3 num">{g.items.length}</span>
          </h3>
          <FileGrid files={g.items} showContext={showContext} />
        </section>
      ))}
    </div>
  );
}
