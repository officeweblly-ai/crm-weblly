import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { EmptyState, MobileCard, MobileList, Money, PageHeader, TableShell, Td, Th, Tr } from "@/components/ui/misc";
import { proposalStatus, type ProposalStatus } from "@/lib/domain/labels";
import { formatDate, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { first, searchPattern } from "@/lib/utils";
import { requireArea } from "@/lib/auth";

export const metadata = { title: "הצעות מחיר" };

export default async function ProposalsPage({ searchParams }: PageProps<"/proposals">) {
  await requireArea("proposals");
  const sp = await searchParams;
  const status = first(sp.status);
  const q = first(sp.q);
  const supabase = await createClient();
  let query = supabase.from("proposals").select("id, number, title, status, price, sent_at, created_at, valid_until, clients(id, name, business_name)").order("created_at", { ascending: false }).limit(300);
  if (status === "open") query = query.in("status", ["sent", "viewed"]);
  else if (status && (proposalStatus.values as string[]).includes(status)) query = query.eq("status", status as ProposalStatus);
  if (q) query = query.ilike("title", searchPattern(q));
  const { data: rows } = await query;
  const list = rows ?? [];
  const add = <Button asChild><Link href="/proposals/new"><Plus aria-hidden />הצעה חדשה</Link></Button>;

  return (
    <>
      <PageHeader title="הצעות מחיר" description="מהאפיון להצעה, מההצעה לפרויקט ולחוזה — בלי להקליד שוב." actions={add} />
      <ListToolbar
        searchPlaceholder="חיפוש הצעה"
        filters={[{ name: "status", label: "סטטוס", allLabel: "כל ההצעות", options: [{ value: "open", label: "ממתינות לתשובה" }, ...proposalStatus.list] }]}
      />
      {!list.length ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title={status || q ? "אין הצעות שמתאימות לסינון" : "עוד אין הצעות מחיר"}
            description="הכי מהיר: פותחים שאלון אפיון שהתקבל ולוחצים ״יצירת הצעת מחיר״ — ההצעה נבנית מהתשובות."
            action={add}
          />
        </Card>
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <Th>הצעה</Th>
                <Th>לקוח</Th>
                <Th>מחיר</Th>
                <Th>נשלחה</Th>
                <Th>סטטוס</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/proposals/${p.id}`} className="font-medium text-ink hover:text-accent">{p.title}</Link>
                    {p.number && <div className="font-mono text-xs text-ink-3"><bdi dir="ltr">{p.number}</bdi></div>}
                  </Td>
                  <Td>{p.clients ? <Link href={`/clients/${p.clients.id}`} className="hover:text-accent">{p.clients.business_name || p.clients.name}</Link> : "—"}</Td>
                  <Td><Money value={p.price} /></Td>
                  <Td className="text-ink-3">{p.sent_at ? timeAgo(p.sent_at) : "—"}{p.valid_until && <div className="text-xs">בתוקף עד {formatDate(p.valid_until, { short: true })}</div>}</Td>
                  <Td><Badge tone={proposalStatus.tone(p.status as ProposalStatus)}>{proposalStatus.label(p.status as ProposalStatus)}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
          <MobileList>
            {list.map((p) => (
              <MobileCard key={p.id} href={`/proposals/${p.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink">{p.title}</div>
                    <div className="truncate text-sm text-ink-3">{p.clients?.business_name || p.clients?.name}</div>
                  </div>
                  <Badge tone={proposalStatus.tone(p.status as ProposalStatus)}>{proposalStatus.label(p.status as ProposalStatus)}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <Money value={p.price} className="font-medium text-ink" />
                  <span className="text-ink-3">{p.sent_at ? `נשלחה ${timeAgo(p.sent_at)}` : "טיוטה"}</span>
                </div>
              </MobileCard>
            ))}
          </MobileList>
        </>
      )}
    </>
  );
}
