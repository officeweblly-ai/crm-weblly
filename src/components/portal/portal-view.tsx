import { CheckCircle2, Download, ExternalLink, FileText, Mail, Phone, PencilLine } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ApprovalResponse } from "@/components/portal/approval-response";
import type { PortalFile, PublicProject } from "@/lib/data/public";
import { approvalKind, projectLinkKind, type ApprovalKind, type ProjectLinkKind } from "@/lib/domain/labels";
import { displayUrl, formatDay, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The studio's internal stages, told the way a client thinks about them. */
const PHASES = [
  { label: "אפיון", statuses: ["lead", "questionnaire_sent", "questionnaire_received"] },
  { label: "התנעה", statuses: ["awaiting_deposit"] },
  { label: "עיצוב", statuses: ["design"] },
  { label: "פיתוח", statuses: ["development"] },
  { label: "בדיקות", statuses: ["testing", "awaiting_approval"] },
  { label: "השקה", statuses: ["awaiting_final_payment", "completed"] },
];

function FileTile({ file }: { file: PortalFile }) {
  const isImage = file.mime.startsWith("image/") && !/heic|heif|photoshop/.test(file.mime);
  if (!file.url) return null;
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-2"
    >
      <span className="grid aspect-[4/3] place-items-center overflow-hidden bg-sunken">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={file.url} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <FileText className="size-8 text-ink-3" aria-hidden />
        )}
      </span>
      <span className="flex items-center gap-2 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
        <Download className="size-4 shrink-0 text-ink-3 group-hover:text-accent" aria-hidden />
      </span>
    </a>
  );
}

/** The client-facing project page. Receives only the allowlisted data from getPublicProject. */
export function PortalView({ token, data }: { token: string; data: Extract<PublicProject, { state: "open" }> }) {
  const { project, approvals, files, links } = data;
  const phase = PHASES.findIndex((p) => p.statuses.includes(project.status));
  const done = project.status === "completed";
  const pending = approvals.filter((a) => a.status === "pending");
  const answered = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo size="sm" />
          <span className="text-xs text-ink-3">עודכן {formatDay(project.updated_at)}</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <section aria-labelledby="project-title">
          <p className="text-sm text-ink-3">הפרויקט שלכם</p>
          <h1 id="project-title" className="mt-1 text-3xl font-bold leading-tight tracking-tight text-ink text-balance">
            {project.name}
          </h1>

          <ol className="mt-6 grid grid-cols-6 gap-1.5" aria-label="שלבי הפרויקט">
            {PHASES.map((p, i) => {
              const state = done || i < phase ? "past" : i === phase ? "current" : "next";
              return (
                <li key={p.label} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
                  <span className={cn("block h-1.5 rounded-full", state === "past" && "bg-ink/70", state === "current" && "bg-accent", state === "next" && "bg-line", done && "bg-ok")} />
                  <span className={cn("mt-2 block truncate text-[11px] sm:text-xs", state === "current" ? "font-semibold text-accent-ink" : state === "past" ? "text-ink-2" : "text-ink-3")}>
                    {p.label}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-base text-ink-2">
            {done ? "הפרויקט הושלם. תודה שעבדתם איתנו!" : phase >= 0 ? <>אנחנו כרגע בשלב <strong className="font-semibold text-ink">{PHASES[phase].label}</strong>.</> : null}
          </p>
        </section>

        {(project.client_action || pending.length > 0) && (
          <section aria-labelledby="needed-h" className="rounded-xl border border-accent/25 bg-accent-soft/50 p-5">
            <h2 id="needed-h" className="text-base font-semibold text-accent-ink">מה אנחנו צריכים מכם עכשיו</h2>
            {project.client_action && <p className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-ink">{project.client_action}</p>}
            {pending.length > 0 && (
              <p className="mt-1.5 text-sm text-ink-2">
                {pending.length === 1 ? "יש בקשת אישור אחת שמחכה לכם למטה." : `יש ${pending.length} בקשות אישור שמחכות לכם למטה.`}
              </p>
            )}
          </section>
        )}

        {project.client_update && (
          <section aria-labelledby="update-h" className="rounded-xl border border-line bg-surface p-5 shadow-1">
            <h2 id="update-h" className="text-base font-semibold text-ink">עדכון מהצוות</h2>
            <p className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-ink-2">{project.client_update}</p>
          </section>
        )}

        {links.length > 0 && (
          <section aria-labelledby="links-h">
            <h2 id="links-h" className="mb-3 text-base font-semibold text-ink">צפייה באתר</h2>
            <ul className="flex flex-col gap-2">
              {links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-1 transition-colors hover:border-accent/40">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{l.label || projectLinkKind.label(l.kind as ProjectLinkKind)}</span>
                      <bdi dir="ltr" className="block truncate text-right font-mono text-xs text-ink-3">{displayUrl(l.url)}</bdi>
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-accent" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {pending.length > 0 && (
          <section aria-labelledby="approvals-h" className="flex flex-col gap-4">
            <h2 id="approvals-h" className="text-base font-semibold text-ink">מחכה לאישור שלכם</h2>
            {pending.map((a) => (
              <article key={a.id} className="rounded-xl border border-line bg-surface p-5 shadow-2">
                <p className="text-xs font-medium text-ink-3">{approvalKind.label(a.kind as ApprovalKind)}</p>
                <h3 className="mt-0.5 text-lg font-semibold text-ink">{a.title}</h3>
                {a.description && <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-ink-2">{a.description}</p>}
                {a.preview_url && (
                  <a href={a.preview_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                    פתיחת התצוגה המקדימה
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                )}
                {a.files.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {a.files.map((f) => (
                      <FileTile key={f.id} file={f} />
                    ))}
                  </div>
                )}
                <ApprovalResponse token={token} approvalId={a.id} />
              </article>
            ))}
          </section>
        )}

        {files.length > 0 && (
          <section aria-labelledby="files-h">
            <h2 id="files-h" className="mb-3 text-base font-semibold text-ink">קבצים ותוצרים</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {files.map((f) => (
                <FileTile key={f.id} file={f} />
              ))}
            </div>
          </section>
        )}

        {answered.length > 0 && (
          <section aria-labelledby="history-h">
            <h2 id="history-h" className="mb-3 text-base font-semibold text-ink">אישורים קודמים</h2>
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface shadow-1">
              {answered.map((a) => {
                const last = a.feedback[a.feedback.length - 1];
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    {a.status === "approved" ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
                    ) : (
                      <PencilLine className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{a.title}</p>
                      <p className="text-xs text-ink-3">
                        {a.status === "approved" ? "אושר" : "התבקשו שינויים"}
                        {a.responded_at && ` · ${formatDay(a.responded_at)}`}
                      </p>
                      {last?.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{last.comment}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="mt-4 flex flex-col items-center gap-3 border-t border-line pt-8 text-center">
          <p className="text-sm text-ink-3">שאלות? אנחנו כאן.</p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            {data.contactPhone && (
              <a href={`tel:${data.contactPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-accent">
                <Phone className="size-4" aria-hidden />
                <bdi dir="ltr">{formatPhone(data.contactPhone)}</bdi>
              </a>
            )}
            {data.contactEmail && (
              <a href={`mailto:${data.contactEmail}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-accent">
                <Mail className="size-4" aria-hidden />
                <bdi dir="ltr">{data.contactEmail}</bdi>
              </a>
            )}
          </div>
          <Logo size="sm" className="mt-2 opacity-80" />
        </footer>
      </main>
    </div>
  );
}
