import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { expensesByCategory, expensesByMonth, lastMonths, monthlyRunRate, type ExpenseLike } from "@/lib/domain/expenses";

export type MonthRow = { month: string; income: number; expenses: number; profit: number };

/** Income (payments) vs expenses for the last N months. Money is always derived. */
export async function financeSeries(supabase: ServerClient, n = 6, withExpenses = true) {
  const months = lastMonths(n);
  const from = `${months[0]}-01`;
  const [{ data: pays }, { data: exp }] = await Promise.all([
    supabase.from("payments").select("amount, paid_at").gte("paid_at", from),
    withExpenses
      ? supabase.from("business_expenses").select("amount, spent_on, recurring, ended_on, category")
      : Promise.resolve({ data: [] as { amount: number; spent_on: string; recurring: string; ended_on: string | null; category: string }[] }),
  ]);
  const income: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  for (const p of pays ?? []) {
    const k = p.paid_at.slice(0, 7);
    if (k in income) income[k] += Number(p.amount);
  }
  const list: ExpenseLike[] = (exp ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
  const byMonth = expensesByMonth(list, months);
  const rows: MonthRow[] = months.map((m) => ({ month: m, income: Math.round(income[m]), expenses: Math.round(byMonth[m]), profit: Math.round(income[m] - byMonth[m]) }));
  const current = months.at(-1)!;
  return {
    rows,
    categories: expensesByCategory(list, months),
    runRate: monthlyRunRate(list, current),
  };
}

export type GoalRow = {
  id: string;
  title: string;
  metric: string;
  target: number;
  actual: number;
  manual_value: number;
  period_start: string;
  period_end: string;
  owner_id: string | null;
  status: string;
  notes: string | null;
  /** % of the period already elapsed (where we "should" be). */
  pace: number;
  days_left: number;
};

export async function goalsWithProgress(supabase: ServerClient): Promise<GoalRow[]> {
  const { data } = await supabase.from("business_goals").select("*").order("status").order("period_end");
  const goals = data ?? [];
  const actuals = await Promise.all(goals.map((g) => supabase.rpc("goal_actual", { p_goal: g.id })));
  const now = Date.now();
  return goals.map((g, i) => {
    const start = new Date(`${g.period_start}T00:00:00`).getTime();
    const end = new Date(`${g.period_end}T23:59:59`).getTime();
    return {
    id: g.id,
    title: g.title,
    metric: g.metric,
    target: Number(g.target),
    manual_value: Number(g.manual_value),
    actual: Number(actuals[i].data ?? 0),
    period_start: g.period_start,
    period_end: g.period_end,
    owner_id: g.owner_id,
    status: g.status,
    notes: g.notes,
    pace: Math.max(0, Math.min(100, Math.round(((now - start) / Math.max(1, end - start)) * 100))),
    days_left: Math.ceil((end - now) / 864e5),
    };
  });
}
