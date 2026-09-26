import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, Ltr, MobileCard, MobileList, Money, PageHeader, Pagination, TableShell, Td, Th, Tr } from "@/components/ui/misc";
import { ClientFormModal } from "@/components/clients/client-form";
import { listClients } from "@/lib/data/crm";
import { clientStatus, projectStatus, submissionStatus } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/format";
import { first, parsePage } from "@/lib/utils";

export const metadata = { title: "לקוחות" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const sp = await searchParams;
  const f = { q: first(sp.q), status: first(sp.status), sort: first(sp.sort), page: parsePage(sp.page) };
  const { rows, total, pageSize } = await listClients(f);
  const filtered = Boolean(f.q || f.status);
  const hrefFor = (page: number) => `/clients?${new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][])}`;

  const newButton = (label: string) => (
    <ClientFormModal
      trigger={
        <Button>
          <Plus aria-hidden />
          {label}
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="לקוחות"
        description="כל הלקוחות — נוכחיים ועבר. כל תיק מרכז פרויקטים, אפיון, קבצים, תשלומים והיסטוריה."
        actions={<ClientFormModal defaultOpen={first(sp.new) === "1"} trigger={<Button><Plus aria-hidden />לקוח חדש</Button>} />}
      />
      <ListToolbar
        searchPlaceholder="שם, עסק, טלפון או אימייל"
        filters={[
          {
            name: "status",
            label: "סטטוס",
            allLabel: "ללא ארכיון",
            options: [
              { value: "all", label: "כל הלקוחות (כולל ארכיון)" },
              { value: "current", label: "לקוחות נוכחיים" },
              { value: "past", label: "לקוחות עבר" },
              ...clientStatus.list,
            ],
          },
        ]}
        sorts={[
          { value: "newest", label: "החדשים ביותר" },
          { value: "updated", label: "עודכנו לאחרונה" },
          { value: "name", label: "לפי שם" },
        ]}
      />
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface">
          {filtered ? (
            <EmptyState icon={Users} title="לא נמצאו לקוחות" description="נסה חיפוש אחר או נקה את הסינון." />
          ) : (
            <EmptyState
              icon={Users}
              title="עוד אין לקוחות"
              description="פתח תיק ללקוח הראשון — או הפוך ליד קיים ללקוח בלחיצה אחת."
              action={newButton("יצירת לקוח ראשון")}
            />
          )}
        </div>
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>לקוח</Th>
                <Th>טלפון</Th>
                <Th>אימייל</Th>
                <Th>פרויקט נוכחי</Th>
                <Th>אפיון</Th>
                <Th>שולם</Th>
                <Th>יתרה</Th>
                <Th>סטטוס</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/clients/${c.id}`} className="font-medium text-ink hover:text-accent">
                      {c.name}
                    </Link>
                    {c.business_name && <div className="text-xs text-ink-3">{c.business_name}</div>}
                  </Td>
                  <Td className="font-mono text-[13px]">{c.phone ? <Ltr>{formatPhone(c.phone)}</Ltr> : "—"}</Td>
                  <Td className="max-w-48 truncate font-mono text-[13px]">{c.email ? <Ltr>{c.email}</Ltr> : "—"}</Td>
                  <Td>
                    {c.currentProject ? (
                      <Link href={`/projects/${c.currentProject.id}`} className="group/p block max-w-52">
                        <span className="block truncate text-ink group-hover/p:text-accent">{c.currentProject.name}</span>
                        <span className="text-xs text-ink-3">{projectStatus.label(c.currentProject.status)}</span>
                      </Link>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </Td>
                  <Td>
                    {c.questionnaire ? (
                      <Link href={`/questionnaires/${c.questionnaire.id}`}>
                        <Badge tone={submissionStatus.tone(c.questionnaire.status)}>{submissionStatus.label(c.questionnaire.status)}</Badge>
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-3">לא נשלח</span>
                    )}
                  </Td>
                  <Td><Money value={c.financials?.amount_paid ?? 0} /></Td>
                  <Td className={(c.financials?.balance_due ?? 0) > 0 ? "font-medium text-ink" : "text-ink-3"}>
                    <Money value={c.financials?.balance_due ?? 0} />
                  </Td>
                  <Td><Badge tone={clientStatus.tone(c.status)}>{clientStatus.label(c.status)}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
          <MobileList>
            {rows.map((c) => (
              <MobileCard key={c.id} href={`/clients/${c.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{c.name}</div>
                    <div className="truncate text-sm text-ink-3">{c.business_name ?? (c.phone ? formatPhone(c.phone) : "—")}</div>
                  </div>
                  <Badge tone={clientStatus.tone(c.status)}>{clientStatus.label(c.status)}</Badge>
                </div>
                {c.currentProject && (
                  <p className="mt-2 truncate text-sm text-ink-2">
                    {c.currentProject.name} · <span className="text-ink-3">{projectStatus.label(c.currentProject.status)}</span>
                  </p>
                )}
                {(c.financials?.project_count ?? 0) > 0 && (
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-ink-3">{c.questionnaire ? `אפיון: ${submissionStatus.label(c.questionnaire.status)}` : "אפיון לא נשלח"}</span>
                    <span className="text-ink-2">
                      יתרה <Money value={c.financials?.balance_due ?? 0} className="font-medium" />
                    </span>
                  </div>
                )}
              </MobileCard>
            ))}
          </MobileList>
          <Pagination page={f.page} total={total} pageSize={pageSize} hrefFor={hrefFor} />
        </>
      )}
    </>
  );
}
