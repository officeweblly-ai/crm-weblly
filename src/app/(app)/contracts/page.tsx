import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState, MobileCard, MobileList, PageHeader, SectionTitle, TableShell, Td, Th, Tr } from "@/components/ui/misc";
import { PdfButton } from "@/components/ui/pdf-button";
import { Button } from "@/components/ui/button";
import { CopyLinkButton, CreatePartnershipButton } from "@/components/agreement/agreement-actions";
import { requireStaff } from "@/lib/auth";
import { listContracts } from "@/lib/data/crm";
import { contractStatus, partnerAgreementStatus, type ContractStatus, type PartnerAgreementStatus } from "@/lib/domain/labels";
import { can } from "@/lib/domain/permissions";
import { partnerAgreementSchema, signingSummary } from "@/lib/domain/partners";
import { formatDate, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { FileSignature } from "lucide-react";

export const metadata = { title: "חוזים" };

type Row = {
  key: string;
  href: string;
  name: string;
  type: string;
  parties: string;
  status: { label: string; tone: ReturnType<typeof contractStatus.tone> };
  signed: string;
  updatedAt: string;
  link: string | null;
  pdf: { path: string; name: string } | null;
};

/** Every agreement in one place: the partnership agreement and client contracts. */
export default async function ContractsPage() {
  const viewer = await requireStaff();
  const seePartners = can(viewer.access, "partners");
  const seeClients = can(viewer.access, "contracts");
  const supabase = await createClient();

  const [partnerships, clientContracts] = await Promise.all([
    seePartners
      ? supabase.from("partner_agreements").select("id, title, content, version, status, sign_token, updated_at").order("created_at", { ascending: false }).then((r) => r.data ?? [])
      : [],
    seeClients ? listContracts({}) : [],
  ]);

  // Who has signed the current version of each partnership agreement.
  const ids = partnerships.map((a) => a.id);
  const { data: sigs } = ids.length
    ? await supabase.from("partner_agreement_signatures").select("agreement_id, version, party_key, signed_at").in("agreement_id", ids).is("replaced_at", null)
    : { data: [] };

  const internal: Row[] = partnerships.map((a) => {
    const content = partnerAgreementSchema.safeParse(a.content).data;
    const mine = (sigs ?? []).filter((s) => s.agreement_id === a.id && s.version === a.version);
    const sum = content ? signingSummary(content.parties, mine.map((s) => s.party_key ?? "")) : null;
    const status = a.status as PartnerAgreementStatus;
    return {
      key: a.id,
      href: `/contracts/partnership/${a.id}`,
      name: "הסכם שותפות WEBLLY",
      type: `הסכם שותפות · גרסה ${a.version}`,
      parties: content ? content.parties.map((p) => p.name).join(" · ") : "",
      status: { label: partnerAgreementStatus.label(status), tone: partnerAgreementStatus.tone(status) },
      signed: sum ? (sum.state === "signed" ? `${mine.length}/${content!.parties.length} · נחתם במלואו` : `${mine.length}/${content!.parties.length} · ${sum.waiting}`) : "",
      updatedAt: a.updated_at,
      link: a.sign_token ? `/agreement/${a.sign_token}` : null,
      pdf: a.sign_token ? { path: `/agreement/${a.sign_token}`, name: `הסכם שותפות WEBLLY — גרסה ${a.version}` } : null,
    };
  });

  const clients: Row[] = clientContracts.map((c) => {
    const status = c.status as ContractStatus;
    return {
      key: c.id,
      href: `/contracts/${c.id}`,
      name: c.title,
      type: c.content ? "הסכם לקוח" : "הסכם לקוח · קובץ",
      parties: `WEBLLY · ${c.clients?.name ?? "לקוח"}`,
      status: { label: contractStatus.label(status), tone: contractStatus.tone(status) },
      signed: status === "signed" ? (c.signed_at ? `נחתם ${formatDate(c.signed_at)}` : "נחתם") : status === "sent" ? "ממתין לחתימת הלקוח" : "—",
      updatedAt: c.updated_at,
      link: c.sign_token && status === "sent" ? `/s/${c.sign_token}` : null,
      pdf: c.content ? { path: `/contracts/${c.id}`, name: c.title } : null,
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="חוזים" description="הסכם השותפות וחוזי הלקוחות — סטטוס, חתימות, קישור לחתימה ו-PDF." />

      {seePartners && (
        <section>
          <SectionTitle>הסכמים בין השותפים</SectionTitle>
          {internal.length ? (
            <RowsView rows={internal} />
          ) : (
            <div className="rounded-lg border border-line bg-surface shadow-1">
            <EmptyState
              icon={FileSignature}
              title="הסכם השותפות עוד לא נוצר"
              description="ההסכם בין ינאי מזרחי לנויה גאולה, עם הנוסח המלא. אחרי היצירה מקבלים קישור חתימה אחד לשניכם."
              action={<CreatePartnershipButton />}
            />
            </div>
          )}
        </section>
      )}

      {seeClients && (
        <section>
          <SectionTitle>חוזי לקוחות</SectionTitle>
          {clients.length ? (
            <RowsView rows={clients} />
          ) : (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">אין עדיין חוזי לקוחות. יוצרים חוזה מתוך תיק הלקוח או הפרויקט.</p>
          )}
        </section>
      )}
    </div>
  );
}

function RowsView({ rows }: { rows: Row[] }) {
  return (
    <>
      <TableShell>
        <thead>
          <tr>
            <Th>שם</Th>
            <Th>סוג</Th>
            <Th>צדדים</Th>
            <Th>סטטוס</Th>
            <Th>חתימות</Th>
            <Th>עודכן</Th>
            <Th className="text-end">פעולות</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.key}>
              <Td>
                <Link href={r.href} className="font-medium text-ink hover:underline">
                  {r.name}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">{r.type}</Td>
              <Td>{r.parties}</Td>
              <Td>
                <Badge tone={r.status.tone}>{r.status.label}</Badge>
              </Td>
              <Td className="text-xs">{r.signed}</Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(r.updatedAt)}</Td>
              <Td>
                <RowActions row={r} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <MobileList>
        {rows.map((r) => (
          <MobileCard key={r.key}>
            <div className="flex items-start justify-between gap-3">
              <Link href={r.href} className="min-w-0 font-semibold text-ink">
                {r.name}
              </Link>
              <Badge tone={r.status.tone}>{r.status.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-2">{r.parties}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              {r.type} · {r.signed} · עודכן {formatDateTime(r.updatedAt)}
            </p>
            <div className="mt-3">
              <RowActions row={r} />
            </div>
          </MobileCard>
        ))}
      </MobileList>
    </>
  );
}

function RowActions({ row }: { row: Row }) {
  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      <Button asChild size="sm" variant="secondary">
        <Link href={row.href}>פתיחה</Link>
      </Button>
      {row.link && <CopyLinkButton path={row.link} />}
      {row.pdf && <PdfButton path={row.pdf.path} name={row.pdf.name} label="PDF" variant="ghost" size="sm" />}
    </div>
  );
}
