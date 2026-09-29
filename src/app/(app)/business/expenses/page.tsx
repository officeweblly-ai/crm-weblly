import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Money } from "@/components/ui/misc";
import { ExpenseFormModal, ExpenseRow, type Expense } from "@/components/business/expenses";
import { requireArea } from "@/lib/auth";
import { projectOptions } from "@/lib/data/crm";
import { amountInMonth, lastMonths, monthLabel, monthlyRunRate } from "@/lib/domain/expenses";
import { expenseCategory, type ExpenseCategory } from "@/lib/domain/labels";
import { createClient } from "@/lib/supabase/server";
import { cn, first } from "@/lib/utils";

export const metadata = { title: "הוצאות העסק" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireArea("finances");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: people }, projects] = await Promise.all([
    supabase.from("business_expenses").select("*, files(original_name)").order("spent_on", { ascending: false }).limit(1000),
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
    projectOptions(),
  ]);
  const staff = (people ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email }));
  const nameOf = new Map(staff.map((s) => [s.value, s.label.split(" ")[0]]));
  const all: Expense[] = (data ?? []).map(({ files, ...e }) => ({ ...e, amount: Number(e.amount), file_name: files?.original_name ?? null }));

  const months = lastMonths(12);
  const current = months.at(-1)!;
  const mParam = first(sp.m);
  const month = mParam && /^\d{4}-\d{2}$/.test(mParam) ? mParam : current;
  const cat = first(sp.cat);
  const catOk = cat && expenseCategory.values.includes(cat as ExpenseCategory) ? (cat as ExpenseCategory) : null;

  const inMonth = all.filter((e) => amountInMonth(e, month) > 0 && (!catOk || e.category === catOk));
  const monthTotal = inMonth.reduce((s, e) => s + amountInMonth(e, month), 0);
  const recurringActive = all.filter((e) => e.recurring !== "none" && (!e.ended_on || e.ended_on.slice(0, 7) >= current));
  const runRate = monthlyRunRate(all, current);
  const yearStart = `${current.slice(0, 4)}-01`;
  const ytd = months.filter((m) => m >= yearStart).reduce((s, m) => s + all.reduce((a, e) => a + amountInMonth(e, m), 0), 0);
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const next = { m: month === current ? null : month, cat: catOk, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    const s = q.toString();
    return `/business/expenses${s ? `?${s}` : ""}`;
  };
  const add = (
    <ExpenseFormModal staff={staff} projects={projects} meId={viewer.userId} trigger={<Button><Plus aria-hidden />הוצאה</Button>} />
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="סיכום">
        <div className="rounded-lg border border-line bg-surface px-4 py-3.5 shadow-1">
          <p className="text-xs text-ink-3">{monthLabel(month)}{catOk ? ` · ${expenseCategory.label(catOk)}` : ""}</p>
          <p className="mt-1 text-2xl font-semibold text-ink"><Money value={monthTotal} /></p>
        </div>
        <div className="rounded-lg border border-line bg-surface px-4 py-3.5 shadow-1">
          <p className="text-xs text-ink-3">קבועות לחודש</p>
          <p className="mt-1 text-2xl font-semibold text-ink"><Money value={runRate} /></p>
          <p className="text-xs text-ink-3">{recurringActive.length} מנויים פעילים</p>
        </div>
        <div className="rounded-lg border border-line bg-surface px-4 py-3.5 shadow-1">
          <p className="text-xs text-ink-3">מתחילת השנה</p>
          <p className="mt-1 text-2xl font-semibold text-ink"><Money value={ytd} /></p>
        </div>
        <div className="flex items-center justify-center rounded-lg border border-dashed border-line-strong px-4 py-3.5">{add}</div>
      </section>

      <div className="flex flex-col gap-2">
        <nav aria-label="חודש" className="scrollbar-thin -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1.5">
            {[...months].reverse().map((m) => (
              <li key={m}>
                <Link href={href({ m: m === current ? null : m })} scroll={false} className={cn("inline-flex h-9 items-center rounded-full border px-3 text-sm", m === month ? "border-accent bg-accent-soft font-medium text-accent-ink" : "border-line text-ink-2 hover:bg-sunken")}>
                  {monthLabel(m)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="קטגוריה" className="scrollbar-thin -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1.5">
            <li><Link href={href({ cat: null })} scroll={false} className={cn("inline-flex h-8 items-center rounded-full px-3 text-xs", !catOk ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}>הכול</Link></li>
            {expenseCategory.list.map((c) => (
              <li key={c.value}>
                <Link href={href({ cat: c.value })} scroll={false} className={cn("inline-flex h-8 items-center rounded-full px-3 text-xs", catOk === c.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}>{c.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <Card>
        <CardHeader title={`הוצאות ${monthLabel(month)}`} description={inMonth.length ? `${inMonth.length} רשומות` : undefined} />
        {inMonth.length ? (
          <ul className="divide-y divide-line">
            {inMonth.map((e) => (
              <ExpenseRow key={e.id} e={e} staff={staff} projects={projects} payer={e.paid_by ? nameOf.get(e.paid_by) ?? null : null} meId={viewer.userId} />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={Receipt} title="אין הוצאות בחודש הזה" description="מנויים (Figma, Vercel, Google Workspace), שיווק, ציוד — רושמים פעם אחת, והרווח בסקירה מתעדכן." action={add} />
        )}
      </Card>

      {recurringActive.length > 0 && (
        <Card>
          <CardHeader title="מנויים והוצאות קבועות" description="כל מה שיורד כל חודש או כל שנה." />
          <ul className="divide-y divide-line">
            {recurringActive.map((e) => (
              <ExpenseRow key={e.id} e={e} staff={staff} projects={projects} payer={e.paid_by ? nameOf.get(e.paid_by) ?? null : null} meId={viewer.userId} />
            ))}
          </ul>
        </Card>
      )}

      {first(sp.new) === "1" && <ExpenseFormModal staff={staff} projects={projects} meId={viewer.userId} defaultOpen />}
    </div>
  );
}
