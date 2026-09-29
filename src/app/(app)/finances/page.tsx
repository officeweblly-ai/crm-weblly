import Link from "next/link";
import { Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/link-tabs";
import { EmptyState, MobileCard, MobileList, Money, PageHeader, Pagination, StatCard, TableShell, Td, Th, Tr } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { PaymentFormModal } from "@/components/payments/payment-form";
import { PaymentsTable, type PaymentRow } from "@/components/payments/payments-table";
import { listProjects } from "@/lib/data/crm";
import { createClient } from "@/lib/supabase/server";
import { paymentMethod, projectStatus, type PaymentMethod } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/format";
import { first, pageRange, parsePage, PAGE_SIZE } from "@/lib/utils";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "כספים" };

export default async function FinancesPage({ searchParams }: PageProps<"/finances">) {
  await requireArea("finances");
  const sp = await searchParams;
  const view = first(sp.view) === "outstanding" ? "outstanding" : "payments";
  const supabase = await createClient();
  const [{ data: m }, { data: totals }, { rows: projects }] = await Promise.all([
    supabase.rpc("dashboard_metrics"),
    supabase.from("project_financials").select("amount_paid, balance_due, total_price"),
    listProjects({ page: 1, all: true, sort: "updated" }),
  ]);
  const metrics = (m ?? {}) as Record<string, number>;
  const receivedAll = (totals ?? []).reduce((s, r) => s + Number(r.amount_paid), 0);
  const projectOpts = projects.map((p) => ({ value: p.id, label: `${p.name} · ${p.client?.name ?? ""}`, balance: p.financials?.balance_due }));

  const add = (autoOpen = false) => (
    <PaymentFormModal projects={projectOpts} defaultOpen={autoOpen && first(sp.new) === "1"} closeHref="/finances" trigger={<Button><Plus aria-hidden />רישום תשלום</Button>} />
  );

  return (
    <>
      <PageHeader title="כספים" description="מעקב תשלומים ויתרות. כל הסכומים מחושבים מהתשלומים שנרשמו." actions={add(true)} />
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="הכנסות החודש" value={<bdi dir="ltr">{formatMoney(metrics.revenue_this_month)}</bdi>} />
        <StatCard label="החודש הקודם" value={<bdi dir="ltr">{formatMoney(metrics.revenue_last_month)}</bdi>} />
        <StatCard label="יתרות פתוחות" value={<bdi dir="ltr">{formatMoney(metrics.outstanding_balance)}</bdi>} href="/finances?view=outstanding" />
        <StatCard label="סה״כ התקבל" value={<bdi dir="ltr">{formatMoney(receivedAll)}</bdi>} hint="מכל הפרויקטים" />
      </section>
      <LinkTabs
        tabs={[{ key: "payments", label: "היסטוריית תשלומים" }, { key: "outstanding", label: "יתרות לגבייה" }]}
        active={view}
        hrefFor={(k) => (k === "payments" ? "/finances" : "/finances?view=outstanding")}
      />
      {view === "payments" ? <Payments sp={sp} add={add()} hasProjects={projects.length > 0} /> : <Outstanding projects={projects} />}
    </>
  );
}

