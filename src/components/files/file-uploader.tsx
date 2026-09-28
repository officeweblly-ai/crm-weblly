"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2, TriangleAlert, X } from "lucide-react";
import { confirmUpload, requestUpload } from "@/lib/actions/files";
import { ACCEPT_ALL, MAX_FILE_BYTES } from "@/lib/storage";
import { formatBytes } from "@/lib/format";
import { uploadWithProgress } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import type { FileCategory } from "@/lib/domain/labels";

type Item = { key: string; name: string; size: number; progress: number; state: "uploading" | "done" | "error"; error?: string; id?: string };

/**
 * Drag-and-drop / picker uploader with per-file progress. Files go straight
 * from the browser to private storage through a signed URL; the server then
 * verifies the object before recording it.
 */
export function FileUploader({
  clientId,
  projectId,
  category,
  multiple = true,
  accept = ACCEPT_ALL,
  onUploaded,
  compact,
  albumId,
  albumSection,
  hint,
  taskId,
}: {
  /** Attach the uploaded files to a task (they still belong to the project). */
  taskId?: string;
  albumId?: string;
  albumSection?: "reels" | "process" | "before_after" | "final" | "behind_scenes" | "other";
  hint?: string;
  clientId?: string | null;
  projectId?: string | null;
  category: FileCategory;
  multiple?: boolean;
  accept?: string;
  onUploaded?: (file: { id: string; name: string }) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const uploadOne = async (file: File) => {
    const key = crypto.randomUUID();
    setItems((l) => [...l, { key, name: file.name, size: file.size, progress: 0, state: "uploading" }]);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("הקובץ גדול מ-50MB");
      const ticket = await requestUpload({ name: file.name, mime: file.type, size: file.size, category, client_id: clientId ?? undefined, project_id: projectId ?? undefined, album_id: albumId, album_section: albumSection, task_id: taskId });
      if (!ticket.ok) throw new Error(ticket.error);
      await uploadWithProgress(ticket.data.signedUrl, file, ticket.data.mime, (progress) => patch(key, { progress }));
      const saved = await confirmUpload({
        path: ticket.data.path,
        name: file.name,
        mime: ticket.data.mime,
        size: file.size,
        category,
        client_id: clientId ?? undefined,
        project_id: projectId ?? undefined,
        album_id: albumId,
        album_section: albumSection,
        task_id: taskId,
      });
      if (!saved.ok) throw new Error(saved.error);
      patch(key, { state: "done", id: saved.data.id, progress: 100 });
      onUploaded?.({ id: saved.data.id, name: file.name });
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "ההעלאה נכשלה";
      patch(key, { state: "error", error: message });
      toast.error(`${file.name}: ${message}`);
      return false;
    }
  };

  const handle = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = multiple ? Array.from(list) : [list[0]];
    const results = await Promise.all(files.map(uploadOne));
    const okCount = results.filter(Boolean).length;
    if (okCount) {
      toast.success(okCount === 1 ? "הקובץ הועלה" : `${okCount} קבצים הועלו`);
      router.refresh();
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handle(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border border-dashed text-center transition-colors",
          compact ? "px-4 py-4" : "px-4 py-7",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-sunken/40 hover:bg-sunken/70",
        )}
      >
        <FileUp className="size-5 text-ink-3" aria-hidden />
        <p className="mt-2 text-sm text-ink-2">
          <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-accent hover:underline">
            בחירת {multiple ? "קבצים" : "קובץ"}
          </button>{" "}
          <span className="hidden sm:inline">או גרירה לכאן</span>
        </p>
        <p className="mt-1 text-xs text-ink-3">{hint ?? "תמונות, PDF, Office, ZIP, וידאו וקבצי עיצוב"} · עד 50MB</p>
        <input ref={inputRef} type="file" className="sr-only" multiple={multiple} accept={accept} onChange={(e) => void handle(e.target.files)} tabIndex={-1} aria-hidden />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2">
              {i.state === "uploading" && <Loader2 className="size-4 shrink-0 animate-spin text-accent" aria-hidden />}
              {i.state === "done" && <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden />}
              {i.state === "error" && <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-ink">{i.name}</span>
                  <span className="shrink-0 text-xs text-ink-3 num">{i.state === "uploading" ? `${i.progress}%` : formatBytes(i.size)}</span>
                </div>
                {i.state === "uploading" && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`העלאת ${i.name}`}>
                    <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${i.progress}%` }} />
                  </div>
                )}
                {i.state === "error" && <p className="mt-0.5 text-xs text-danger">{i.error}</p>}
              </div>
              {i.state !== "uploading" && (
                <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-sunken" aria-label="הסרה מהרשימה">
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
