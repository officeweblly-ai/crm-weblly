"use client";

import { useState } from "react";
import { FileUploader } from "./file-uploader";
import { fileCategory, type FileCategory } from "@/lib/domain/labels";

/** Upload box with category + optional project association. */
export function FilesPanel({ clientId, projectId, projects }: { clientId?: string; projectId?: string; projects?: { value: string; label: string }[] }) {
  const [category, setCategory] = useState<FileCategory>("references");
  const [project, setProject] = useState(projectId ?? "");
  const sel = "h-9 rounded-md border border-line-strong bg-surface ps-2 pe-7 text-sm text-ink-2 focus:border-accent focus:outline-none";
  return (
    <div className="rounded-lg border border-line bg-surface p-3 shadow-1">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">קטגוריה לקבצים שיועלו</legend>
          <span className="me-1">העלאה אל:</span>
          {fileCategory.list.filter((c) => c.value !== "social" && c.value !== "questionnaire").map((c) => (
            <label key={c.value} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/30 ${category === c.value ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-ink-2 hover:bg-sunken"}`}>
              <input type="radio" name="upload-category" className="sr-only" checked={category === c.value} onChange={() => setCategory(c.value)} />
              {c.label}
            </label>
          ))}
        </fieldset>
        {!projectId && projects && projects.length > 0 && (
          <label className="flex items-center gap-2">
            פרויקט
            <select className={sel} value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">כללי ללקוח</option>
              {projects.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <FileUploader clientId={clientId} projectId={project || null} category={category} compact />
    </div>
  );
}