async function Payments({ sp, add, hasProjects }: { sp: Record<string, string | string[] | undefined>; add: React.ReactNode; hasProjects: boolean }) {
  const supabase = await createClient();
  const page = parsePage(sp.page);
  const method = first(sp.method);
  const month = first(sp.month); // YYYY-MM
  let q = supabase.from("payments").select("*, projects!inner(id, name, client_id)", { count: "exact" }).order("paid_at", { ascending: false }).order("created_at", { ascending: false });
  if (method && (paymentMethod.values as string[]).includes(method)) q = q.eq("method", method as PaymentMethod);
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, mo] = month.split("-").map(Number);
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    q = q.gte("paid_at", `${month}-01`).lt("paid_at", next);
  }
  const [from, to] = pageRange(page);
  const { data, count } = await q.range(from, to);
  const rows = (data ?? []) as PaymentRow[];
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { value: v, label: new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" }).format(d) };
  });
  const hrefFor = (p: number) => `/finances?${new URLSearchParams(Object.entries({ method, month, page: String(p) }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <ListToolbar filters={[{ name: "month", label: "חודש", allLabel: "כל החודשים", options: months }, { name: "method", label: "אמצעי", options: paymentMethod.list }]} />
      {rows.length ? (
        <>
          <PaymentsTable payments={rows} />
          <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} hrefFor={hrefFor} />
        </>
      ) : (
        <Card>
          <EmptyState
            icon={Receipt}
            title={method || month ? "אין תשלומים בסינון הזה" : "עוד לא נרשמו תשלומים"}
            description={hasProjects ? "כשלקוח משלם — מקדמה, תשלום ביניים או יתרה — רושמים כאן והיתרה מתעדכנת." : "קודם פותחים פרויקט עם מחיר, ואז רושמים תשלומים."}
            action={method || month ? undefined : hasProjects ? add : <Button asChild><Link href="/projects?new=1">פרויקט חדש</Link></Button>}
          />
        </Card>
      )}
    </>
  );
}

function Outstanding({ projects }: { projects: Awaited<ReturnType<typeof listProjects>>["rows"] }) {
  const rows = projects.filter((p) => (p.financials?.balance_due ?? 0) > 0 && p.status !== "lead").sort((a, b) => (b.financials?.balance_due ?? 0) - (a.financials?.balance_due ?? 0));
  if (!rows.length)
    return (
      <Card>
        <EmptyState icon={Receipt} title="אין יתרות פתוחות" description="כל הפרויקטים הפעילים שולמו במלואם." />
      </Card>
    );
  return (
    <>
      <TableShell>
        <thead>
          <tr>
            <Th>פרויקט</Th>
            <Th>לקוח</Th>
            <Th>שלב</Th>
            <Th>מחיר</Th>
            <Th>שולם</Th>
            <Th>יתרה</Th>
            <Th>מקדמה</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <Tr key={p.id}>
              <Td><Link href={`/projects/${p.id}`} className="font-medium text-ink hover:text-accent">{p.name}</Link></Td>
              <Td>{p.client && <Link href={`/clients/${p.client.id}?tab=finances`} className="hover:text-accent">{p.client.name}</Link>}</Td>
              <Td><Badge tone={projectStatus.tone(p.status)}>{projectStatus.label(p.status)}</Badge></Td>
              <Td><Money value={p.total_price} /></Td>
              <Td className="text-ok"><Money value={p.financials?.amount_paid ?? 0} /></Td>
              <Td className="font-semibold text-ink"><Money value={p.financials?.balance_due ?? 0} /></Td>
              <Td>{p.deposit_amount > 0 ? (p.financials?.deposit_covered ? <span className="text-ok">שולמה</span> : <span className="font-medium text-warn">לא שולמה</span>) : <span className="text-ink-3">—</span>}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <MobileList>
        {rows.map((p) => (
          <MobileCard key={p.id} href={`/projects/${p.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{p.name}</div>
                <div className="truncate text-sm text-ink-3">{p.client?.name}</div>
              </div>
              <Money value={p.financials?.balance_due ?? 0} className="text-lg font-semibold text-ink" />
            </div>
            <div className="mt-2 text-sm text-ink-3">
              שולם <Money value={p.financials?.amount_paid ?? 0} /> מתוך <Money value={p.total_price} />
              {p.deposit_amount > 0 && !p.financials?.deposit_covered && <span className="font-medium text-warn"> · מקדמה לא שולמה</span>}
            </div>
          </MobileCard>
        ))}
      </MobileList>
      <Card className="mt-4">
        <CardHeader title={`סה״כ לגבייה: ${formatMoney(rows.reduce((s, p) => s + (p.financials?.balance_due ?? 0), 0))}`} description="פרויקטים בשלב 'ליד' לא נכללים — עדיין אין התחייבות." />
      </Card>
    </>
  );
}
