"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, FileText, ImagePlus, Loader2, Plus, TriangleAlert, Upload, X } from "lucide-react";
import { confirmPublicUpload, requestPublicUpload } from "@/lib/actions/public-form";
import { MAX_FILES_PER_QUESTION, MAX_REFERENCE_LINKS, type AnswerValue, type ReferenceLink, type SnapshotQuestion, type UploadedFileRef } from "@/lib/domain/forms";
import { formatBytes } from "@/lib/format";
import { ACCEPT_ALL, ACCEPT_IMAGES, MAX_FILE_BYTES } from "@/lib/storage";
import { uploadWithProgress } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-lg border border-line-strong bg-surface px-3.5 text-[16px] text-ink placeholder:text-ink-3/80 transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/12 aria-[invalid=true]:border-danger";

type FieldProps = {
  q: SnapshotQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  invalid: boolean;
  describedBy?: string;
  token: string;
  preview: boolean;
};

function ChoiceCard({ checked, children, type, name, onChange, value, disabled }: { checked: boolean; children: React.ReactNode; type: "radio" | "checkbox"; name: string; onChange: () => void; value: string; disabled?: boolean }) {
  return (
    <label
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[15px] transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/25",
        checked ? "border-accent bg-accent-soft text-ink" : "border-line-strong bg-surface text-ink-2",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        !checked && !disabled && "hover:border-ink-3/50",
      )}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center border transition-colors",
          type === "radio" ? "rounded-full" : "rounded-md",
          checked ? "border-accent bg-accent text-white" : "border-line-strong bg-surface",
        )}
      >
        {checked && (type === "radio" ? <span className="size-2 rounded-full bg-white" /> : <Check className="size-3.5" strokeWidth={3} />)}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
