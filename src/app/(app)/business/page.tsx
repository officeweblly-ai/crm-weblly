import Link from "next/link";
import { ArrowLeft, Compass, Handshake, Plus, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/misc";
import { ProfitChart } from "@/components/business/profit-chart";
import { GoalCard, GoalFormModal, GoalsEmpty } from "@/components/business/goals";
import { requireStaff } from "@/lib/auth";
import { financeSeries, goalsWithProgress } from "@/lib/data/business";
import { can } from "@/lib/domain/permissions";
import { expenseCategory, partnerAgreementStatus, type ExpenseCategory, type PartnerAgreementStatus } from "@/lib/domain/labels";
import { monthLabel } from "@/lib/domain/expenses";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "ניהול העסק" };

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "danger" }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-4 py-3.5 shadow-1">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight text-ink", tone === "ok" && "text-ok", tone === "danger" && "text-danger")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export default async function BusinessPage() {
  const viewer = await requireStaff();
  const supabase = await createClient();
  const seeMoney = can(viewer.access, "finances");
  const seeStrategy = can(viewer.access, "strategy");
  const seePartners = can(viewer.access, "partners");

  const [series, goals, strategy, agreement, staffRows] = await Promise.all([
    seeMoney ? financeSeries(supabase, 6) : null,
    seeStrategy ? goalsWithProgress(supabase) : [],
    seeStrategy ? supabase.from("business_strategy").select("focus, monthly_revenue_target, vision").maybeSingle().then((r) => r.data) : null,
    seePartners ? supabase.from("partner_agreements").select("id, title, status, version").order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data) : null,
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
  ]);
  const staff = (staffRows.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email }));
  const nameOf = new Map(staff.map((s) => [s.value, s.label.split(" ")[0]]));

  const rows = series?.rows ?? [];
  const cur = rows.at(-1);
  const prev = rows.at(-2);
  const total = rows.reduce((a, r) => ({ income: a.income + r.income, expenses: a.expenses + r.expenses }), { income: 0, expenses: 0 });
  const margin = total.income > 0 ? Math.round(((total.income - total.expenses) / total.income) * 100) : null;
  const target = Number(strategy?.monthly_revenue_target ?? 0);
  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <div className="flex flex-col gap-6">
      {seeMoney && cur && (
        <section aria-label="החודש" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label={`הכנסות ${monthLabel(cur.month)}`}
            value={<Money value={cur.income} />}
            sub={target > 0 ? `${Math.round((cur.income / target) * 100)}% מיעד ${formatMoney(target)}` : prev ? `חודש קודם ${formatMoney(prev.income)}` : undefined}
          />
          <Kpi label="הוצאות החודש" value={<Money value={cur.expenses} />} sub={series && series.runRate > 0 ? `קבועות: ${formatMoney(series.runRate)} לחודש` : "אין הוצאות קבועות"} />
          <Kpi label="רווח החודש" value={<Money value={cur.profit} />} tone={cur.profit < 0 ? "danger" : cur.profit > 0 ? "ok" : undefined} sub={cur.income > 0 ? `${Math.round((cur.profit / cur.income) * 100)}% מההכנסות` : undefined} />
          <Kpi
            label="חצי שנה אחרונה"
            value={<Money value={total.income - total.expenses} />}
            sub={
              margin !== null ? (
                <span className="inline-flex items-center gap-1">
                  {margin >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
                  שולי רווח {margin}%
                </span>
              ) : undefined
            }
          />
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {seeMoney && series && (
            <Card>
              <CardHeader
                title="הכנסות מול הוצאות"
                description="6 חודשים אחרונים. הכנסות = תשלומים שנרשמו; הוצאות כולל מנויים חודשיים ושנתיים."
                action={<Button asChild size="sm" variant="secondary"><Link href="/business/expenses?new=1"><Plus aria-hidden />הוצאה</Link></Button>}
              />
              <CardBody>
                <ProfitChart rows={series.rows} />
              </CardBody>
            </Card>
          )}

          {seeStrategy && (
            <section aria-labelledby="goals-h">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="goals-h" className="text-base font-semibold text-ink">יעדים</h2>
                {activeGoals.length > 0 && <GoalFormModal staff={staff} trigger={<Button size="sm" variant="secondary"><Plus aria-hidden />יעד</Button>} />}
              </div>
              {goals.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {goals.map((g) => (
                    <GoalCard key={g.id} goal={g} staff={staff} ownerName={g.owner_id ? nameOf.get(g.owner_id) : null} canEdit />
                  ))}
                </div>
              ) : (
                <GoalsEmpty staff={staff} />
              )}
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          {seeStrategy && (
            <Card>
              <CardHeader title="הפוקוס עכשיו" action={<Button asChild variant="link" size="sm"><Link href="/business/strategy">אסטרטגיה<ArrowLeft aria-hidden /></Link></Button>} />
              <CardBody>
                {strategy?.focus ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{strategy.focus}</p>
                ) : (
                  <div className="flex items-start gap-3 text-sm text-ink-3">
                    <Compass className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <p>עוד לא הוגדר. מה שלושת הדברים שהכי חשובים לעסק ברבעון הזה?</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {seeMoney && series && series.categories.length > 0 && (
            <Card>
              <CardHeader title="לאן הולך הכסף" description="6 חודשים אחרונים" />
              <CardBody>
                <ul className="flex flex-col gap-2.5">
                  {series.categories.slice(0, 6).map((c) => {
                    const pct = Math.round((c.total / Math.max(1, total.expenses)) * 100);
                    return (
                      <li key={c.category} className="text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="text-ink-2">{expenseCategory.label(c.category as ExpenseCategory)}</span>
                          <span className="text-ink"><bdi className="num">{formatMoney(c.total)}</bdi></span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-sunken">
                          <div className="h-full rounded-full bg-[#d97706]" style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          {seePartners && (
            <Link href="/business/partners" className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-1 hover:border-line-strong">
              <Handshake className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">הסכם שותפים</span>
                {agreement ? (
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                    <Badge tone={partnerAgreementStatus.tone(agreement.status as PartnerAgreementStatus)}>{partnerAgreementStatus.label(agreement.status as PartnerAgreementStatus)}</Badge>
                    גרסה {agreement.version}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-sm text-ink-3">עוד לא נוצר — טיוטה מלאה מוכנה בלחיצה</span>
                )}
              </span>
              <ArrowLeft className="mt-1 size-4 text-ink-3 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          )}

          {seeMoney && (
            <Link href="/business/expenses" className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-4 text-sm shadow-1 hover:border-line-strong">
              <Receipt className="size-5 text-ink-3" aria-hidden />
              <span className="flex-1 text-ink-2">כל ההוצאות והמנויים</span>
              <ArrowLeft className="size-4 text-ink-3 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
