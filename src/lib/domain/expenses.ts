/**
 * Business expenses → monthly totals. A monthly expense counts every month
 * from spent_on until ended_on (or forever); a yearly one counts in its
 * anniversary month. Pure — tested in expenses.test.ts.
 */
export type ExpenseLike = { amount: number; spent_on: string; recurring: string; ended_on: string | null; category?: string };

/** "2026-09" */
export const monthKey = (iso: string) => iso.slice(0, 7);

export function lastMonths(n: number, today = new Date().toISOString().slice(0, 10)): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** How much of this expense falls in `month` (YYYY-MM). */
export function amountInMonth(e: ExpenseLike, month: string): number {
  const start = monthKey(e.spent_on);
  if (month < start) return 0;
  if (e.ended_on && month > monthKey(e.ended_on)) return 0;
  if (e.recurring === "monthly") return e.amount;
  if (e.recurring === "yearly") return month.slice(5) === start.slice(5) ? e.amount : 0;
  return month === start ? e.amount : 0;
}

export function expensesByMonth(list: ExpenseLike[], months: string[]): Record<string, number> {
  return Object.fromEntries(months.map((m) => [m, round(list.reduce((s, e) => s + amountInMonth(e, m), 0))]));
}

export function expensesByCategory(list: ExpenseLike[], months: string[]): { category: string; total: number }[] {
  const acc = new Map<string, number>();
  for (const e of list) {
    const t = months.reduce((s, m) => s + amountInMonth(e, m), 0);
    if (t > 0) acc.set(e.category ?? "other", (acc.get(e.category ?? "other") ?? 0) + t);
  }
  return [...acc.entries()].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total);
}

/** Fixed monthly cost right now (active monthly + yearly/12). */
export function monthlyRunRate(list: ExpenseLike[], month: string): number {
  return round(
    list.reduce((s, e) => {
      if (e.recurring === "none") return s;
      if (month < monthKey(e.spent_on) || (e.ended_on && month > monthKey(e.ended_on))) return s;
      return s + (e.recurring === "monthly" ? e.amount : e.amount / 12);
    }, 0),
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

export const HEBREW_MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
export const monthLabel = (m: string) => `${HEBREW_MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