function Uploads({ q, value, onChange, token, preview }: FieldProps) {
  const files = (Array.isArray(value) ? value : []) as UploadedFileRef[];
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ key: string; name: string; progress: number; error?: string }[]>([]);
  const latest = useRef(files);
  useEffect(() => {
    latest.current = files;
  });
  const images = q.type === "image_upload";

  const uploadOne = async (file: File) => {
    const key = crypto.randomUUID();
    setBusy((b) => [...b, { key, name: file.name, progress: 0 }]);
    const set = (patch: { progress?: number; error?: string }) => setBusy((b) => b.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("הקובץ גדול מ-50MB");
      const t = await requestPublicUpload(token, { questionId: q.id, name: file.name, mime: file.type, size: file.size });
      if (!t.ok) throw new Error(t.error);
      await uploadWithProgress(t.data.signedUrl, file, t.data.mime, (progress) => set({ progress }));
      const c = await confirmPublicUpload(token, { questionId: q.id, name: file.name, mime: t.data.mime, size: file.size, path: t.data.path });
      if (!c.ok) throw new Error(c.error);
      latest.current = [...latest.current, c.data];
      onChange(latest.current);
      setBusy((b) => b.filter((x) => x.key !== key));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ההעלאה נכשלה";
      set({ error: msg });
      toast.error(`${file.name}: ${msg}`);
    }
  };

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    if (preview) return void toast.message("בתצוגה מקדימה לא מעלים קבצים.");
    const room = MAX_FILES_PER_QUESTION - files.length;
    const chosen = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) toast.error(`אפשר לצרף עד ${MAX_FILES_PER_QUESTION} קבצים לשאלה.`);
    for (const f of chosen) await uploadOne(f);
    if (inputRef.current) inputRef.current.value = "";
  };

  const Icon = images ? ImagePlus : Upload;
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-5 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
      >
        <Icon className="size-6 text-accent" aria-hidden />
        <span className="text-[15px] font-medium text-ink">{images ? "הוספת תמונות" : "הוספת קבצים"}</span>
        <span className="text-xs text-ink-3">{images ? "JPG, PNG, SVG, WEBP" : "תמונות, PDF, Word, ZIP ועוד"} · עד 50MB לקובץ</span>
      </button>
      <input ref={inputRef} type="file" multiple accept={images ? ACCEPT_IMAGES : ACCEPT_ALL} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pick(e.target.files)} />
      {(files.length > 0 || busy.length > 0) && (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {files.map((f) => (
            <li key={f.file_id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
              <FileText className="size-4 shrink-0 text-ok" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
              <span className="text-xs text-ink-3">{formatBytes(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((x) => x.file_id !== f.file_id))} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-sunken hover:text-danger" aria-label={`הסרת ${f.name}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
          {busy.map((b) => (
            <li key={b.key} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-3">
                {b.error ? <TriangleAlert className="size-4 shrink-0 text-danger" aria-hidden /> : <Loader2 className="size-4 shrink-0 animate-spin text-accent" aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{b.name}</span>
                {b.error ? (
                  <button type="button" onClick={() => setBusy((x) => x.filter((y) => y.key !== b.key))} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-sunken" aria-label="סגירה">
                    <X className="size-4" />
                  </button>
                ) : (
                  <span className="text-xs text-ink-3 num">{b.progress}%</span>
                )}
              </div>
              {b.error ? (
                <p className="mt-1 text-xs text-danger">{b.error}</p>
              ) : (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={b.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`העלאת ${b.name}`}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${b.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Links({ value, onChange, invalid, q }: FieldProps) {
  const list = (Array.isArray(value) && value.length ? value : [{ url: "", note: "" }]) as ReferenceLink[];
  const update = (i: number, patch: Partial<ReferenceLink>) => {
    const next = list.map((l, j) => (j === i ? { ...l, ...patch } : l));
    onChange(next.filter((l, j) => l.url.trim() || (l.note ?? "").trim() || j === next.length - 1).length ? next : []);
  };
  const clean = (next: ReferenceLink[]) => onChange(next.filter((l) => l.url.trim() !== "" || (l.note ?? "").trim() !== ""));
  return (
    <div className="flex flex-col gap-3">
      {list.map((l, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <input
              dir="ltr"
              inputMode="url"
              aria-label={`קישור ${i + 1}`}
              aria-invalid={invalid || undefined}
              value={l.url}
              placeholder="example.com"
              onChange={(e) => update(i, { url: e.target.value })}
              onBlur={() => clean(list)}
              className={cn(base, "h-11 text-right")}
            />
            {list.length > 1 && (
              <button type="button" onClick={() => clean(list.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-sunken hover:text-danger" aria-label={`הסרת קישור ${i + 1}`}>
                <X className="size-4" />
              </button>
            )}
          </div>
          <input aria-label={`מה אהבת בקישור ${i + 1}`} value={l.note ?? ""} placeholder={q.placeholder ?? "מה אהבת באתר הזה?"} onChange={(e) => update(i, { note: e.target.value })} onBlur={() => clean(list)} className={cn(base, "h-11")} />
        </div>
      ))}
      {list.length < MAX_REFERENCE_LINKS && list[list.length - 1]?.url.trim() && (
        <button type="button" onClick={() => onChange([...list, { url: "", note: "" }])} className="inline-flex h-11 items-center gap-2 self-start rounded-lg px-3 text-sm font-medium text-accent hover:bg-accent-soft">
          <Plus className="size-4" aria-hidden /> קישור נוסף
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function QuestionControl(props: FieldProps) {
  const { q, value, onChange, invalid, describedBy } = props;
  const id = `q-${q.id}`;
  const common = { id, "aria-invalid": invalid || undefined, "aria-describedby": describedBy, "aria-required": q.required || undefined };
  const str = typeof value === "string" ? value : "";

  switch (q.type) {
    case "short_text":
      return <input {...common} className={cn(base, "h-12")} value={str} placeholder={q.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={500} />;
    case "long_text":
      return <textarea {...common} className={cn(base, "min-h-32 py-3 leading-relaxed")} rows={5} value={str} placeholder={q.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={10000} />;
    case "email":
      return <input {...common} type="email" inputMode="email" autoComplete="email" dir="ltr" className={cn(base, "h-12 text-right")} value={str} placeholder={q.placeholder ?? "name@example.com"} onChange={(e) => onChange(e.target.value)} />;
    case "phone":
      return <input {...common} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" className={cn(base, "h-12 text-right")} value={str} placeholder={q.placeholder ?? "050-000-0000"} onChange={(e) => onChange(e.target.value)} />;
    case "url":
      return <input {...common} inputMode="url" dir="ltr" className={cn(base, "h-12 text-right")} value={str} placeholder={q.placeholder ?? "example.co.il"} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return (
        <input
          {...common}
          inputMode="decimal"
          dir="ltr"
          className={cn(base, "h-12 max-w-48 text-right")}
          value={typeof value === "number" ? String(value) : str}
          placeholder={q.placeholder ?? ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.-]/g, "");
            onChange(raw === "" ? null : Number.isFinite(Number(raw)) && !raw.endsWith(".") ? Number(raw) : raw);
          }}
        />
      );
    case "date":
      return <input {...common} type="date" className={cn(base, "h-12 max-w-56")} value={str} onChange={(e) => onChange(e.target.value)} />;
    case "color":
      return (
        <div className="flex items-center gap-3">
          <label className="relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line-strong shadow-1" style={{ background: str || "#ffffff" }}>
            <span className="sr-only">בחירת צבע</span>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(str) ? str : "#3346c4"} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-describedby={describedBy} />
          </label>
          <input {...common} dir="ltr" className={cn(base, "h-12 max-w-40 font-mono text-right")} value={str} placeholder="#1a2b3c" onChange={(e) => onChange(e.target.value)} maxLength={7} />
          {str && (
            <button type="button" onClick={() => onChange(null)} className="text-sm text-ink-3 hover:text-ink">
              ניקוי
            </button>
          )}
        </div>
      );
    case "yes_no":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid grid-cols-2 gap-2 sm:max-w-sm">
          {(["yes", "no"] as const).map((v) => (
            <ChoiceCard key={v} type="radio" name={id} value={v} checked={value === v} onChange={() => onChange(v)}>
              {v === "yes" ? "כן" : "לא"}
            </ChoiceCard>
          ))}
        </div>
      );
    case "single_select":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid gap-2 sm:grid-cols-2">
          {q.options.map((o) => (
            <ChoiceCard key={o.value} type="radio" name={id} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)}>
              {o.label}
            </ChoiceCard>
          ))}
        </div>
      );
    case "multi_select": {
      const arr = (Array.isArray(value) ? value : []) as string[];
      const max = q.max_choices ?? null;
      const full = max !== null && arr.length >= max;
      return (
        <div className="flex flex-col gap-2">
          {max !== null && (
            <p className="text-sm text-ink-3" aria-live="polite">
              אפשר לבחור עד {max} · נבחרו <span className="num">{arr.length}</span>
            </p>
          )}
          <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => {
              const checked = arr.includes(o.value);
              return (
                <ChoiceCard
                  key={o.value}
                  type="checkbox"
                  name={id}
                  value={o.value}
                  checked={checked}
                  disabled={full && !checked}
                  onChange={() => onChange(checked ? arr.filter((x) => x !== o.value) : full ? arr : [...arr, o.value])}
                >
                  {o.label}
                </ChoiceCard>
              );
            })}
          </div>
        </div>
      );
    }
    case "reference_links":
      return <Links {...props} />;
    case "image_upload":
    case "file_upload":
      return <Uploads {...props} />;
  }
}
