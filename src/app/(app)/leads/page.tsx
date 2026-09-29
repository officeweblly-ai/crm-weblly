import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, Ltr, MobileCard, MobileList, Money, PageHeader, Pagination, TableShell, Td, Th, Tr } from "@/components/ui/misc";
import { LeadFormModal } from "@/components/leads/lead-form";
import { listLeads } from "@/lib/data/leads";
import { leadSource, leadStatus, projectType } from "@/lib/domain/labels";
import { daysUntil, formatDate, formatPhone, relativeDue } from "@/lib/format";
import { first, parsePage } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "לידים" };

function FollowUp({ date, closed }: { date: string | null; closed: boolean }) {
  if (!date) return <span className="text-ink-3">—</span>;
  const d = daysUntil(date) ?? 0;
  return <span className={cn(!closed && d < 0 && "font-medium text-danger", !closed && d === 0 && "font-medium text-warn")}>{relativeDue(date)}</span>;
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  await requireArea("leads");
  const sp = await searchParams;
  const filters = { q: first(sp.q), status: first(sp.status), source: first(sp.source), sort: first(sp.sort), page: parsePage(sp.page) };
  const { rows, total, pageSize } = await listLeads(filters);
  const filtered = Boolean(filters.q || filters.status || filters.source);

  const hrefFor = (page: number) => {
    const u = new URLSearchParams(Object.entries({ ...filters, page: String(page) }).filter(([, v]) => v) as [string, string][]);
    return `/leads?${u}`;
  };

  return (
    <>
      <PageHeader
        title="לידים"
        description="פניות שעוד לא הפכו ללקוחות. כשליד נסגר — הופכים אותו ללקוח בלחיצה."
        actions={
          <LeadFormModal
            defaultOpen={first(sp.new) === "1"}
            trigger={
              <Button>
                <Plus aria-hidden />
                ליד חדש
              </Button>
            }
          />
        }
      />

      <ListToolbar
        searchPlaceholder="חיפוש לפי שם, עסק, טלפון או אימייל"
        filters={[
          { name: "status", label: "סטטוס", options: [{ value: "open", label: "פתוחים בלבד" }, ...leadStatus.list] },
          { name: "source", label: "מקור", options: leadSource.list },
        ]}
        sorts={[
          { value: "newest", label: "החדשים ביותר" },
          { value: "follow_up", label: "לפי תאריך מעקב" },
          { value: "value", label: "לפי מחיר משוער" },
          { value: "name", label: "לפי שם" },
        ]}
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface">
          {filtered ? (
            <EmptyState icon={Inbox} title="לא נמצאו לידים" description="נסה לשנות את החיפוש או לנקות את הסינון." />
          ) : (
            <EmptyState
              icon={Inbox}
              title="עוד אין לידים"
              description="כל פנייה חדשה — מהאתר, מהמלצה או מאינסטגרם — נכנסת לכאן כדי שלא תלך לאיבוד."
              action={
                <LeadFormModal
                  trigger={
                    <Button>
                      <Plus aria-hidden />
                      הוספת ליד ראשון
                    </Button>
                  }
                />
              }
            />
          )}
        </div>
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>שם</Th>
                <Th>טלפון</Th>
                <Th>סוג פרויקט</Th>
                <Th>מחיר משוער</Th>
                <Th>מקור</Th>
                <Th>סטטוס</Th>
                <Th>מעקב</Th>
                <Th>נוצר</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <Tr key={l.id}>
                  <Td>
                    <Link href={`/leads/${l.id}`} className="font-medium text-ink hover:text-accent">
                      {l.name}
                    </Link>
                    {l.business_name && <div className="text-xs text-ink-3">{l.business_name}</div>}
                  </Td>
                  <Td className="font-mono text-[13px]">{l.phone ? <Ltr>{formatPhone(l.phone)}</Ltr> : "—"}</Td>
                  <Td>{projectType.label(l.project_type) || "—"}</Td>
                  <Td>{l.estimated_value != null ? <Money value={l.estimated_value} /> : "—"}</Td>
                  <Td>{leadSource.label(l.source)}</Td>
                  <Td>
                    <Badge tone={leadStatus.tone(l.status)}>{leadStatus.label(l.status)}</Badge>
                  </Td>
                  <Td>
                    <FollowUp date={l.follow_up_date} closed={l.status === "converted" || l.status === "lost"} />
                  </Td>
                  <Td className="text-ink-3">{formatDate(l.created_at.slice(0, 10), { short: true })}</Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>

          <MobileList>
            {rows.map((l) => (
              <MobileCard key={l.id} href={`/leads/${l.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{l.name}</div>
                    <div className="truncate text-sm text-ink-3">{[l.business_name, projectType.label(l.project_type)].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <Badge tone={leadStatus.tone(l.status)}>{leadStatus.label(l.status)}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-ink-2">{l.estimated_value != null ? <Money value={l.estimated_value} /> : <span className="text-ink-3">ללא מחיר</span>}</span>
                  <span className="text-ink-3">
                    {l.follow_up_date ? (
                      <>
                        מעקב: <FollowUp date={l.follow_up_date} closed={l.status === "converted" || l.status === "lost"} />
                      </>
                    ) : (
                      leadSource.label(l.source)
                    )}
                  </span>
                </div>
              </MobileCard>
            ))}
          </MobileList>

          <Pagination page={filters.page} total={total} pageSize={pageSize} hrefFor={hrefFor} />
        </>
      )}
    </>
  );
}
