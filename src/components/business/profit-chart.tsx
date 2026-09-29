"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { monthLabel } from "@/lib/domain/expenses";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = { month: string; income: number; expenses: number; profit: number };

// Validated pair (dataviz validator, light surface): identity only, never status.
const INCOME = "#3346c4";
const EXPENSE = "#d97706";

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const short = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}K` : String(Math.round(n)));

/**
 * Income vs expenses per month — one axis (both ₪), grouped bars, a hover
 * tooltip per month with the profit, and a table view.
 */
export function ProfitChart({ rows }: { rows: Row[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  // Draw at the real width so labels stay 11px on a phone (no scaled-down SVG text).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);
  const max = niceMax(Math.max(...rows.flatMap((r) => [r.income, r.expenses]), 0));
  const H = W < 480 ? 200 : 230;
  const pad = { top: 12, bottom: 28, start: 44, end: 8 };
  const plotW = W - pad.start - pad.end;
  const plotH = H - pad.top - pad.bottom;
  const band = plotW / rows.length;
  const barW = Math.max(6, Math.min(22, band / 3.2));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const active = hover !== null ? rows[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex items-center gap-4 text-xs text-ink-2" aria-label="מקרא">
          <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: INCOME }} aria-hidden />הכנסות</li>
          <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: EXPENSE }} aria-hidden />הוצאות</li>
        </ul>
        <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="תצוגה">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium", view === v ? "bg-sunken text-ink" : "text-ink-3 hover:text-ink")}
            >
              {v === "chart" ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
              {v === "chart" ? "גרף" : "טבלה"}
            </button>
          ))}
        </div>
      </div>

      {view === "chart" ? (
        <div ref={box} className="relative" dir="ltr">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full" role="img" aria-label="הכנסות מול הוצאות לפי חודש" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.start} x2={W - pad.end} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={pad.start - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[11px] num">{short(t)}</text>
              </g>
            ))}
            {rows.map((r, i) => {
              const cx = pad.start + band * i + band / 2;
              const bars = [
                { v: r.income, x: cx - barW - 1, c: INCOME },
                { v: r.expenses, x: cx + 1, c: EXPENSE },
              ];
              return (
                <g key={r.month} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthLabel(r.month)}: הכנסות ${formatMoney(r.income)}, הוצאות ${formatMoney(r.expenses)}, רווח ${formatMoney(r.profit)}`} className="outline-none">
                  <rect x={pad.start + band * i} y={pad.top} width={band} height={plotH} fill={hover === i ? "var(--surface-sunken)" : "transparent"} />
                  {bars.map((b) => {
                    const h = Math.max(0, y(0) - y(b.v));
                    const r4 = Math.min(4, h / 2, barW / 2);
                    // Rounded top only, anchored to the baseline.
                    const d = h <= 0 ? "" : `M${b.x},${y(0)} V${y(b.v) + r4} Q${b.x},${y(b.v)} ${b.x + r4},${y(b.v)} H${b.x + barW - r4} Q${b.x + barW},${y(b.v)} ${b.x + barW},${y(b.v) + r4} V${y(0)} Z`;
                    return d ? <path key={b.c} d={d} fill={b.c} /> : null;
                  })}
                  <text x={cx} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[11px]">{monthLabel(r.month)}</text>
                </g>
              );
            })}
            <line x1={pad.start} x2={W - pad.end} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />
          </svg>
          {active && hover !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-40 -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-2"
              style={{ left: `${((pad.start + band * hover + band / 2) / W) * 100}%` }}
              dir="rtl"
            >
              <p className="mb-1 font-semibold text-ink">{monthLabel(active.month)}</p>
              <p className="flex justify-between gap-4 text-ink-2"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: INCOME }} />הכנסות</span><bdi className="num">{formatMoney(active.income)}</bdi></p>
              <p className="flex justify-between gap-4 text-ink-2"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: EXPENSE }} />הוצאות</span><bdi className="num">{formatMoney(active.expenses)}</bdi></p>
              <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold text-ink"><span>רווח</span><bdi className="num">{formatMoney(active.profit)}</bdi></p>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th className="py-2 text-start font-medium">חודש</th>
                <th className="py-2 text-end font-medium">הכנסות</th>
                <th className="py-2 text-end font-medium">הוצאות</th>
                <th className="py-2 text-end font-medium">רווח</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.month}>
                  <td className="py-2 text-ink-2">{monthLabel(r.month)}</td>
                  <td className="py-2 text-end"><bdi className="num">{formatMoney(r.income)}</bdi></td>
                  <td className="py-2 text-end"><bdi className="num">{formatMoney(r.expenses)}</bdi></td>
                  <td className={cn("py-2 text-end font-medium", r.profit < 0 ? "text-danger" : "text-ink")}><bdi className="num">{formatMoney(r.profit)}</bdi></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
