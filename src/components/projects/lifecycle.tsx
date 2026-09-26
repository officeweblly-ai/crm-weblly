import { projectStatus, type ProjectStatus } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Ltr } from "@/components/ui/misc";

/**
 * The project's position in the studio lifecycle: ten stages, from lead to
 * completed. Past stages are ink, the current one is the accent.
 */
export function LifecycleRail({ status, compact }: { status: ProjectStatus; compact?: boolean }) {
  const idx = projectStatus.values.indexOf(status);
  const total = projectStatus.values.length;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-medium text-ink", compact ? "text-sm" : "text-base")}>{projectStatus.label(status)}</span>
        <span className="text-xs text-ink-3 num">
          שלב {idx + 1} מתוך {total}
        </span>
      </div>
      <ol className="mt-2 flex gap-1" aria-label="שלבי הפרויקט">
        {projectStatus.list.map((s, i) => (
          <li
            key={s.value}
            title={s.label}
            aria-current={i === idx ? "step" : undefined}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < idx && "bg-ink/70",
              i === idx && (status === "completed" ? "bg-ok" : "bg-accent"),
              i > idx && "bg-line",
            )}
          >
            <span className="sr-only">
              {s.label}
              {i < idx ? " — הושלם" : i === idx ? " — שלב נוכחי" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Paid vs remaining, with a tick at the deposit amount. */
export function LedgerBar({ total, paid, deposit }: { total: number; paid: number; deposit: number }) {
  const remaining = total - paid;
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : paid > 0 ? 100 : 0;
  const depositPct = total > 0 ? Math.min(100, (deposit / total) * 100) : 0;
  const depositCovered = paid >= deposit;
  return (
    <div>
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-xs text-ink-3">מחיר כולל</dt>
          <dd className="mt-0.5 text-base font-semibold text-ink">
            <Ltr className="num">{formatMoney(total)}</Ltr>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">שולם</dt>
          <dd className="mt-0.5 text-base font-semibold text-ok">
            <Ltr className="num">{formatMoney(paid)}</Ltr>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">{remaining < 0 ? "שולם ביתר" : "יתרה"}</dt>
          <dd className={cn("mt-0.5 text-base font-semibold", remaining > 0 ? "text-ink" : remaining < 0 ? "text-warn" : "text-ok")}>
            <Ltr className="num">{formatMoney(Math.abs(remaining))}</Ltr>
          </dd>
        </div>
      </dl>
      <div
        className="relative mt-3 h-2 rounded-full bg-sunken"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={`שולמו ${Math.round(pct)}% מהמחיר`}
      >
        <div className="absolute inset-y-0 start-0 rounded-full bg-ok" style={{ width: `${pct}%` }} />
        {deposit > 0 && depositPct < 100 && (
          <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink/40" style={{ insetInlineStart: `${depositPct}%` }} aria-hidden />
        )}
      </div>
      {deposit > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          מקדמה <Ltr className="num">{formatMoney(deposit)}</Ltr> · {depositCovered ? "שולמה" : <span className="font-medium text-warn">טרם שולמה במלואה</span>}
        </p>
      )}
    </div>
  );
}
